import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, SyncRule } from "../api/client";
import ServiceIcon from "../components/ServiceIcon";

function scheduleLabel(rule: SyncRule) {
  if (rule.schedule_type === "cron") return rule.schedule_cron || "cron";
  return `every ${rule.schedule_interval_minutes}m`;
}

function progressLabel(detailJson: string | null | undefined): string | null {
  if (!detailJson) return null;
  try {
    const d = JSON.parse(detailJson);
    if (!d.phase) return null;
    if (d.phase === "fetching") return "Fetching playlists…";
    if (d.phase === "matching") return d.total ? `Matching ${d.current}/${d.total}…` : "Matching…";
    if (d.phase === "adding") return `Adding ${d.total} track${d.total === 1 ? "" : "s"}…`;
    if (d.phase === "removing") return `Removing ${d.total} track${d.total === 1 ? "" : "s"}…`;
    return null;
  } catch {
    return null;
  }
}

export default function Rules() {
  const [rules, setRules] = useState<SyncRule[]>([]);
  const [loading, setLoading] = useState(true);
  // ruleId -> the run currently being polled, so refreshing the page can pick
  // a still-running sync back up instead of losing all track of it.
  const [runningRunIds, setRunningRunIds] = useState<Record<number, number>>({});
  const [runProgress, setRunProgress] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    const [ruleList, recentRuns] = await Promise.all([api.listRules(), api.listRecentRuns()]);
    setRules(ruleList);
    setLoading(false);

    // Resume polling for any rule whose most recent run is still "running" -
    // e.g. after a page refresh mid-sync - instead of showing a stale "Run now".
    const latestPerRule = new Map<number, (typeof recentRuns)[number]>();
    for (const run of recentRuns) {
      if (!latestPerRule.has(run.rule_id)) latestPerRule.set(run.rule_id, run);
    }
    for (const run of latestPerRule.values()) {
      if (run.status === "running" && !(run.rule_id in runningRunIds)) {
        pollRun(run.rule_id, run.id);
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pollRun = async (ruleId: number, runId: number) => {
    setRunningRunIds((m) => ({ ...m, [ruleId]: runId }));
    try {
      let status = "running";
      while (status === "running") {
        const runs = await api.listRuleRuns(ruleId);
        const current = runs.find((r) => r.id === runId);
        if (!current) break;
        status = current.status;
        if (status === "running") {
          const label = progressLabel(current.detail_json);
          setRunProgress((p) => ({ ...p, [ruleId]: label || "Running…" }));
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        setMessage(
          `Run ${current.status}: added ${current.tracks_added}, removed ${current.tracks_removed}, unmatched ${current.tracks_unmatched}` +
            (current.error_message ? ` — ${current.error_message}` : "")
        );
      }
    } catch (e: any) {
      setMessage(`Couldn't check run status: ${e.message}`);
    } finally {
      setRunningRunIds((m) => {
        const next = { ...m };
        delete next[ruleId];
        return next;
      });
      setRunProgress((p) => {
        const next = { ...p };
        delete next[ruleId];
        return next;
      });
    }
  };

  const runNow = async (ruleId: number) => {
    setMessage("");
    setRunProgress((p) => ({ ...p, [ruleId]: "Starting…" }));
    try {
      const started = await api.runRuleNow(ruleId);
      await pollRun(ruleId, started.id);
    } catch (e: any) {
      setMessage(`Run failed: ${e.message}`);
      setRunProgress((p) => {
        const next = { ...p };
        delete next[ruleId];
        return next;
      });
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this sync rule?")) return;
    await api.deleteRule(id);
    load();
  };

  const toggle = async (rule: SyncRule) => {
    await api.updateRule(rule.id, { enabled: !rule.enabled });
    load();
  };

  return (
    <div>
      <div className="page-head page-head-row">
        <div>
          <h1>Sync rules</h1>
          <p className="page-sub">Every playlist pair kept in sync, and how often.</p>
        </div>
        <Link className="btn" to="/rules/new">
          <span className="btn-plus">+</span> New rule
        </Link>
      </div>

      {message && <div className="toast">{message}</div>}

      <div className="card">
        {loading && <p className="muted">Loading…</p>}
        {!loading && rules.length === 0 && (
          <div className="empty-state">
            <p className="muted">No sync rules yet. Create one to start syncing playlists.</p>
            <Link className="btn" to="/rules/new">Create your first rule</Link>
          </div>
        )}
        {rules.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th>Mode</th>
                  <th>Schedule</th>
                  <th>Enabled</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td><Link to={`/rules/${rule.id}`} className="row-title">{rule.name}</Link></td>
                    <td>
                      <span className="playlist-cell">
                        <ServiceIcon service={rule.source_service} />
                        {rule.source_playlist_name || rule.source_playlist_id}
                      </span>
                    </td>
                    <td>
                      <span className="playlist-cell">
                        <ServiceIcon service={rule.dest_service} />
                        {rule.dest_playlist_name || rule.dest_playlist_id}
                      </span>
                    </td>
                    <td><span className="mode-pill">{rule.mode}</span></td>
                    <td className="muted">{scheduleLabel(rule)}</td>
                    <td>
                      <label className="switch">
                        <input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule)} />
                        <span className="switch-track" />
                      </label>
                    </td>
                    <td className="row-actions">
                      <Link className="btn secondary" to={`/rules/${rule.id}`}>Edit</Link>
                      <button
                        className="secondary"
                        disabled={rule.id in runningRunIds}
                        onClick={() => runNow(rule.id)}
                      >
                        {rule.id in runningRunIds ? runProgress[rule.id] || "Running…" : "Run now"}
                      </button>
                      <button className="danger" onClick={() => remove(rule.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
