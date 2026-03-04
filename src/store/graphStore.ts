import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  XYPosition
} from "@xyflow/react";
import { create } from "zustand";
import {
  listStoredSessions,
  loadSessionFromRepository,
  openSessionsDirectoryInFinder,
  revealSessionInFinder,
  saveSessionToRepository
} from "../lib/sessionRepository";
import {
  createStarterSession,
  type BrainstormSession,
  type SessionEdge,
  type SessionEdgeRelation,
  type SessionNode,
  type SessionNodeKind,
  type SessionViewMode,
  type StoredSessionSummary
} from "../types/session";

export type CanvasNodeData = {
  label: string;
  kind: SessionNodeKind;
  depth: number;
};

type GraphState = {
  session: BrainstormSession;
  viewMode: SessionViewMode;
  selectedNodeId: string | null;
  currentSessionPath: string | null;
  selectedStoredPath: string | null;
  pendingCenterNodeId: string | null;
  pendingFocusNodeId: string | null;
  storedSessions: StoredSessionSummary[];
  isDirty: boolean;
  isStorageBusy: boolean;
  statusMessage: string | null;
  setViewMode: (mode: SessionViewMode) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setSelectedStoredPath: (filePath: string | null) => void;
  clearPendingCenterNodeId: () => void;
  clearPendingFocusNodeId: () => void;
  clearStatusMessage: () => void;
  updateSessionTitle: (title: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  createNewSession: () => void;
  loadStoredSessions: () => Promise<void>;
  saveSession: () => Promise<void>;
  saveSessionAsNew: () => Promise<void>;
  openSelectedStoredSession: () => Promise<void>;
  openSessionsDirectory: () => Promise<void>;
  revealCurrentSessionInFinder: () => Promise<void>;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNodeAt: (position: XYPosition) => void;
  addChildNode: (parentId: string | null) => void;
  createSiblingNode: (referenceNodeId: string) => void;
  indentNode: (nodeId: string, newParentId: string) => void;
  outdentNode: (nodeId: string) => void;
  spawnGhostNearSelected: () => void;
  attachCriticToSelected: () => void;
  promoteGhostNode: (nodeId: string) => void;
  dismissNode: (nodeId: string) => void;
};

function nextId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function edgeStyleFor(relation: SessionEdgeRelation) {
  if (relation === "suggestion") {
    return {
      animated: true,
      label: "suggestion",
      style: {
        stroke: "#60a5fa",
        strokeDasharray: "6 4"
      }
    };
  }

  if (relation === "constraint") {
    return {
      animated: false,
      label: "critic",
      style: {
        stroke: "#ef4444"
      }
    };
  }

  return {
    animated: false,
    label: undefined,
    style: {
      stroke: "#9ca3af"
    }
  };
}

function getIncomingEdge(session: BrainstormSession, nodeId: string) {
  return session.edges.find((edge) => edge.target === nodeId) ?? null;
}

function setSingleParentEdge(
  session: BrainstormSession,
  targetId: string,
  nextEdge: SessionEdge | null
) {
  const nextEdges = session.edges.filter((edge) => edge.target !== targetId);

  return {
    ...session,
    edges: nextEdge ? [...nextEdges, nextEdge] : nextEdges
  };
}

function collectDescendantIds(session: BrainstormSession, rootId: string) {
  const descendants = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (!nodeId) {
      continue;
    }

    for (const edge of session.edges) {
      if (edge.source !== nodeId || descendants.has(edge.target)) {
        continue;
      }

      descendants.add(edge.target);
      queue.push(edge.target);
    }
  }

  return descendants;
}

function moveSubtree(
  session: BrainstormSession,
  rootId: string,
  nextRootPosition: XYPosition
) {
  const rootNode = session.nodes.find((node) => node.id === rootId);

  if (!rootNode) {
    return session;
  }

  const dx = nextRootPosition.x - rootNode.position.x;
  const dy = nextRootPosition.y - rootNode.position.y;

  if (dx === 0 && dy === 0) {
    return session;
  }

  const affectedIds = collectDescendantIds(session, rootId);
  affectedIds.add(rootId);

  return {
    ...session,
    nodes: session.nodes.map((node) =>
      affectedIds.has(node.id)
        ? {
            ...node,
            position: {
              x: node.position.x + dx,
              y: node.position.y + dy
            }
          }
        : node
    )
  };
}

function normalizeSession(session: BrainstormSession): BrainstormSession {
  const nodeIds = new Set(session.nodes.map((node) => node.id));
  const attachedTargets = new Set<string>();
  const nextEdges: SessionEdge[] = [];

  for (const edge of session.edges) {
    if (
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target) ||
      attachedTargets.has(edge.target)
    ) {
      continue;
    }

    attachedTargets.add(edge.target);
    nextEdges.push(edge);
  }

  return {
    ...session,
    edges: nextEdges
  };
}

function withUpdatedTimestamp(session: BrainstormSession): BrainstormSession {
  return {
    ...session,
    updatedAt: nowIso()
  };
}

function sortStoredSessions(sessions: StoredSessionSummary[]) {
  return [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function sessionSummaryLabel(item: StoredSessionSummary) {
  return `${item.title} (${new Date(item.updatedAt).toLocaleString()})`;
}

const initialSession = normalizeSession(createStarterSession());

export function buildNodeDepthMap(session: BrainstormSession): Map<string, number> {
  const nodeIds = new Set(session.nodes.map((node) => node.id));
  const childrenByParent = new Map<string, string[]>();
  const incomingTargets = new Set<string>();

  for (const edge of session.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }

    incomingTargets.add(edge.target);
    const children = childrenByParent.get(edge.source) ?? [];
    children.push(edge.target);
    childrenByParent.set(edge.source, children);
  }

  const roots = session.nodes
    .filter((node) => !incomingTargets.has(node.id))
    .map((node) => node.id);
  const queue = roots.length > 0 ? [...roots] : session.nodes.map((node) => node.id);
  const depthByNodeId = new Map<string, number>();

  for (const rootId of queue) {
    depthByNodeId.set(rootId, 0);
  }

  while (queue.length > 0) {
    const nodeId = queue.shift();

    if (!nodeId) {
      continue;
    }

    const currentDepth = depthByNodeId.get(nodeId) ?? 0;

    for (const childId of childrenByParent.get(nodeId) ?? []) {
      const nextDepth = currentDepth + 1;
      const previousDepth = depthByNodeId.get(childId);

      if (previousDepth !== undefined && previousDepth <= nextDepth) {
        continue;
      }

      depthByNodeId.set(childId, nextDepth);
      queue.push(childId);
    }
  }

  for (const node of session.nodes) {
    if (!depthByNodeId.has(node.id)) {
      depthByNodeId.set(node.id, 0);
    }
  }

  return depthByNodeId;
}

export function buildCanvasNodes(session: BrainstormSession): Node<CanvasNodeData>[] {
  const depthByNodeId = buildNodeDepthMap(session);

  return session.nodes.map((node) => ({
    id: node.id,
    type: "session",
    position: node.position,
    initialWidth: 140,
    initialHeight: 44,
    data: {
      label: node.content,
      kind: node.kind,
      depth: depthByNodeId.get(node.id) ?? 0
    }
  }));
}

export function buildCanvasEdges(session: BrainstormSession): Edge[] {
  return session.edges.map((edge) => {
    const edgeConfig = edgeStyleFor(edge.relation);

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...edgeConfig
    };
  });
}

export { sessionSummaryLabel };

export const useGraphStore = create<GraphState>((set, get) => ({
  session: initialSession,
  viewMode: "canvas",
  selectedNodeId: initialSession.nodes[0]?.id ?? null,
  currentSessionPath: null,
  selectedStoredPath: null,
  pendingCenterNodeId: null,
  pendingFocusNodeId: null,
  storedSessions: [],
  isDirty: true,
  isStorageBusy: false,
  statusMessage: null,
  setViewMode: (mode) =>
    set({
      viewMode: mode
    }),
  setSelectedNodeId: (nodeId) =>
    set({
      selectedNodeId: nodeId
    }),
  setSelectedStoredPath: (filePath) =>
    set({
      selectedStoredPath: filePath
    }),
  clearPendingCenterNodeId: () =>
    set({
      pendingCenterNodeId: null
    }),
  clearPendingFocusNodeId: () =>
    set({
      pendingFocusNodeId: null
    }),
  clearStatusMessage: () =>
    set({
      statusMessage: null
    }),
  updateSessionTitle: (title) =>
    set((state) => ({
      session: withUpdatedTimestamp({
        ...state.session,
        title
      }),
      isDirty: true
    })),
  updateNodeContent: (nodeId, content) =>
    set((state) => ({
      session: withUpdatedTimestamp({
        ...state.session,
        nodes: state.session.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                content
              }
            : node
        )
      }),
      isDirty: true
    })),
  createNewSession: () => {
    const nextSession = normalizeSession(createStarterSession());

    set({
      session: nextSession,
      selectedNodeId: nextSession.nodes[0]?.id ?? null,
      currentSessionPath: null,
      selectedStoredPath: null,
      pendingCenterNodeId: null,
      pendingFocusNodeId: null,
      isDirty: true,
      statusMessage: "Started a new session."
    });
  },
  loadStoredSessions: async () => {
    set({
      isStorageBusy: true,
      statusMessage: null
    });

    try {
      const sessions = sortStoredSessions(await listStoredSessions());

      set((state) => ({
        storedSessions: sessions,
        selectedStoredPath:
          state.selectedStoredPath ??
          state.currentSessionPath ??
          sessions[0]?.filePath ??
          null,
        isStorageBusy: false
      }));
    } catch (error) {
      set({
        isStorageBusy: false,
        statusMessage:
          error instanceof Error
            ? error.message
            : "Failed to list stored sessions."
      });
    }
  },
  saveSession: async () => {
    set({
      isStorageBusy: true,
      statusMessage: null
    });

    try {
      const snapshot = normalizeSession(withUpdatedTimestamp(get().session));
      const saved = await saveSessionToRepository(snapshot, get().currentSessionPath);
      const sessions = sortStoredSessions(await listStoredSessions());

      set({
        session: snapshot,
        storedSessions: sessions,
        currentSessionPath: saved.filePath,
        selectedStoredPath: saved.filePath,
        isDirty: false,
        isStorageBusy: false,
        statusMessage: `Saved ${saved.fileName}.`
      });
    } catch (error) {
      set({
        isStorageBusy: false,
        statusMessage:
          error instanceof Error ? error.message : "Failed to save session."
      });
    }
  },
  saveSessionAsNew: async () => {
    set({
      isStorageBusy: true,
      statusMessage: null
    });

    try {
      const snapshot = normalizeSession(withUpdatedTimestamp(get().session));
      const saved = await saveSessionToRepository(snapshot, null);
      const sessions = sortStoredSessions(await listStoredSessions());

      set({
        session: snapshot,
        storedSessions: sessions,
        currentSessionPath: saved.filePath,
        selectedStoredPath: saved.filePath,
        isDirty: false,
        isStorageBusy: false,
        statusMessage: `Saved as ${saved.fileName}.`
      });
    } catch (error) {
      set({
        isStorageBusy: false,
        statusMessage:
          error instanceof Error ? error.message : "Failed to save session copy."
      });
    }
  },
  openSelectedStoredSession: async () => {
    const selectedPath = get().selectedStoredPath;

    if (!selectedPath) {
      return;
    }

    set({
      isStorageBusy: true,
      statusMessage: null
    });

    try {
      const loaded = normalizeSession(await loadSessionFromRepository(selectedPath));
      const sessions = sortStoredSessions(await listStoredSessions());

      set({
        session: loaded,
        storedSessions: sessions,
        currentSessionPath: selectedPath,
        selectedStoredPath: selectedPath,
        selectedNodeId: loaded.nodes[0]?.id ?? null,
        pendingCenterNodeId: null,
        pendingFocusNodeId: null,
        isDirty: false,
        isStorageBusy: false,
        statusMessage: "Opened stored session."
      });
    } catch (error) {
      set({
        isStorageBusy: false,
        statusMessage:
          error instanceof Error ? error.message : "Failed to open session."
      });
    }
  },
  openSessionsDirectory: async () => {
    try {
      await openSessionsDirectoryInFinder();
    } catch (error) {
      set({
        statusMessage:
          error instanceof Error
            ? error.message
            : "Failed to open sessions folder."
      });
    }
  },
  revealCurrentSessionInFinder: async () => {
    const currentPath = get().currentSessionPath;

    if (!currentPath) {
      return;
    }

    try {
      await revealSessionInFinder(currentPath);
    } catch (error) {
      set({
        statusMessage:
          error instanceof Error
            ? error.message
            : "Failed to reveal session file."
      });
    }
  },
  onNodesChange: (changes) => {
    const movedNodes = changes.filter(
      (change): change is NodeChange & { id: string; position: XYPosition } =>
        change.type === "position" && !!change.position
    );
    const removedNodeIds = new Set(
      changes
        .filter((change): change is NodeChange & { id: string } => change.type === "remove")
        .map((change) => change.id)
    );

    if (movedNodes.length === 0 && removedNodeIds.size === 0) {
      return;
    }

    set((state) => {
      const movedById = new Map(
        movedNodes.map((change) => [change.id, change.position] as const)
      );

      const nextNodes = state.session.nodes
        .filter((node) => !removedNodeIds.has(node.id))
        .map((node) => {
          const nextPosition = movedById.get(node.id);

          if (!nextPosition) {
            return node;
          }

          return {
            ...node,
            position: nextPosition
          };
        });
      const nextEdges = state.session.edges.filter(
        (edge) => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
      );

      return {
        session: withUpdatedTimestamp(
          normalizeSession({
            ...state.session,
            nodes: nextNodes,
            edges: nextEdges
          })
        ),
        selectedNodeId: removedNodeIds.has(state.selectedNodeId ?? "")
          ? null
          : state.selectedNodeId,
        isDirty: true
      };
    });
  },
  onEdgesChange: (changes) => {
    const removedEdgeIds = new Set(
      changes
        .filter((change): change is EdgeChange & { id: string } => change.type === "remove")
        .map((change) => change.id)
    );

    if (removedEdgeIds.size === 0) {
      return;
    }

    set((state) => ({
      session: withUpdatedTimestamp(
        normalizeSession({
          ...state.session,
          edges: state.session.edges.filter((edge) => !removedEdgeIds.has(edge.id))
        })
      ),
      isDirty: true
    }));
  },
  onConnect: (connection) => {
    if (!connection.source || !connection.target) {
      return;
    }

    set((state) => ({
      session: withUpdatedTimestamp(
        normalizeSession(
          setSingleParentEdge(state.session, connection.target, {
            id: nextId("edge"),
            source: connection.source,
            target: connection.target,
            relation: "branch"
          })
        )
      ),
      isDirty: true
    }));
  },
  addNodeAt: (position) => {
    const nextNode: SessionNode = {
      id: nextId("node"),
      kind: "idea",
      content: "",
      note: "Freshly added on the canvas. Rename it in the outline view.",
      position
    };

    set((state) => ({
      session: withUpdatedTimestamp({
        ...state.session,
        nodes: [...state.session.nodes, nextNode]
      }),
      selectedNodeId: nextNode.id,
      pendingCenterNodeId: nextNode.id,
      pendingFocusNodeId: nextNode.id,
      isDirty: true
    }));
  },
  addChildNode: (parentId) => {
    const parentNode = parentId
      ? get().session.nodes.find((node) => node.id === parentId) ?? null
      : null;
    const tallestNode =
      get().session.nodes.reduce(
        (maxValue, node) => Math.max(maxValue, node.position.y),
        0
      ) ?? 0;
    const nextNode: SessionNode = {
      id: nextId("node"),
      kind: "idea",
      content: "",
      note: parentNode
        ? "Created from the outline view as a new branch."
        : "Created from the outline view as a new top-level branch.",
      position: parentNode
        ? {
            x: parentNode.position.x + 260,
            y: parentNode.position.y + 140
          }
        : {
            x: 0,
            y: tallestNode + 180
          }
    };

    set((state) => ({
      session: withUpdatedTimestamp(
        normalizeSession({
          ...state.session,
          nodes: [...state.session.nodes, nextNode],
          edges: parentNode
            ? [
                ...state.session.edges,
                {
                  id: nextId("edge"),
                  source: parentNode.id,
                  target: nextNode.id,
                  relation: "branch"
                }
              ]
            : state.session.edges
        })
      ),
      selectedNodeId: nextNode.id,
      pendingCenterNodeId: nextNode.id,
      pendingFocusNodeId: nextNode.id,
      isDirty: true
    }));
  },
  createSiblingNode: (referenceNodeId) => {
    const referenceNode =
      get().session.nodes.find((node) => node.id === referenceNodeId) ?? null;

    if (!referenceNode) {
      return;
    }

    const incomingEdge = getIncomingEdge(get().session, referenceNodeId);
    const nextNode: SessionNode = {
      id: nextId("node"),
      kind: "idea",
      content: "",
      note: incomingEdge
        ? "Created in the outline at the same level."
        : "Created in the outline as a new top-level idea.",
      position: {
        x: referenceNode.position.x,
        y: referenceNode.position.y + 140
      }
    };

    set((state) => ({
      session: withUpdatedTimestamp(
        normalizeSession({
          ...state.session,
          nodes: [...state.session.nodes, nextNode],
          edges: incomingEdge
            ? [
                ...state.session.edges,
                {
                  id: nextId("edge"),
                  source: incomingEdge.source,
                  target: nextNode.id,
                  relation: "branch"
                }
              ]
            : state.session.edges
        })
      ),
      selectedNodeId: nextNode.id,
      pendingCenterNodeId: nextNode.id,
      pendingFocusNodeId: nextNode.id,
      isDirty: true
    }));
  },
  indentNode: (nodeId, newParentId) => {
    if (nodeId === newParentId) {
      return;
    }

    const session = get().session;
    const movingNode = session.nodes.find((node) => node.id === nodeId) ?? null;
    const newParent =
      session.nodes.find((node) => node.id === newParentId) ?? null;

    if (!movingNode || !newParent) {
      return;
    }

    const descendants = collectDescendantIds(session, nodeId);

    if (descendants.has(newParentId)) {
      return;
    }

    const childNodes = session.edges
      .filter((edge) => edge.source === newParentId && edge.target !== nodeId)
      .map((edge) =>
        session.nodes.find((node) => node.id === edge.target) ?? null
      )
      .filter((node): node is SessionNode => node !== null);
    const baseY = childNodes.reduce(
      (maxValue, node) => Math.max(maxValue, node.position.y),
      newParent.position.y
    );
    const reparented = setSingleParentEdge(session, nodeId, {
      id: getIncomingEdge(session, nodeId)?.id ?? nextId("edge"),
      source: newParentId,
      target: nodeId,
      relation: "branch"
    });
    const laidOut = moveSubtree(reparented, nodeId, {
      x: newParent.position.x + 260,
      y: baseY + 140
    });

    set({
      session: withUpdatedTimestamp(normalizeSession(laidOut)),
      selectedNodeId: nodeId,
      isDirty: true
    });
  },
  outdentNode: (nodeId) => {
    const session = get().session;
    const incomingEdge = getIncomingEdge(session, nodeId);

    if (!incomingEdge) {
      return;
    }

    const parentId = incomingEdge.source;
    const parentIncomingEdge = getIncomingEdge(session, parentId);
    let reparented: BrainstormSession;
    let nextPosition: XYPosition;

    if (parentIncomingEdge) {
      const grandParentId = parentIncomingEdge.source;
      const grandParentNode =
        session.nodes.find((node) => node.id === grandParentId) ?? null;

      if (!grandParentNode) {
        return;
      }

      const siblingNodes = session.edges
        .filter((edge) => edge.source === grandParentId && edge.target !== nodeId)
        .map((edge) =>
          session.nodes.find((node) => node.id === edge.target) ?? null
        )
        .filter((node): node is SessionNode => node !== null);
      const baseY = siblingNodes.reduce(
        (maxValue, node) => Math.max(maxValue, node.position.y),
        grandParentNode.position.y
      );

      reparented = setSingleParentEdge(session, nodeId, {
        id: incomingEdge.id,
        source: grandParentId,
        target: nodeId,
        relation: "branch"
      });
      nextPosition = {
        x: grandParentNode.position.x + 260,
        y: baseY + 140
      };
    } else {
      reparented = setSingleParentEdge(session, nodeId, null);
      const rootNodeIds = new Set(reparented.edges.map((edge) => edge.target));
      const otherRoots = reparented.nodes.filter(
        (node) => !rootNodeIds.has(node.id) && node.id !== nodeId
      );
      const baseY = otherRoots.reduce(
        (maxValue, node) => Math.max(maxValue, node.position.y),
        -140
      );

      nextPosition = {
        x: 0,
        y: baseY + 140
      };
    }

    const laidOut = moveSubtree(reparented, nodeId, nextPosition);

    set({
      session: withUpdatedTimestamp(normalizeSession(laidOut)),
      selectedNodeId: nodeId,
      isDirty: true
    });
  },
  spawnGhostNearSelected: () => {
    const selectedNode = get().session.nodes.find(
      (node) => node.id === get().selectedNodeId
    );

    if (!selectedNode) {
      return;
    }

    const nextNode: SessionNode = {
      id: nextId("node"),
      kind: "ghost",
      content: `Adjacent angle for ${selectedNode.content}`,
      note: "Prototype of a nearby branch that the Expander might surface.",
      position: {
        x: selectedNode.position.x + 260,
        y: selectedNode.position.y - 70
      }
    };

    set((state) => ({
      session: withUpdatedTimestamp(
        normalizeSession({
          ...state.session,
          nodes: [...state.session.nodes, nextNode],
          edges: [
            ...state.session.edges,
            {
              id: nextId("edge"),
              source: selectedNode.id,
              target: nextNode.id,
              relation: "suggestion"
            }
          ]
        })
      ),
      selectedNodeId: nextNode.id,
      isDirty: true
    }));
  },
  attachCriticToSelected: () => {
    const selectedNode = get().session.nodes.find(
      (node) => node.id === get().selectedNodeId
    );

    if (!selectedNode) {
      return;
    }

    const nextNode: SessionNode = {
      id: nextId("node"),
      kind: "critic",
      content: `Yes, but what blocks ${selectedNode.content.toLowerCase()}?`,
      note: "Prototype of a pressure-test constraint introduced by the Critic.",
      position: {
        x: selectedNode.position.x + 260,
        y: selectedNode.position.y + 120
      }
    };

    set((state) => ({
      session: withUpdatedTimestamp(
        normalizeSession({
          ...state.session,
          nodes: [...state.session.nodes, nextNode],
          edges: [
            ...state.session.edges,
            {
              id: nextId("edge"),
              source: selectedNode.id,
              target: nextNode.id,
              relation: "constraint"
            }
          ]
        })
      ),
      selectedNodeId: nextNode.id,
      isDirty: true
    }));
  },
  promoteGhostNode: (nodeId) =>
    set((state) => ({
      session: withUpdatedTimestamp(
        normalizeSession({
          ...state.session,
          nodes: state.session.nodes.map((node) =>
            node.id === nodeId && node.kind === "ghost"
              ? {
                  ...node,
                  kind: "idea",
                  note: "The ghost node has been accepted and converted into a real idea."
                }
              : node
          ),
          edges: state.session.edges.map((edge) =>
            edge.target === nodeId && edge.relation === "suggestion"
              ? {
                  ...edge,
                  relation: "branch"
                }
              : edge
          )
        })
      ),
      isDirty: true
    })),
  dismissNode: (nodeId) =>
    set((state) => ({
      session: withUpdatedTimestamp(
        normalizeSession({
          ...state.session,
          nodes: state.session.nodes.filter((node) => node.id !== nodeId),
          edges: state.session.edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId
          )
        })
      ),
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      isDirty: true
    }))
}));
