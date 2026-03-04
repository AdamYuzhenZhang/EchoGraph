import { useEffect } from "react";
import BrainstormCanvas from "./components/BrainstormCanvas";
import SessionOutline from "./components/SessionOutline";
import { sessionSummaryLabel, useGraphStore } from "./store/graphStore";

function App() {
  const session = useGraphStore((state) => state.session);
  const viewMode = useGraphStore((state) => state.viewMode);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectedStoredPath = useGraphStore((state) => state.selectedStoredPath);
  const currentSessionPath = useGraphStore((state) => state.currentSessionPath);
  const storedSessions = useGraphStore((state) => state.storedSessions);
  const isDirty = useGraphStore((state) => state.isDirty);
  const isStorageBusy = useGraphStore((state) => state.isStorageBusy);
  const statusMessage = useGraphStore((state) => state.statusMessage);
  const setViewMode = useGraphStore((state) => state.setViewMode);
  const setSelectedStoredPath = useGraphStore(
    (state) => state.setSelectedStoredPath
  );
  const updateSessionTitle = useGraphStore((state) => state.updateSessionTitle);
  const addChildNode = useGraphStore((state) => state.addChildNode);
  const createNewSession = useGraphStore((state) => state.createNewSession);
  const loadStoredSessions = useGraphStore((state) => state.loadStoredSessions);
  const saveSession = useGraphStore((state) => state.saveSession);
  const saveSessionAsNew = useGraphStore((state) => state.saveSessionAsNew);
  const openSelectedStoredSession = useGraphStore(
    (state) => state.openSelectedStoredSession
  );
  const openSessionsDirectory = useGraphStore(
    (state) => state.openSessionsDirectory
  );
  const revealCurrentSessionInFinder = useGraphStore(
    (state) => state.revealCurrentSessionInFinder
  );
  const spawnGhostNearSelected = useGraphStore(
    (state) => state.spawnGhostNearSelected
  );
  const attachCriticToSelected = useGraphStore(
    (state) => state.attachCriticToSelected
  );
  const promoteGhostNode = useGraphStore((state) => state.promoteGhostNode);
  const dismissNode = useGraphStore((state) => state.dismissNode);
  const selectedNode =
    session.nodes.find((node) => node.id === selectedNodeId) ?? null;

  useEffect(() => {
    void loadStoredSessions();
  }, [loadStoredSessions]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-row">
          <h1 className="app-title">EchoGraph</h1>
          <input
            className="session-input"
            value={session.title}
            onChange={(event) => {
              updateSessionTitle(event.target.value);
            }}
            placeholder="Session title"
          />
          {isDirty ? <span className="dirty-dot">Unsaved</span> : null}

          <button type="button" onClick={createNewSession}>
            New
          </button>
          <button
            type="button"
            onClick={() => {
              void saveSession();
            }}
            disabled={isStorageBusy}
          >
            Save
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void saveSessionAsNew();
            }}
            disabled={isStorageBusy}
          >
            Save As
          </button>

          <select
            className="stored-select"
            value={selectedStoredPath ?? ""}
            onChange={(event) => {
              setSelectedStoredPath(event.target.value || null);
            }}
          >
            <option value="">Stored sessions</option>
            {storedSessions.map((item) => (
              <option key={item.filePath} value={item.filePath}>
                {sessionSummaryLabel(item)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              void openSelectedStoredSession();
            }}
            disabled={!selectedStoredPath || isStorageBusy}
          >
            Open
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void openSessionsDirectory();
            }}
          >
            Folder
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void revealCurrentSessionInFinder();
            }}
            disabled={!currentSessionPath}
          >
            Reveal
          </button>

          <div className="view-switch" role="tablist" aria-label="Session view">
            <button
              type="button"
              className={viewMode === "canvas" ? "active" : ""}
              onClick={() => {
                setViewMode("canvas");
              }}
            >
              Canvas
            </button>
            <button
              type="button"
              className={viewMode === "outline" ? "active" : ""}
              onClick={() => {
                setViewMode("outline");
              }}
            >
              Outline
            </button>
          </div>
        </div>

        <div className="topbar-row topbar-row-secondary">
          {selectedNode ? (
            <>
              <span className={`node-badge node-badge-${selectedNode.kind}`}>
                {selectedNode.kind}
              </span>
              <span className="selected-node-text">
                {selectedNode.content || "New idea"}
              </span>
              <button
                type="button"
                onClick={() => {
                  addChildNode(selectedNode.id);
                }}
              >
                + Child
              </button>
              <button type="button" onClick={spawnGhostNearSelected}>
                Expander
              </button>
              <button type="button" onClick={attachCriticToSelected}>
                Critic
              </button>
              <button
                type="button"
                disabled={selectedNode.kind !== "ghost"}
                onClick={() => {
                  promoteGhostNode(selectedNode.id);
                }}
              >
                Solidify
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  dismissNode(selectedNode.id);
                }}
              >
                Dismiss
              </button>
            </>
          ) : (
            <p className="topbar-copy">Select a node in canvas or outline to edit it.</p>
          )}
        </div>

        {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
      </header>

      <main className="workspace">
        <section className="content-pane">
          {viewMode === "canvas" ? <BrainstormCanvas /> : <SessionOutline />}
        </section>
      </main>
    </div>
  );
}

export default App;
