import { useEffect, useState } from "react";
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

  return (
    <div>
      <h2>Dashboard</h2>
      <div className="card">
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>Recent runs</h2>
        {loading && <p className="muted">Loading…</p>}
        {!loading && runs.length === 0 && <p className="muted">No syncs have run yet.</p>}
        {runs.length > 0 && (
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
        )}
      </div>
    </div>
  );
}
