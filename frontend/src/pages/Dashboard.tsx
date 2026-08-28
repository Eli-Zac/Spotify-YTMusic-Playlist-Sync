import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, SyncRule, SyncRun } from "../api/client";
import StatusBadge from "../components/StatusBadge";

export default function Dashboard() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [rules, setRules] = useState<Record<number, SyncRule>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [runList, ruleList] = await Promise.all([api.listRecentRuns(), api.listRules()]);
    setRuns(runList);
    setRules(Object.fromEntries(ruleList.map((r) => [r.id, r])));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const ruleCount = Object.keys(rules).length;
  const activeCount = Object.values(rules).filter((r) => r.enabled).length;
  const lastFailure = runs.find((r) => r.status === "failed");

  return (
    <div>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p className="page-sub">An overview of your sync rules and recent activity.</p>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-value">{ruleCount}</span>
          <span className="stat-label">Sync rules</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{activeCount}</span>
          <span className="stat-label">Active</span>
        </div>
        <div className="stat-tile">
          <span className={`stat-value ${lastFailure ? "stat-value-warn" : ""}`}>{lastFailure ? "!" : "✓"}</span>
          <span className="stat-label">{lastFailure ? "Recent failure" : "All clear"}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Recent runs</h2>
        </div>
        {loading && <p className="muted">Loading…</p>}
        {!loading && runs.length === 0 && (
          <div className="empty-state">
            <p className="muted">No syncs have run yet.</p>
            <Link className="btn" to="/rules/new">Create your first rule</Link>
          </div>
        )}
        {runs.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Added</th>
                  <th>Removed</th>
                  <th>Unmatched</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{rules[run.rule_id]?.name || `Rule #${run.rule_id}`}</td>
                    <td>
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="muted">{new Date(run.started_at).toLocaleString()}</td>
                    <td>{run.tracks_added}</td>
                    <td>{run.tracks_removed}</td>
                    <td>{run.tracks_unmatched}</td>
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
