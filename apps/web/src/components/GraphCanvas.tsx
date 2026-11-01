import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { DesignDocument } from "@graphicalhdl/ir";
import { HardwareNode } from "./HardwareNode";
import { projectGraph, type EditorView, type HardwareNodeData } from "../model/graph-adapter";
import type { EditorAction, SelectedElement } from "../model/editor-reducer";

const nodeTypes = { hardware: HardwareNode };

interface GraphCanvasProps {
  document: DesignDocument;
  view: EditorView;
  dispatch: (action: EditorAction) => void;
  onSelect: (selection: SelectedElement | undefined) => void;
  onOpenModule: (moduleId: string) => void;
}

function selectionForNode(
  view: EditorView,
  node: Node<HardwareNodeData>,
): SelectedElement | undefined {
  if (node.data.kind === "instance") return { id: node.data.elementId, kind: "instance" };
  if (node.data.kind === "top-port" || node.data.kind === "interface-port") {
    return { id: node.data.elementId, kind: "port" };
  }
  if (node.data.kind === "primitive") return { id: node.data.elementId, kind: "primitive" };
  void view;
  return undefined;
}

export function GraphCanvas({
  document,
  view,
  dispatch,
  onSelect,
  onOpenModule,
}: GraphCanvasProps) {
  const projection = projectGraph(document, view);
  const nodes = projection.nodes.map((node) =>
    view.level === 1 && node.data.kind === "instance"
      ? {
          ...node,
          data: {
            ...node.data,
            onOpen: () => {
              const instance = document.design.top.instances.find(
                (candidate) => candidate.id === node.data.elementId,
              );
              if (instance) onOpenModule(instance.moduleId);
            },
          },
        }
      : node,
  );

  const handleNodeClick: NodeMouseHandler<Node<HardwareNodeData>> = (_event, node) => {
    onSelect(selectionForNode(view, node));
  };

  const handleNodeDoubleClick: NodeMouseHandler<Node<HardwareNodeData>> = (_event, node) => {
    if (view.level !== 1 || node.data.kind !== "instance") return;
    const instance = document.design.top.instances.find(
      (candidate) => candidate.id === node.data.elementId,
    );
    if (instance) onOpenModule(instance.moduleId);
  };

  function handleConnect(connection: Connection): void {
    dispatch({ type: "connect", view, connection });
  }

  function handleEdgesDelete(edges: Edge[]): void {
    dispatch({ type: "delete-edges", view, edgeIds: edges.map((edge) => edge.id) });
  }

  function handleNodesDelete(nodes: Node<HardwareNodeData>[]): void {
    for (const node of nodes) {
      const selection = selectionForNode(view, node);
      if (selection && !node.data.fixed) dispatch({ type: "delete-element", view, selection });
    }
    onSelect(undefined);
  }

  return (
    <div className="graph-canvas" data-testid={`canvas-level-${view.level}`}>
      <ReactFlow<Node<HardwareNodeData>, Edge>
        key={`${view.level}:${view.ownerId}`}
        nodes={nodes}
        edges={projection.edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.7}
        deleteKeyCode={["Backspace", "Delete"]}
        onConnect={handleConnect}
        onEdgesDelete={handleEdgesDelete}
        onNodesDelete={handleNodesDelete}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={() => onSelect(undefined)}
        onNodeDragStop={(_event, node) => {
          if (!node.data.fixed) {
            dispatch({
              type: "move-node",
              view,
              elementId: node.data.elementId,
              position: node.position,
            });
          }
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} />
        <MiniMap pannable zoomable nodeStrokeWidth={3} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
