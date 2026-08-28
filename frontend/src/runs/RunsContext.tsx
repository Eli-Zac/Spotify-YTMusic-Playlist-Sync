import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { api, parseRunProgress, RunProgress, RunStatus, SyncRule } from "../api/client";

export interface ActiveRun {
  ruleId: number;
  runId: number;
  ruleName: string;
  status: RunStatus;
  progress: RunProgress | null;
  errorMessage: string | null;
  tracksAdded: number;
  tracksRemoved: number;
  tracksUnmatched: number;
  cancelling: boolean;
}

interface RunsContextValue {
  runs: ActiveRun[];
  startRun: (rule: SyncRule) => Promise<void>;
  cancelRun: (ruleId: number) => Promise<void>;
  dismiss: (ruleId: number) => void;
  isRunning: (ruleId: number) => boolean;
}

const RunsContext = createContext<RunsContextValue | null>(null);

export function useRuns() {
  const ctx = useContext(RunsContext);
  if (!ctx) throw new Error("useRuns must be used within RunsProvider");
  return ctx;
}

const AUTO_DISMISS_MS = 8000;
const POLL_INTERVAL_MS = 1500;

export function RunsProvider({ children }: { children: ReactNode }) {
  const [runs, setRuns] = useState<ActiveRun[]>([]);
  const pollingRuleIds = useRef<Set<number>>(new Set());

  const updateRun = (ruleId: number, patch: Partial<ActiveRun>) => {
    setRuns((prev) => prev.map((r) => (r.ruleId === ruleId ? { ...r, ...patch } : r)));
  };

  const dismiss = (ruleId: number) => {
    setRuns((prev) => prev.filter((r) => r.ruleId !== ruleId));
  };

  const poll = (ruleId: number, runId: number) => {
    if (pollingRuleIds.current.has(ruleId)) return;
    pollingRuleIds.current.add(ruleId);

    (async () => {
      try {
        let status: RunStatus = "running";
        while (status === "running") {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const runsList = await api.listRuleRuns(ruleId);
          const current = runsList.find((r) => r.id === runId);
          if (!current) break;
          status = current.status;
          updateRun(ruleId, {
            status: current.status,
            progress: parseRunProgress(current.detail_json),
            errorMessage: current.error_message,
            tracksAdded: current.tracks_added,
            tracksRemoved: current.tracks_removed,
            tracksUnmatched: current.tracks_unmatched,
            ...(current.status !== "running" ? { cancelling: false } : {}),
          });
        }
        if (status !== "running") {
          setTimeout(() => dismiss(ruleId), AUTO_DISMISS_MS);
        }
      } catch {
        // best-effort; the toast just stops updating if polling fails
      } finally {
        pollingRuleIds.current.delete(ruleId);
      }
    })();
  };

  const startRun = async (rule: SyncRule) => {
    if (pollingRuleIds.current.has(rule.id)) return;
    const started = await api.runRuleNow(rule.id);
    setRuns((prev) => [
      ...prev.filter((r) => r.ruleId !== rule.id),
      {
        ruleId: rule.id,
        runId: started.id,
        ruleName: rule.name || `Rule #${rule.id}`,
        status: "running",
        progress: null,
        errorMessage: null,
        tracksAdded: 0,
        tracksRemoved: 0,
        tracksUnmatched: 0,
        cancelling: false,
      },
    ]);
    poll(rule.id, started.id);
  };

  const cancelRun = async (ruleId: number) => {
    const run = runs.find((r) => r.ruleId === ruleId);
    if (!run) return;
    updateRun(ruleId, { cancelling: true });
    try {
      await api.cancelRun(run.runId);
    } catch {
      updateRun(ruleId, { cancelling: false });
    }
  };

  const isRunning = (ruleId: number) => runs.some((r) => r.ruleId === ruleId && r.status === "running");

  // Resume any runs still "running" server-side on mount, e.g. after a page refresh.
  useEffect(() => {
    (async () => {
      try {
        const [rules, recentRuns] = await Promise.all([api.listRules(), api.listRecentRuns()]);
        const ruleById = new Map(rules.map((r) => [r.id, r]));
        const latestPerRule = new Map<number, (typeof recentRuns)[number]>();
        for (const run of recentRuns) {
          if (!latestPerRule.has(run.rule_id)) latestPerRule.set(run.rule_id, run);
        }
        for (const run of latestPerRule.values()) {
          if (run.status !== "running") continue;
          const rule = ruleById.get(run.rule_id);
          setRuns((prev) => [
            ...prev,
            {
              ruleId: run.rule_id,
              runId: run.id,
              ruleName: rule?.name || `Rule #${run.rule_id}`,
              status: "running",
              progress: parseRunProgress(run.detail_json),
              errorMessage: null,
              tracksAdded: 0,
              tracksRemoved: 0,
              tracksUnmatched: 0,
              cancelling: false,
            },
          ]);
          poll(run.rule_id, run.id);
        }
      } catch {
        // best-effort resume; ignore failures
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RunsContext.Provider value={{ runs, startRun, cancelRun, dismiss, isRunning }}>
      {children}
    </RunsContext.Provider>
  );
}
