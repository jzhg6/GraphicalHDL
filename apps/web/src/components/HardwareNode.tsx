import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { HardwareNodeData } from "../model/graph-adapter";

export function HardwareNode({ data, selected }: NodeProps) {
  const nodeData = data as HardwareNodeData;
  const inputs = nodeData.ports.filter((port) => port.handleType === "target");
  const outputs = nodeData.ports.filter((port) => port.handleType === "source");

  return (
    <div
      className={`hardware-node hardware-node--${nodeData.kind} ${selected ? "is-selected" : ""}`}
    >
      <div className="hardware-node__header">
        <strong>{nodeData.label}</strong>
        {nodeData.onOpen ? (
          <button
            aria-label={`打开 ${nodeData.label}`}
            className="hardware-node__open nodrag"
            onClick={(event) => {
              event.stopPropagation();
              nodeData.onOpen?.();
            }}
            type="button"
          >
            ↗
          </button>
        ) : null}
        <span>{nodeData.subtitle}</span>
      </div>
      <div className="hardware-node__ports">
        <div className="hardware-node__port-column">
          {inputs.map((port, index) => (
            <div className="hardware-port hardware-port--input" key={port.id}>
              <Handle
                id={port.id}
                type="target"
                position={Position.Left}
                style={{ top: 62 + index * 28 }}
              />
              <span>{port.label}</span>
              <small>{port.width}</small>
            </div>
          ))}
        </div>
        <div className="hardware-node__port-column hardware-node__port-column--output">
          {outputs.map((port, index) => (
            <div className="hardware-port hardware-port--output" key={port.id}>
              <small>{port.width}</small>
              <span>{port.label}</span>
              <Handle
                id={port.id}
                type="source"
                position={Position.Right}
                style={{ top: 62 + index * 28 }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
