import { useEffect, useRef } from "react";
import { useGraphStore } from "../store/graphStore";
import type { SessionNode } from "../types/session";

type BranchProps = {
  node: SessionNode;
  childrenByParent: Map<string, SessionNode[]>;
  ancestors: Set<string>;
  previousSiblingId: string | null;
  depth: number;
};

function sortNodes(a: SessionNode, b: SessionNode) {
  if (a.position.y !== b.position.y) {
    return a.position.y - b.position.y;
  }

  return a.position.x - b.position.x;
}

function OutlineBranch({
  node,
  childrenByParent,
  ancestors,
  previousSiblingId,
  depth
}: BranchProps) {
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const updateNodeContent = useGraphStore((state) => state.updateNodeContent);
  const addChildNode = useGraphStore((state) => state.addChildNode);
  const createSiblingNode = useGraphStore((state) => state.createSiblingNode);
  const indentNode = useGraphStore((state) => state.indentNode);
  const outdentNode = useGraphStore((state) => state.outdentNode);
  const pendingFocusNodeId = useGraphStore((state) => state.pendingFocusNodeId);
  const clearPendingFocusNodeId = useGraphStore(
    (state) => state.clearPendingFocusNodeId
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const children = (childrenByParent.get(node.id) ?? []).filter(
    (child) => !ancestors.has(child.id)
  );
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(node.id);
  const depthLevel = Math.min(depth, 3);

  useEffect(() => {
    if (pendingFocusNodeId !== node.id || !textareaRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (!textareaRef.current) {
        return;
      }

      textareaRef.current.focus();
      textareaRef.current.select();
      clearPendingFocusNodeId();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [clearPendingFocusNodeId, node.id, pendingFocusNodeId]);

  return (
    <li className="outline-item">
      <div
        className={`outline-line outline-depth-${depthLevel} ${
          selectedNodeId === node.id ? "outline-line-selected" : ""
        }`}
        onClick={() => {
          setSelectedNodeId(node.id);
        }}
      >
        <span className="outline-bullet" aria-hidden="true">
          •
        </span>
        <textarea
          ref={textareaRef}
          className={`outline-input outline-input-${node.kind} outline-depth-${depthLevel}`}
          rows={1}
          value={node.content}
          placeholder="New idea"
          onChange={(event) => {
            updateNodeContent(node.id, event.target.value);
          }}
          onFocus={() => {
            setSelectedNodeId(node.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              createSiblingNode(node.id);
            }

            if (event.key === "Tab") {
              event.preventDefault();

              if (event.shiftKey) {
                outdentNode(node.id);
                return;
              }

              if (previousSiblingId) {
                indentNode(node.id, previousSiblingId);
              }
            }
          }}
        />
        <button
          type="button"
          className="inline-action"
          onClick={(event) => {
            event.stopPropagation();
            addChildNode(node.id);
          }}
        >
          + child
        </button>
      </div>

      {children.length > 0 ? (
        <ul className="outline-list">
          {children.map((child, index) => (
            <OutlineBranch
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
              ancestors={nextAncestors}
              previousSiblingId={index > 0 ? children[index - 1].id : null}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function SessionOutline() {
  const session = useGraphStore((state) => state.session);
  const addChildNode = useGraphStore((state) => state.addChildNode);
  const nodes = [...session.nodes].sort(sortNodes);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingTargets = new Set(session.edges.map((edge) => edge.target));
  const childrenByParent = new Map<string, SessionNode[]>();

  for (const edge of session.edges) {
    const childNode = nodeMap.get(edge.target);

    if (!childNode) {
      continue;
    }

    const siblings = childrenByParent.get(edge.source) ?? [];
    siblings.push(childNode);
    siblings.sort(sortNodes);
    childrenByParent.set(edge.source, siblings);
  }

  const primaryRoots = nodes.filter((node) => !incomingTargets.has(node.id));
  const displayRoots = primaryRoots.length > 0 ? [...primaryRoots] : [...nodes];
  const reachableIds = new Set<string>();
  const markReachable = (rootId: string) => {
    const queue = [rootId];

    while (queue.length > 0) {
      const nodeId = queue.shift();

      if (!nodeId || reachableIds.has(nodeId)) {
        continue;
      }

      reachableIds.add(nodeId);

      for (const child of childrenByParent.get(nodeId) ?? []) {
        queue.push(child.id);
      }
    }
  };

  for (const node of displayRoots) {
    markReachable(node.id);
  }

  for (const node of nodes) {
    if (!reachableIds.has(node.id)) {
      displayRoots.push(node);
      markReachable(node.id);
    }
  }

  return (
    <div className="outline-pane">
      <div className="outline-toolbar">
        <button
          type="button"
          onClick={() => {
            addChildNode(null);
          }}
        >
          + root
        </button>
        <p className="panel-copy">
          Plain text outline view. Enter creates sibling. Tab indents. Shift+Tab
          outdents.
        </p>
      </div>

      <div className="outline-scroll">
        <ul className="outline-list outline-root-list">
          {displayRoots.map((node, index) => (
            <OutlineBranch
              key={node.id}
              node={node}
              childrenByParent={childrenByParent}
              ancestors={new Set<string>()}
              previousSiblingId={index > 0 ? displayRoots[index - 1].id : null}
              depth={0}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
