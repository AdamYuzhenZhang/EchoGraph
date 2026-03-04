import { invoke } from "@tauri-apps/api/core";
import type {
  BrainstormSession,
  StoredSessionSummary
} from "../types/session";

type SessionFilePayload = {
  format: "echograph.session";
  version: 1;
  savedAt: string;
  session: BrainstormSession;
};

const LOCAL_STORAGE_KEY = "echograph.sessions.files.v1";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTauriRuntime() {
  return (
    typeof window !== "undefined" &&
    isObject(window) &&
    "__TAURI_INTERNALS__" in window
  );
}

function readLocalFileMap() {
  if (typeof window === "undefined") {
    return {} as Record<string, SessionFilePayload>;
  }

  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);

  if (!raw) {
    return {} as Record<string, SessionFilePayload>;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isObject(parsed)) {
      return {} as Record<string, SessionFilePayload>;
    }

    return parsed as Record<string, SessionFilePayload>;
  } catch {
    return {} as Record<string, SessionFilePayload>;
  }
}

function writeLocalFileMap(files: Record<string, SessionFilePayload>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(files));
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function localPathFor(session: BrainstormSession) {
  const slug = slugify(session.title) || "session";
  return `local://${slug}-${session.id}.echograph.json`;
}

function toSummary(filePath: string, payload: SessionFilePayload): StoredSessionSummary {
  const name = filePath.split("/").pop() ?? filePath;

  return {
    fileName: name,
    filePath,
    title: payload.session.title,
    updatedAt: payload.session.updatedAt,
    sessionId: payload.session.id,
    savedAt: payload.savedAt
  };
}

function byUpdatedAtDesc(a: StoredSessionSummary, b: StoredSessionSummary) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

export async function listStoredSessions() {
  if (isTauriRuntime()) {
    const sessions = await invoke<StoredSessionSummary[]>("list_sessions");
    return sessions.sort(byUpdatedAtDesc);
  }

  const files = readLocalFileMap();
  return Object.entries(files)
    .map(([path, payload]) => toSummary(path, payload))
    .sort(byUpdatedAtDesc);
}

export async function saveSessionToRepository(
  session: BrainstormSession,
  filePath: string | null
) {
  if (isTauriRuntime()) {
    return await invoke<StoredSessionSummary>("save_session_to_file", {
      session,
      filePath
    });
  }

  const files = readLocalFileMap();
  const resolvedPath = filePath ?? localPathFor(session);
  const payload: SessionFilePayload = {
    format: "echograph.session",
    version: 1,
    savedAt: session.updatedAt,
    session
  };
  files[resolvedPath] = payload;
  writeLocalFileMap(files);

  return toSummary(resolvedPath, payload);
}

export async function loadSessionFromRepository(filePath: string) {
  if (isTauriRuntime()) {
    return await invoke<BrainstormSession>("load_session_from_file", {
      filePath
    });
  }

  const files = readLocalFileMap();
  const payload = files[filePath];

  if (!payload) {
    throw new Error("Stored session was not found.");
  }

  return payload.session;
}

export async function openSessionsDirectoryInFinder() {
  if (isTauriRuntime()) {
    await invoke("open_sessions_directory");
  }
}

export async function revealSessionInFinder(filePath: string) {
  if (isTauriRuntime()) {
    await invoke("reveal_session_in_finder", { filePath });
  }
}
