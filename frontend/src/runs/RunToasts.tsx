import { useEffect, useRef, useState } from "react";
import { progressLabel } from "../api/client";
import { useRuns } from "./RunsContext";

function statusLabel(run: ReturnType<typeof useRuns>["runs"][number]): string {
  switch (run.status) {
    case "running":
      return progressLabel(run.progress);
    case "success":
      return `Done — added ${run.tracksAdded}, removed ${run.tracksRemoved}`;
    case "partial":
      return `Done — ${run.tracksUnmatched} unmatched`;
    case "cancelled":
      return "Cancelled";
    case "failed":
      return run.errorMessage ? `Failed: ${run.errorMessage}` : "Failed";
    default:
      return run.status;
  }
}

function LogsModal({ ruleName, log, onClose }: { ruleName: string; log: string[]; onClose: () => void }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [log.length]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal logs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{ruleName} — logs</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="logs-body" ref={bodyRef}>
          {log.length ? (
            log.map((line, i) => (
              <div key={i} className="logs-line">
                {line}
              </div>
            ))
          ) : (
            <div className="muted">No log output yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RunToasts() {
  const { runs, cancelRun, dismiss } = useRuns();
  const [logsFor, setLogsFor] = useState<number | null>(null);

  if (runs.length === 0) return null;

  const logsRun = runs.find((r) => r.ruleId === logsFor) || null;

  return (
    <>
      <div className="run-toasts">
        {runs.map((run) => {
          const total = run.progress?.total || 0;
          const current = run.progress?.current || 0;
          const pct = run.status !== "running" ? 100 : total ? Math.round((current / total) * 100) : null;

          return (
            <div key={run.ruleId} className={`run-toast run-toast-${run.status}`}>
              <div className="run-toast-head">
                <span className="run-toast-name">{run.ruleName}</span>
                {run.status !== "running" && (
                  <button className="run-toast-close" onClick={() => dismiss(run.ruleId)} aria-label="Dismiss">
                    ×
                  </button>
                )}
              </div>
              <div className="run-toast-status">{statusLabel(run)}</div>
              <div className="run-toast-bar-track">
                <div
                  className={`run-toast-bar${pct === null ? " run-toast-bar-indeterminate" : ""}`}
                  style={pct !== null ? { width: `${pct}%` } : undefined}
                />
              </div>
              <div className="run-toast-actions">
                <button className="run-toast-link" onClick={() => setLogsFor(run.ruleId)}>
                  Logs
                </button>
                {run.status === "running" && (
                  <button
                    className="run-toast-link run-toast-kill"
                    disabled={run.cancelling}
                    onClick={() => cancelRun(run.ruleId)}
                  >
                    {run.cancelling ? "Cancelling…" : "Kill"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {logsRun && (
        <LogsModal
          ruleName={logsRun.ruleName}
          log={logsRun.progress?.log || []}
          onClose={() => setLogsFor(null)}
        />
      )}
    </>
  );
}
