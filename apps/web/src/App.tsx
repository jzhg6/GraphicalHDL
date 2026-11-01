import { useMemo, useReducer, useRef, useState } from "react";
import { compileDocument, compileJson, getPrimitiveCatalog } from "@graphicalhdl/compiler";
import type { DesignDocument, Diagnostic, Primitive } from "@graphicalhdl/ir";
import { strToU8, zipSync } from "fflate";
import sampleDocument from "../../../examples/mac-accumulator/design.json";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import { HierarchyPanel } from "./components/HierarchyPanel";
import { PropertyInspector } from "./components/PropertyInspector";
import { RtlPreview } from "./components/RtlPreview";
import type { EditorView } from "./model/graph-adapter";
import { editorReducer, type SelectedElement } from "./model/editor-reducer";
import "./styles.css";

const initialDocument = sampleDocument as DesignDocument;

type BottomTab = "diagnostics" | "rtl";

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function artifactZip(artifacts: readonly { path: string; content: string }[]): Blob {
  const files: Record<string, Uint8Array> = {};
  for (const artifact of artifacts) files[artifact.path] = strToU8(artifact.content);
  return new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: "application/zip" });
}

export function App() {
  const [document, dispatch] = useReducer(editorReducer, initialDocument);
  const [view, setView] = useState<EditorView>({
    level: 1,
    ownerId: initialDocument.design.top.id,
  });
  const [selection, setSelection] = useState<SelectedElement>();
  const [bottomTab, setBottomTab] = useState<BottomTab>("diagnostics");
  const [rtlPath, setRtlPath] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const compileResult = useMemo(() => compileDocument(document), [document]);
  const currentModule = document.design.modules.find((module) => module.id === view.ownerId);
  const errorCount = compileResult.diagnostics.filter((item) => item.severity === "error").length;
  const warningCount = compileResult.diagnostics.length - errorCount;

  function navigate(nextView: EditorView): void {
    setView(nextView);
    setSelection(undefined);
  }

  function openModule(moduleId: string): void {
    navigate({ level: 2, ownerId: moduleId });
  }

  function focusDiagnostic(diagnostic: Diagnostic): void {
    if (!diagnostic.target) return;
    navigate({ level: diagnostic.target.level, ownerId: diagnostic.target.ownerId });
    const kind: SelectedElement["kind"] =
      diagnostic.target.level === 1
        ? document.design.top.instances.some(
            (instance) => instance.id === diagnostic.target?.elementId,
          )
          ? "instance"
          : "port"
        : diagnostic.target.level === 2
          ? "port"
          : "primitive";
    setSelection({ id: diagnostic.target.elementId, kind });
  }

  function exportJson(): void {
    downloadBlob(
      `${document.project.id}.json`,
      new Blob([`${JSON.stringify(document, null, 2)}\n`], { type: "application/json" }),
    );
  }

  function downloadProject(): void {
    if (!compileResult.ok) return;
    downloadBlob(`${document.project.id}-rtl.zip`, artifactZip(compileResult.artifacts));
  }

  async function importJson(file: File | undefined): Promise<void> {
    if (!file) return;
    const source = await file.text();
    const result = compileJson(source);
    if (result.diagnostics.some((item) => item.stage === "parse" || item.stage === "schema")) {
      window.alert(result.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n"));
      return;
    }
    const imported = JSON.parse(source) as DesignDocument;
    dispatch({ type: "replace-document", document: imported });
    navigate({ level: 1, ownerId: imported.design.top.id });
  }

  const breadcrumb = [
    {
      label: document.design.top.name,
      active: view.level === 1,
      onClick: () => navigate({ level: 1, ownerId: document.design.top.id }),
    },
    ...(view.level > 1 && currentModule
      ? [
          {
            label: currentModule.name,
            active: view.level === 2,
            onClick: () => navigate({ level: 2, ownerId: currentModule.id }),
          },
        ]
      : []),
    ...(view.level === 3 && currentModule
      ? [
          {
            label: "Implementation",
            active: true,
            onClick: () => navigate({ level: 3, ownerId: currentModule.id }),
          },
        ]
      : []),
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span>G</span>
          </div>
          <div>
            <strong>GraphicalHDL</strong>
            <small>Visual hardware compiler</small>
          </div>
        </div>
        <nav className="breadcrumbs" aria-label="当前设计层级">
          {breadcrumb.map((item, index) => (
            <span key={`${item.label}:${index}`}>
              {index > 0 ? <i>/</i> : null}
              <button
                className={item.active ? "is-active" : ""}
                onClick={item.onClick}
                type="button"
              >
                {item.label}
              </button>
            </span>
          ))}
        </nav>
        <div className="toolbar">
          <input
            hidden
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importJson(event.target.files?.[0])}
          />
          <button type="button" onClick={() => fileInput.current?.click()}>
            导入 JSON
          </button>
          <button type="button" onClick={exportJson}>
            导出 JSON
          </button>
          <button
            type="button"
            className="toolbar-primary"
            disabled={!compileResult.ok}
            onClick={downloadProject}
          >
            下载 RTL 工程
          </button>
        </div>
      </header>

      <div className="workspace">
        <HierarchyPanel
          document={document}
          view={view}
          primitiveCatalog={getPrimitiveCatalog()}
          onNavigate={navigate}
          onAddInstance={(moduleId) => dispatch({ type: "add-instance", moduleId })}
          onAddPrimitive={(kind: Primitive["kind"]) =>
            dispatch({ type: "add-primitive", moduleId: view.ownerId, kind })
          }
        />
        <section className="center-workspace">
          <div className="canvas-toolbar">
            <div>
              <span className="level-pill">LEVEL {view.level}</span>
              <strong>
                {view.level === 1
                  ? "System Architecture"
                  : view.level === 2
                    ? "Module Interface"
                    : "Module Implementation"}
              </strong>
            </div>
            <div className="compile-state">
              <span
                className={
                  compileResult.ok ? "status-dot status-dot--ok" : "status-dot status-dot--error"
                }
              />
              {compileResult.ok ? "Compile ready" : `${errorCount} errors`}
              {warningCount > 0 ? ` · ${warningCount} warnings` : ""}
            </div>
            {view.level === 2 && currentModule ? (
              <button
                className="implementation-button"
                onClick={() => navigate({ level: 3, ownerId: currentModule.id })}
                type="button"
              >
                打开内部结构 →
              </button>
            ) : null}
          </div>
          <GraphCanvas
            document={document}
            view={view}
            dispatch={dispatch}
            onSelect={setSelection}
            onOpenModule={openModule}
          />
          <div className="bottom-tabs">
            <button
              className={bottomTab === "diagnostics" ? "is-active" : ""}
              onClick={() => setBottomTab("diagnostics")}
              type="button"
            >
              Diagnostics <span>{compileResult.diagnostics.length}</span>
            </button>
            <button
              className={bottomTab === "rtl" ? "is-active" : ""}
              onClick={() => setBottomTab("rtl")}
              type="button"
            >
              RTL Preview
            </button>
          </div>
          {bottomTab === "diagnostics" ? (
            <DiagnosticsPanel diagnostics={compileResult.diagnostics} onFocus={focusDiagnostic} />
          ) : (
            <RtlPreview
              artifacts={compileResult.ok ? compileResult.artifacts : []}
              selectedPath={rtlPath}
              onSelectPath={setRtlPath}
            />
          )}
        </section>
        <PropertyInspector
          document={document}
          view={view}
          selection={selection}
          dispatch={dispatch}
        />
      </div>
    </main>
  );
}
