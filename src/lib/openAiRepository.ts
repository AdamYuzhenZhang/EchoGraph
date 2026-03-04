import { invoke } from "@tauri-apps/api/core";
import type { BrainstormSession } from "../types/session";

export type AgentKind = "expander" | "critic";

export type AgentSuggestion = {
  content: string;
  note: string;
};

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

export async function hasOpenAiApiKey() {
  if (!isTauriRuntime()) {
    return false;
  }

  return await invoke<boolean>("has_openai_api_key");
}

export async function saveOpenAiApiKey(apiKey: string) {
  if (!isTauriRuntime()) {
    throw new Error("Secure API key storage is available only in the desktop app.");
  }

  await invoke("set_openai_api_key", {
    apiKey
  });
}

export async function clearOpenAiApiKey() {
  if (!isTauriRuntime()) {
    throw new Error("Secure API key storage is available only in the desktop app.");
  }

  await invoke("clear_openai_api_key");
}

export async function generateAgentSuggestion(
  agentKind: AgentKind,
  session: BrainstormSession,
  selectedNodeId: string
) {
  if (!isTauriRuntime()) {
    throw new Error("OpenAI suggestions are available only in the desktop app.");
  }

  return await invoke<AgentSuggestion>("generate_agent_suggestion", {
    agentKind,
    session,
    selectedNodeId
  });
}
