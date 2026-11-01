import type { DesignDocument, Port, Primitive } from "@graphicalhdl/ir";
import type { EditorView } from "../model/graph-adapter";
import type { EditorAction, SelectedElement } from "../model/editor-reducer";

interface PropertyInspectorProps {
  document: DesignDocument;
  view: EditorView;
  selection?: SelectedElement | undefined;
  dispatch: (action: EditorAction) => void;
}

function numberValue(value: string): number {
  return Math.max(1, Math.min(4096, Number(value) || 1));
}

export function PropertyInspector({ document, view, selection, dispatch }: PropertyInspectorProps) {
  const module = document.design.modules.find((candidate) => candidate.id === view.ownerId);
  const port =
    selection?.kind === "port"
      ? (view.level === 1 ? document.design.top.ports : module?.ports)?.find(
          (candidate) => candidate.id === selection.id,
        )
      : undefined;
  const instance =
    selection?.kind === "instance"
      ? document.design.top.instances.find((candidate) => candidate.id === selection.id)
      : undefined;
  const primitive =
    selection?.kind === "primitive"
      ? module?.implementation.primitives.find((candidate) => candidate.id === selection.id)
      : undefined;
  const selected = port ?? instance ?? primitive;

  function rename(name: string): void {
    if (!selection) return;
    dispatch({ type: "rename-element", view, selection, name });
  }

  function updatePort(patch: Partial<Port>): void {
    if (!port) return;
    dispatch({ type: "update-port", view, portId: port.id, patch });
  }

  function updatePrimitive(patch: Record<string, unknown>): void {
    if (!primitive || !module) return;
    dispatch({ type: "update-primitive", moduleId: module.id, primitiveId: primitive.id, patch });
  }

  return (
    <aside className="side-panel inspector-panel">
      <div className="panel-heading">
        <span>PROPERTIES</span>
        <strong>Inspector</strong>
      </div>

      {view.level === 2 ? (
        <div className="inline-actions">
          <button
            type="button"
            onClick={() =>
              dispatch({ type: "add-port", moduleId: view.ownerId, direction: "input" })
            }
          >
            ＋ Input
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: "add-port", moduleId: view.ownerId, direction: "output" })
            }
          >
            ＋ Output
          </button>
        </div>
      ) : null}

      {!selected ? (
        <div className="empty-inspector">
          <div className="empty-inspector__icon">⌁</div>
          <strong>选择一个图元</strong>
          <p>点击 module、port 或 primitive 后，可在这里编辑其 synthesizable 属性。</p>
        </div>
      ) : (
        <div className="property-form">
          <div className="property-badge">{selection?.kind}</div>
          <label>
            <span>ID</span>
            <input value={selected.id} disabled />
          </label>
          <label>
            <span>Name</span>
            <input
              value={selected.name}
              onChange={(event) => rename(event.target.value)}
              data-testid="property-name"
            />
          </label>

          {port ? (
            <>
              <label>
                <span>Direction</span>
                <select
                  value={port.direction}
                  onChange={(event) =>
                    updatePort({ direction: event.target.value as Port["direction"] })
                  }
                >
                  <option value="input">input</option>
                  <option value="output">output</option>
                </select>
              </label>
              <label>
                <span>Width</span>
                <input
                  type="number"
                  min="1"
                  max="4096"
                  value={port.width}
                  onChange={(event) => updatePort({ width: numberValue(event.target.value) })}
                  data-testid="property-width"
                />
              </label>
              <label>
                <span>Role</span>
                <select
                  value={port.role}
                  onChange={(event) => updatePort({ role: event.target.value as Port["role"] })}
                >
                  <option value="data">data</option>
                  <option value="control">control</option>
                  <option value="clock">clock</option>
                  <option value="reset">reset</option>
                </select>
              </label>
            </>
          ) : null}

          {instance ? (
            <label>
              <span>Module</span>
              <input
                value={
                  document.design.modules.find((candidate) => candidate.id === instance.moduleId)
                    ?.name ?? instance.moduleId
                }
                disabled
              />
            </label>
          ) : null}

          {primitive ? <PrimitiveFields primitive={primitive} update={updatePrimitive} /> : null}

          {selection && !(view.level === 1 && selection.kind === "port") ? (
            <button
              className="danger-button"
              type="button"
              onClick={() => dispatch({ type: "delete-element", view, selection })}
            >
              删除该 {selection.kind}
            </button>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function PrimitiveFields({
  primitive,
  update,
}: {
  primitive: Primitive;
  update: (patch: Record<string, unknown>) => void;
}) {
  if (primitive.kind === "mul") {
    return (
      <>
        <label>
          <span>A width</span>
          <input
            type="number"
            min="1"
            value={primitive.aWidth}
            onChange={(event) => update({ aWidth: numberValue(event.target.value) })}
          />
        </label>
        <label>
          <span>B width</span>
          <input
            type="number"
            min="1"
            value={primitive.bWidth}
            onChange={(event) => update({ bWidth: numberValue(event.target.value) })}
          />
        </label>
      </>
    );
  }
  return (
    <>
      <label>
        <span>Width</span>
        <input
          type="number"
          min="1"
          value={primitive.width}
          onChange={(event) => update({ width: numberValue(event.target.value) })}
          data-testid="primitive-width"
        />
      </label>
      {primitive.kind === "const" ? (
        <label>
          <span>Value</span>
          <input
            value={primitive.value}
            onChange={(event) => update({ value: event.target.value })}
          />
        </label>
      ) : null}
      {primitive.kind === "reg" ? (
        <label>
          <span>Reset value</span>
          <input
            value={primitive.resetValue}
            onChange={(event) => update({ resetValue: event.target.value })}
          />
        </label>
      ) : null}
    </>
  );
}
