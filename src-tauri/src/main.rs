#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const KEYRING_SERVICE: &str = "com.echograph.app";
const KEYRING_ACCOUNT: &str = "openai_api_key";
const OPENAI_CHAT_COMPLETIONS_URL: &str = "https://api.openai.com/v1/chat/completions";
const OPENAI_DEFAULT_MODEL: &str = "gpt-4o-mini";

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentSuggestion {
    content: String,
    note: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiChatCompletionResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAiMessage {
    content: Value,
}

#[derive(Debug, Deserialize)]
struct OpenAiErrorEnvelope {
    error: OpenAiErrorBody,
}

#[derive(Debug, Deserialize)]
struct OpenAiErrorBody {
    message: String,
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

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| format!("Failed to initialize keychain entry: {error}"))
}

fn normalize_api_key(raw_key: &str) -> Result<String, String> {
    let trimmed = raw_key.trim();

    if trimmed.is_empty() {
        return Err("OpenAI API key cannot be empty.".to_string());
    }

    Ok(trimmed.to_string())
}

fn read_openai_api_key() -> Result<String, String> {
    let entry = keyring_entry()?;

    match entry.get_password() {
        Ok(value) => normalize_api_key(&value),
        Err(keyring::Error::NoEntry) => {
            Err("OpenAI API key is not configured. Add your key in the app first.".to_string())
        }
        Err(error) => Err(format!(
            "Failed to read OpenAI API key from your keychain: {error}"
        )),
    }
}

fn system_prompt_for_agent(agent_kind: &str) -> Result<&'static str, String> {
    match agent_kind {
        "expander" => Ok(
            "You are the Expander agent for a brainstorming graph. Return concise, adjacent ideas that add new angles without repeating existing nodes. Respond with valid JSON matching the schema.",
        ),
        "critic" => Ok(
            "You are the Critic agent for a brainstorming graph. Return a constructive challenge or risk that pressure-tests the selected idea. Respond with valid JSON matching the schema.",
        ),
        _ => Err("Unsupported agent kind. Use expander or critic.".to_string()),
    }
}

fn build_agent_prompt(
    agent_kind: &str,
    session: &BrainstormSession,
    selected_node_id: &str,
) -> Result<String, String> {
    let selected_node = session
        .nodes
        .iter()
        .find(|node| node.id == selected_node_id)
        .ok_or_else(|| "Selected node was not found in the current session.".to_string())?;

    let parent_id = session
        .edges
        .iter()
        .find(|edge| edge.target == selected_node_id)
        .map(|edge| edge.source.clone());
    let child_ids = session
        .edges
        .iter()
        .filter(|edge| edge.source == selected_node_id)
        .map(|edge| edge.target.clone())
        .collect::<Vec<_>>();

    let context = json!({
        "agentKind": agent_kind,
        "sessionId": session.id,
        "sessionTitle": session.title,
        "selectedNode": {
            "id": selected_node.id,
            "kind": selected_node.kind,
            "content": selected_node.content,
            "note": selected_node.note,
            "parentId": parent_id,
            "childIds": child_ids,
        },
        "graph": {
            "nodes": session.nodes,
            "edges": session.edges,
        }
    });

    let context_text = serde_json::to_string_pretty(&context)
        .map_err(|error| format!("Failed to serialize graph context: {error}"))?;

    let instruction = if agent_kind == "expander" {
        "Generate one adjacent branch idea that is concrete and distinct from existing branches."
    } else {
        "Generate one constructive challenge that identifies a blind spot, risk, or assumption to test."
    };

    Ok(format!(
        "{}\n\nConstraints:\n- content: max 90 characters\n- note: max 180 characters\n- no markdown\n\nGraph context JSON:\n{}",
        instruction, context_text
    ))
}

fn extract_openai_content(content: &Value) -> Result<String, String> {
    if let Some(text) = content.as_str() {
        return Ok(text.to_string());
    }

    if let Some(parts) = content.as_array() {
        let joined = parts
            .iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n");

        if !joined.trim().is_empty() {
            return Ok(joined);
        }
    }

    Err("OpenAI returned an unsupported response content format.".to_string())
}

#[tauri::command]
fn has_openai_api_key() -> Result<bool, String> {
    let entry = keyring_entry()?;

    match entry.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!(
            "Failed to check OpenAI API key status in keychain: {error}"
        )),
    }
}

#[tauri::command]
fn set_openai_api_key(api_key: String) -> Result<(), String> {
    let normalized_key = normalize_api_key(&api_key)?;
    let entry = keyring_entry()?;

    entry
        .set_password(&normalized_key)
        .map_err(|error| format!("Failed to save OpenAI API key in keychain: {error}"))
}

#[tauri::command]
fn clear_openai_api_key() -> Result<(), String> {
    let entry = keyring_entry()?;

    match entry.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Failed to remove OpenAI API key from keychain: {error}"
        )),
    }
}

#[tauri::command]
async fn generate_agent_suggestion(
    agent_kind: String,
    session: BrainstormSession,
    selected_node_id: String,
) -> Result<AgentSuggestion, String> {
    let api_key = read_openai_api_key()?;
    let system_prompt = system_prompt_for_agent(&agent_kind)?;
    let user_prompt = build_agent_prompt(&agent_kind, &session, &selected_node_id)?;

    let request_body = json!({
        "model": OPENAI_DEFAULT_MODEL,
        "temperature": if agent_kind == "expander" { 0.9 } else { 0.45 },
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
            }
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "echograph_agent_suggestion",
                "strict": true,
                "schema": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "content": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 90
                        },
                        "note": {
                            "type": "string",
                            "minLength": 1,
                            "maxLength": 180
                        }
                    },
                    "required": ["content", "note"]
                }
            }
        }
    });

    let client = reqwest::Client::new();
    let response = client
        .post(OPENAI_CHAT_COMPLETIONS_URL)
        .bearer_auth(api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|error| format!("Failed to contact OpenAI API: {error}"))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|error| format!("Failed to read OpenAI API response body: {error}"))?;

    if !status.is_success() {
        let openai_error = serde_json::from_str::<OpenAiErrorEnvelope>(&body_text)
            .ok()
            .map(|payload| payload.error.message)
            .unwrap_or_else(|| body_text.clone());

        return Err(format!(
            "OpenAI API request failed ({}): {}",
            status.as_u16(),
            openai_error
        ));
    }

    let payload = serde_json::from_str::<OpenAiChatCompletionResponse>(&body_text)
        .map_err(|error| format!("Failed to parse OpenAI API response: {error}"))?;

    let first_choice = payload
        .choices
        .first()
        .ok_or_else(|| "OpenAI API returned no choices.".to_string())?;
    let content_text = extract_openai_content(&first_choice.message.content)?;
    let suggestion = serde_json::from_str::<AgentSuggestion>(&content_text)
        .map_err(|error| format!("Failed to parse structured suggestion JSON: {error}"))?;

    let content = suggestion.content.trim().to_string();
    let note = suggestion.note.trim().to_string();

    if content.is_empty() || note.is_empty() {
        return Err("OpenAI returned empty suggestion fields.".to_string());
    }

    Ok(AgentSuggestion { content, note })
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
            has_openai_api_key,
            set_openai_api_key,
            clear_openai_api_key,
            generate_agent_suggestion,
            list_sessions,
            save_session_to_file,
            load_session_from_file,
            open_sessions_directory,
            reveal_session_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("error while running EchoGraph");
}
