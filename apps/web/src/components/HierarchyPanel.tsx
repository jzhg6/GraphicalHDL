import type { PrimitiveCatalogEntry } from "@graphicalhdl/ir";
import type { DesignDocument } from "@graphicalhdl/ir";
import type { EditorView } from "../model/graph-adapter";

interface HierarchyPanelProps {
  document: DesignDocument;
  view: EditorView;
  primitiveCatalog: readonly PrimitiveCatalogEntry[];
  onNavigate: (view: EditorView) => void;
  onAddPrimitive: (kind: PrimitiveCatalogEntry["kind"]) => void;
  onAddInstance: (moduleId: string) => void;
}

export function HierarchyPanel({
  document,
  view,
  primitiveCatalog,
  onNavigate,
  onAddPrimitive,
  onAddInstance,
}: HierarchyPanelProps) {
  return (
    <aside className="side-panel hierarchy-panel">
      <div className="panel-heading">
        <span>DESIGN</span>
        <strong>Hierarchy</strong>
      </div>
      <button
        className={view.level === 1 ? "tree-item is-active" : "tree-item"}
        onClick={() => onNavigate({ level: 1, ownerId: document.design.top.id })}
        type="button"
      >
        <span className="tree-icon">T</span>
        {document.design.top.name}
      </button>
      <div className="tree-children">
        {document.design.modules.map((module) => (
          <div className="tree-module" key={module.id}>
            <button
              className={
                view.ownerId === module.id && view.level > 1 ? "tree-item is-active" : "tree-item"
              }
              onClick={() => onNavigate({ level: 2, ownerId: module.id })}
              type="button"
            >
              <span className="tree-icon">M</span>
              {module.name}
            </button>
            {view.ownerId === module.id && view.level > 1 ? (
              <button
                className={view.level === 3 ? "tree-subitem is-active" : "tree-subitem"}
                onClick={() => onNavigate({ level: 3, ownerId: module.id })}
                type="button"
              >
                Implementation
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {view.level === 1 ? (
        <section className="panel-section">
          <h3>添加 instance</h3>
          <div className="button-stack">
            {document.design.modules.map((module) => (
              <button
                className="palette-button"
                onClick={() => onAddInstance(module.id)}
                key={module.id}
                type="button"
              >
                <span>＋</span> {module.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {view.level === 3 ? (
        <section className="panel-section">
          <h3>Primitive palette</h3>
          <div className="primitive-grid">
            {primitiveCatalog.map((primitive) => (
              <button
                className="primitive-button"
                key={primitive.kind}
                onClick={() => onAddPrimitive(primitive.kind)}
                title={primitive.description}
                type="button"
              >
                <span>
                  {primitive.kind === "mul"
                    ? "×"
                    : primitive.kind === "add"
                      ? "+"
                      : primitive.kind === "reg"
                        ? "R"
                        : primitive.kind === "mux2"
                          ? "M"
                          : "C"}
                </span>
                {primitive.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
