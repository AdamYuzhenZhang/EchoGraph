import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from "@xyflow/react";
import { useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import EditableSessionNode from "./nodes/EditableSessionNode";
import {
  buildCanvasEdges,
  buildCanvasNodes,
  useGraphStore
} from "../store/graphStore";

const nodeTypes = {
  session: EditableSessionNode
};

function CanvasSurface() {
  const session = useGraphStore((state) => state.session);
  const onNodesChange = useGraphStore((state) => state.onNodesChange);
  const onEdgesChange = useGraphStore((state) => state.onEdgesChange);
  const onConnect = useGraphStore((state) => state.onConnect);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const addNodeAt = useGraphStore((state) => state.addNodeAt);
  const pendingCenterNodeId = useGraphStore((state) => state.pendingCenterNodeId);
  const clearPendingCenterNodeId = useGraphStore(
    (state) => state.clearPendingCenterNodeId
  );
  const { fitView, screenToFlowPosition, setCenter } = useReactFlow();
  const nodes = buildCanvasNodes(session);
  const edges = buildCanvasEdges(session);

  useEffect(() => {
    if (pendingCenterNodeId) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 200 });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [fitView, session.id, nodes.length, edges.length, pendingCenterNodeId]);

  useEffect(() => {
    if (!pendingCenterNodeId) {
      return;
    }

    const targetNode = nodes.find((node) => node.id === pendingCenterNodeId);

    if (!targetNode) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      void setCenter(targetNode.position.x, targetNode.position.y, {
        zoom: 1,
        duration: 180
      });
      clearPendingCenterNodeId();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [clearPendingCenterNodeId, nodes, pendingCenterNodeId, setCenter]);

  const handlePaneClick = (event: ReactMouseEvent) => {
    if (event.detail !== 2) {
      return;
    }

    addNodeAt(
      screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })
    );
  };

  return (
    <div className="flow-shell">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={handlePaneClick}
        onSelectionChange={({ nodes: selectedNodes }) => {
          setSelectedNodeId(selectedNodes[0]?.id ?? null);
        }}
        zoomOnDoubleClick={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.4}
        maxZoom={2}
        deleteKeyCode={null}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#243b53"
        />
        <MiniMap
          className="session-minimap"
          pannable
          zoomable
          bgColor="#ffffff"
          maskColor="rgba(17, 24, 39, 0.08)"
          nodeStrokeWidth={1.5}
          nodeBorderRadius={3}
          nodeStrokeColor={(node) => {
            if (node.data?.kind === "ghost") {
              return "#60a5fa";
            }

            if (node.data?.kind === "critic") {
              return "#ef4444";
            }

            return "#6b7280";
          }}
          nodeColor={(node) => {
            if (node.data?.kind === "ghost") {
              return "#6b7fd7";
            }

            if (node.data?.kind === "critic") {
              return "#d64545";
            }

            return "#1b4332";
          }}
        />
        <Controls />
        <Panel position="top-right" className="flow-tip">
          Double-click empty canvas to create a new root node. Click node text to
          edit in place.
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default function BrainstormCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasSurface />
    </ReactFlowProvider>
  );
}
