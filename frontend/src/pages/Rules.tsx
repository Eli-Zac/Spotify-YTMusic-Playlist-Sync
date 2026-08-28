import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, SyncRule } from "../api/client";

function scheduleLabel(rule: SyncRule) {
  if (rule.schedule_type === "cron") return rule.schedule_cron || "cron";
  return `every ${rule.schedule_interval_minutes}m`;
}

export default function Rules() {
  const [rules, setRules] = useState<SyncRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setRules(await api.listRules());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runNow = async (id: number) => {
    setRunningId(id);
    setMessage("");
    try {
      const run = await api.runRuleNow(id);
      setMessage(`Run finished: ${run.status} (added ${run.tracks_added}, removed ${run.tracks_removed}, unmatched ${run.tracks_unmatched})`);
    } catch (e: any) {
      setMessage(`Run failed: ${e.message}`);
    } finally {
      setRunningId(null);
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Sync Rules</h2>
        <Link className="btn" to="/rules/new">+ New Rule</Link>
      </div>

      {message && <p className="muted">{message}</p>}

      <div className="card">
        {loading && <p className="muted">Loading…</p>}
        {!loading && rules.length === 0 && (
          <p className="muted">No sync rules yet. Create one to start syncing playlists.</p>
        )}
        {rules.length > 0 && (
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
                  <td><Link to={`/rules/${rule.id}`}>{rule.name}</Link></td>
                  <td>{rule.source_service}: {rule.source_playlist_name || rule.source_playlist_id}</td>
                  <td>{rule.dest_service}: {rule.dest_playlist_name || rule.dest_playlist_id}</td>
                  <td>{rule.mode}</td>
                  <td className="muted">{scheduleLabel(rule)}</td>
                  <td>
                    <input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule)} />
                  </td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="secondary" disabled={runningId === rule.id} onClick={() => runNow(rule.id)}>
                      {runningId === rule.id ? "Running…" : "Run now"}
                    </button>
                    <button className="danger" onClick={() => remove(rule.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
