import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, SyncRule } from "../api/client";
import ServiceIcon from "../components/ServiceIcon";
import { useRuns } from "../runs/RunsContext";

function scheduleLabel(rule: SyncRule) {
  if (rule.schedule_type === "cron") return rule.schedule_cron || "cron";
  return `every ${rule.schedule_interval_minutes}m`;
}

export default function Rules() {
  const [rules, setRules] = useState<SyncRule[]>([]);
  const [loading, setLoading] = useState(true);
  const { startRun, isRunning } = useRuns();

  const load = async () => {
    setLoading(true);
    setRules(await api.listRules());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

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
                        disabled={isRunning(rule.id)}
                        onClick={() => startRun(rule)}
                      >
                        {isRunning(rule.id) ? "Running…" : "Run now"}
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
