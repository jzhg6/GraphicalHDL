import type { Diagnostic } from "@graphicalhdl/ir";

interface DiagnosticsPanelProps {
  diagnostics: readonly Diagnostic[];
  onFocus: (diagnostic: Diagnostic) => void;
}

export function DiagnosticsPanel({ diagnostics, onFocus }: DiagnosticsPanelProps) {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.length - errors;
  return (
    <section className="bottom-panel diagnostics-panel">
      <div className="bottom-panel__header">
        <strong>Diagnostics</strong>
        <div className="diagnostic-counts">
          <span className={errors > 0 ? "count count--error" : "count"}>{errors} errors</span>
          <span className={warnings > 0 ? "count count--warning" : "count"}>
            {warnings} warnings
          </span>
        </div>
      </div>
      <div className="diagnostic-list">
        {diagnostics.length === 0 ? (
          <div className="diagnostic-empty">
            <span>✓</span> 设计通过全部 Compiler 检查
          </div>
        ) : (
          diagnostics.map((diagnostic, index) => (
            <button
              type="button"
              className={`diagnostic-row diagnostic-row--${diagnostic.severity}`}
              key={`${diagnostic.code}:${diagnostic.jsonPointer}:${index}`}
              onClick={() => onFocus(diagnostic)}
            >
              <span className="diagnostic-row__icon">
                {diagnostic.severity === "error" ? "×" : "!"}
              </span>
              <code>{diagnostic.code}</code>
              <span>{diagnostic.message}</span>
              <small>
                {diagnostic.location
                  ? `${diagnostic.location.line}:${diagnostic.location.column}`
                  : diagnostic.jsonPointer}
              </small>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
