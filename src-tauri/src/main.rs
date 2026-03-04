#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Position {
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionNode {
    id: String,
    kind: String,
    content: String,
    note: String,
    position: Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionEdge {
    id: String,
    source: String,
    target: String,
    relation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrainstormSession {
    id: String,
    title: String,
    created_at: String,
    updated_at: String,
    nodes: Vec<SessionNode>,
    edges: Vec<SessionEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionFilePayload {
    format: String,
    version: u8,
    saved_at: String,
    session: BrainstormSession,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSessionSummary {
    file_name: String,
    file_path: String,
    title: String,
    updated_at: String,
    session_id: String,
    saved_at: String,
}

fn sessions_directory() -> Result<PathBuf, String> {
    let base = dirs::document_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Unable to resolve a writable home directory.".to_string())?;

    Ok(base.join("EchoGraph").join("Sessions"))
}

fn ensure_sessions_directory() -> Result<PathBuf, String> {
    let dir = sessions_directory()?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create sessions directory: {error}"))?;
    Ok(dir)
}

fn sanitize_filename_component(value: &str) -> String {
    let mut normalized = String::new();
    let mut prev_dash = false;

    for character in value.chars() {
        let candidate = if character.is_ascii_alphanumeric() {
            Some(character.to_ascii_lowercase())
        } else if character == ' ' || character == '-' || character == '_' {
            Some('-')
        } else {
            None
        };

        if let Some(output_char) = candidate {
            if output_char == '-' {
                if prev_dash {
                    continue;
                }

                prev_dash = true;
                normalized.push(output_char);
            } else {
                prev_dash = false;
                normalized.push(output_char);
            }
        }
    }

    let trimmed = normalized.trim_matches('-');

    if trimmed.is_empty() {
        "session".to_string()
    } else {
        trimmed.chars().take(48).collect()
    }
}

fn default_file_name(session: &BrainstormSession) -> String {
    let slug = sanitize_filename_component(&session.title);
    let suffix: String = session
        .id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    let suffix = if suffix.is_empty() {
        "session".to_string()
    } else {
        suffix
    };
    format!("{slug}-{suffix}.echograph.json")
}

fn unique_session_file_path(dir: &Path, session: &BrainstormSession) -> PathBuf {
    let base_name = default_file_name(session);
    let base_path = dir.join(&base_name);

    if !base_path.exists() {
        return base_path;
    }

    let stem = base_name.trim_end_matches(".echograph.json");
    let mut index = 2;

    loop {
        let candidate = dir.join(format!("{stem}-{index}.echograph.json"));

        if !candidate.exists() {
            return candidate;
        }

        index += 1;
    }
}

fn payload_from_session(session: BrainstormSession) -> SessionFilePayload {
    SessionFilePayload {
        format: "echograph.session".to_string(),
        version: 1,
        saved_at: session.updated_at.clone(),
        session,
    }
}

fn summary_from_payload(path: &Path, payload: &SessionFilePayload) -> StoredSessionSummary {
    StoredSessionSummary {
        file_name: path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "session.echograph.json".to_string()),
        file_path: path.to_string_lossy().to_string(),
        title: payload.session.title.clone(),
        updated_at: payload.session.updated_at.clone(),
        session_id: payload.session.id.clone(),
        saved_at: payload.saved_at.clone(),
    }
}

fn parse_payload(content: &str) -> Result<SessionFilePayload, String> {
    if let Ok(payload) = serde_json::from_str::<SessionFilePayload>(content) {
        return Ok(payload);
    }

    let bare_session = serde_json::from_str::<BrainstormSession>(content)
        .map_err(|error| format!("Invalid session file format: {error}"))?;
    Ok(payload_from_session(bare_session))
}

fn open_path(path: &Path, reveal: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = if reveal {
        Command::new("open").arg("-R").arg(path).status()
    } else {
        Command::new("open").arg(path).status()
    };

    #[cfg(target_os = "windows")]
    let status = if reveal {
        Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .status()
    } else {
        Command::new("explorer").arg(path).status()
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = {
        let target = if reveal {
            path.parent().unwrap_or(path)
        } else {
            path
        };

        Command::new("xdg-open").arg(target).status()
    };

    let status = status.map_err(|error| format!("Failed to execute open command: {error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("Open command returned a non-zero status code.".to_string())
    }
}

#[tauri::command]
fn list_sessions() -> Result<Vec<StoredSessionSummary>, String> {
    let dir = ensure_sessions_directory()?;
    let entries = fs::read_dir(dir).map_err(|error| format!("Failed to read sessions: {error}"))?;
    let mut sessions = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(value) => value,
            Err(_) => continue,
        };
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let payload = match parse_payload(&content) {
            Ok(value) => value,
            Err(_) => continue,
        };

        sessions.push(summary_from_payload(&path, &payload));
    }

    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(sessions)
}

#[tauri::command]
fn save_session_to_file(
    session: BrainstormSession,
    file_path: Option<String>,
) -> Result<StoredSessionSummary, String> {
    let sessions_dir = ensure_sessions_directory()?;
    let target_path = file_path
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| unique_session_file_path(&sessions_dir, &session));

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to prepare save destination: {error}"))?;
    }

    let payload = payload_from_session(session);
    let content = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("Failed to serialize session: {error}"))?;
    fs::write(&target_path, content).map_err(|error| format!("Failed to write file: {error}"))?;

    Ok(summary_from_payload(&target_path, &payload))
}

#[tauri::command]
fn load_session_from_file(file_path: String) -> Result<BrainstormSession, String> {
    let path = PathBuf::from(file_path);
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read session file: {error}"))?;
    let payload = parse_payload(&content)?;
    Ok(payload.session)
}

#[tauri::command]
fn open_sessions_directory() -> Result<(), String> {
    let sessions_dir = ensure_sessions_directory()?;
    open_path(&sessions_dir, false)
}

#[tauri::command]
fn reveal_session_in_finder(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(file_path);

    if !path.exists() {
        return Err("Session file does not exist on disk.".to_string());
    }

    open_path(&path, true)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_sessions,
            save_session_to_file,
            load_session_from_file,
            open_sessions_directory,
            reveal_session_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("error while running EchoGraph");
}
