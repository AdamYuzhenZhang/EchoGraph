# EchoGraph
Brainstorming with AI Agent Under Development

**EchoGraph** is an open-source, local-first, multi-agent brainstorming canvas. Instead of a passive mind-mapping tool or a standard linear chatbot, EchoGraph introduces proactive AI "thought partners" directly onto an infinite 2D workspace. 

As you build a mental map, an **Expander** agent asynchronously suggests divergent ideas via translucent "ghost nodes," while a **Critic** agent attaches constructive challenges to existing ideas to prevent echo chambers and idea homogenization.

## Core Features (MVP)

* **Infinite Canvas Engine:** A buttery-smooth, touch-friendly 2D workspace for brain-dumping. Double-click to create nodes, drag to connect.
* **The "Echo" Engine (Dual Agents):**
    *  **The Expander:** Monitors the graph's context. When a vector of thought is established, it injects "ghost nodes" nearby with adjacent, divergent ideas.
    *  **The Critic:** Evaluates leaf nodes and attaches red "Yes, but..." badges to challenge logical flaws or constraints.
* **Total User Agency:** The AI doesn't force changes. Click a ghost node to solidify it into your graph, or hit 'Delete' to dismiss it.
* **Bring Your Own Key (BYOK):** Absolute privacy. Enter your own OpenAI API key locally. Your data never hits a central proprietary server.
* **Local-First Storage:** Save and load your brainstorming sessions directly to your local file system as `.json` files.



## Tech Stack

EchoGraph is built using a modern, lightweight desktop architecture:

* **Frontend Framework:** React + TypeScript
* **Canvas Rendering:** [React Flow](https://reactflow.dev/) (`@xyflow/react`)
* **Desktop Wrapper:** [Tauri](https://tauri.app/) (Blazing fast, cross-platform native windows with minimal RAM usage)
* **State Management:** Zustand
* **AI Integration:** OpenAI API (Client-side REST calls utilizing Structured Outputs and Tool Calling)

## Data Model (Graph JSON)

To allow the LLM to "see" the board spatially, the React Flow state is serialized into a lightweight JSON structure that is passed into the System Prompt:

```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "user",
      "content": "Gamified Habit App",
      "position": { "x": 100, "y": 250 }
    }
  ],
  "edges": [
    {
      "source": "node-1",
      "target": "node-2"
    }
  ]
}
```

## Roadmap (Post-MVP)
* Interactive Clarification Agent: Agents can identify missing context or ambiguities in the graph and actively prompt the user with multiple-choice questions (e.g., "Are we targeting enterprise or consumers?") with clickable options to instantly steer the session.

* Local LLM Support: Integrate with Ollama to run agents entirely locally (e.g., Llama 3) for 100% free, offline usage.

* The Synthesizer Agent: A one-click export that reads the 2D graph and generates a structured, linear Markdown document or pitch outline.

* Pluggable Personas: Customize the System Prompts to change the agents (e.g., turn the "Critic" into "The Angel Investor").

* Web-Grounded Expander: Give the Expander a web-search tool to pull real-world data into its generated ghost nodes.

## Initial Project Structure

This repository is now scaffolded as a minimal Tauri desktop app with a React frontend:

```text
.
├── index.html
├── package.json
├── src
│   ├── App.tsx
│   ├── components
│   │   └── BrainstormCanvas.tsx
│   ├── main.tsx
│   ├── store
│   │   └── graphStore.ts
│   ├── styles.css
│   └── vite-env.d.ts
├── src-tauri
│   ├── Cargo.toml
│   ├── build.rs
│   ├── src
│   │   └── main.rs
│   └── tauri.conf.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## What The Scaffold Includes

* A Vite-powered React + TypeScript frontend.
* A minimal React Flow canvas with seed nodes for:
  * a user idea,
  * a ghost suggestion,
  * a critic challenge.
* Zustand state management for nodes, edges, selection, and basic graph actions.
* A Tauri shell so the project can run as a native desktop app.

## Local Development

Prerequisites:

* Node.js 20+ and npm
* For the desktop shell: a Rust toolchain (`rustup`) plus the platform prerequisites required by Tauri

1. Install the JavaScript dependencies:

   ```bash
   npm install
   ```

2. Run the web app in the browser:

   ```bash
   npm run dev
   ```

3. Run the desktop app through Tauri:

   ```bash
   npm run tauri dev
   ```

## Build

To generate a production web build:

```bash
npm run build
```

To create a desktop build later, you can use:

```bash
npm run tauri build
```

Note: desktop builds are currently scaffold-only. You will likely want to add app icons, API key storage, and persistence before packaging for distribution.

## Installation

See the full setup and packaging guide in [INSTALL.md](./INSTALL.md).

## Session Storage (File-Based)

EchoGraph now stores sessions as JSON files on disk (instead of only browser storage).

Default desktop location:

* `~/Documents/EchoGraph/Sessions`

Each saved session uses a file format like:

```json
{
  "format": "echograph.session",
  "version": 1,
  "savedAt": "2026-03-04T12:34:56.000Z",
  "session": {
    "id": "session-...",
    "title": "My Session",
    "createdAt": "...",
    "updatedAt": "...",
    "nodes": [],
    "edges": []
  }
}
```

You can list/open saved sessions from the app, open the sessions folder, and reveal the current session file in Finder.

## OpenAI BYOK Setup (Secure)

EchoGraph now includes an in-app OpenAI key field:

* Paste your key in the top bar and click **Save Key**.
* The key is stored in your OS credential store (macOS Keychain / Windows Credential Manager / Linux Secret Service), not in session JSON files.
* Expander and Critic actions call OpenAI through the Tauri backend, so the key is not embedded in source code or saved in project files.

Git safety:

* `.env` and `.env.*` are ignored in `.gitignore` to avoid accidentally committing local secrets.
