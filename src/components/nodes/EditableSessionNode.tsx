import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps
} from "@xyflow/react";
import { useEffect, useRef } from "react";
import { useGraphStore } from "../../store/graphStore";
import type { SessionNodeKind } from "../../types/session";

function resolveKind(value: unknown): SessionNodeKind {
  if (value === "ghost" || value === "critic" || value === "idea") {
    return value;
  }

  return "idea";
}

function resolveDepth(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

export default function EditableSessionNode({ id, data }: NodeProps) {
  const updateNodeInternals = useUpdateNodeInternals();
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const updateNodeContent = useGraphStore((state) => state.updateNodeContent);
  const pendingFocusNodeId = useGraphStore((state) => state.pendingFocusNodeId);
  const clearPendingFocusNodeId = useGraphStore(
    (state) => state.clearPendingFocusNodeId
  );
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isSelected = selectedNodeId === id;
  const label = typeof data.label === "string" ? data.label : "";
  const kind = resolveKind(data.kind);
  const depthLevel = Math.min(resolveDepth(data.depth), 3);

  const resizeInput = (input: HTMLTextAreaElement) => {
    const minWidth = 110;
    const maxWidth = 560;

    input.style.height = "0px";
    input.style.width = "0px";

    const nextWidth = Math.min(Math.max(input.scrollWidth + 4, minWidth), maxWidth);
    input.style.width = `${nextWidth}px`;

    input.style.height = "0px";
    input.style.height = `${Math.max(input.scrollHeight, 24)}px`;
    updateNodeInternals(id);
  };

  useEffect(() => {
    if (!inputRef.current) {
      return;
    }

    resizeInput(inputRef.current);
  }, [id, label]);

  useEffect(() => {
    if (pendingFocusNodeId !== id || !inputRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (!inputRef.current) {
        return;
      }

      inputRef.current.focus();
      inputRef.current.select();
      resizeInput(inputRef.current);
      clearPendingFocusNodeId();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [clearPendingFocusNodeId, id, pendingFocusNodeId]);

  return (
    <div
      className={`canvas-node canvas-node-${kind} ${
        isSelected ? "canvas-node-selected" : ""
      } canvas-depth-${depthLevel}`}
      onClick={() => {
        setSelectedNodeId(id);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
      }}
    >
      <Handle type="target" position={Position.Left} />
      <textarea
        ref={inputRef}
        className="canvas-node-input nodrag nowheel"
        rows={1}
        value={label}
        placeholder="New idea"
        onChange={(event) => {
          updateNodeContent(id, event.target.value);
          resizeInput(event.target);
        }}
        onFocus={() => {
          setSelectedNodeId(id);
          if (inputRef.current) {
            resizeInput(inputRef.current);
          }
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
        }}
      />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
