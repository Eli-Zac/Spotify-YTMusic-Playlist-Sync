import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ScheduleType, ServiceName, SyncMode, SyncRule } from "../api/client";

const empty: Partial<SyncRule> = {
  name: "",
  source_service: "spotify",
  source_playlist_id: "",
  source_playlist_name: "",
  dest_service: "ytmusic",
  dest_playlist_id: "",
  dest_playlist_name: "",
  mode: "additive",
  schedule_type: "interval",
  schedule_interval_minutes: 60,
  schedule_cron: "",
  enabled: true,
};

export default function RuleEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [form, setForm] = useState<Partial<SyncRule>>(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      api.listRules().then((rules) => {
        const rule = rules.find((r) => r.id === Number(id));
        if (rule) setForm(rule);
      });
    }
  }, [id]);

  const set = (key: keyof SyncRule, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        const created = await api.createRule(form);
        navigate(`/rules/${created.id}`);
      } else {
        await api.updateRule(Number(id), form);
        navigate("/rules");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2>{isNew ? "New Sync Rule" : "Edit Sync Rule"}</h2>
      <div className="card">
        <label>Name</label>
        <input value={form.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Discover Weekly -> YT Music" />

        <div className="row">
          <div>
            <label>Source service</label>
            <select value={form.source_service} onChange={(e) => set("source_service", e.target.value as ServiceName)}>
              <option value="spotify">Spotify</option>
              <option value="ytmusic">YT Music</option>
            </select>
            <label>Source playlist ID</label>
            <input value={form.source_playlist_id || ""} onChange={(e) => set("source_playlist_id", e.target.value)} />
            <label>Source playlist name (optional, for display)</label>
            <input value={form.source_playlist_name || ""} onChange={(e) => set("source_playlist_name", e.target.value)} />
          </div>
          <div>
            <label>Destination service</label>
            <select value={form.dest_service} onChange={(e) => set("dest_service", e.target.value as ServiceName)}>
              <option value="spotify">Spotify</option>
              <option value="ytmusic">YT Music</option>
            </select>
            <label>Destination playlist ID (must already exist)</label>
            <input value={form.dest_playlist_id || ""} onChange={(e) => set("dest_playlist_id", e.target.value)} />
            <label>Destination playlist name (optional, for display)</label>
            <input value={form.dest_playlist_name || ""} onChange={(e) => set("dest_playlist_name", e.target.value)} />
          </div>
        </div>

        <label>Sync mode</label>
        <select value={form.mode} onChange={(e) => set("mode", e.target.value as SyncMode)}>
          <option value="additive">Additive only (never removes tracks)</option>
          <option value="mirror">Mirror (destination matches source exactly)</option>
        </select>

        <label>Schedule type</label>
        <select value={form.schedule_type} onChange={(e) => set("schedule_type", e.target.value as ScheduleType)}>
          <option value="interval">Interval</option>
          <option value="cron">Cron expression</option>
        </select>

        {form.schedule_type === "interval" ? (
          <>
            <label>Run every (minutes)</label>
            <input
              type="number"
              min={5}
              value={form.schedule_interval_minutes ?? 60}
              onChange={(e) => set("schedule_interval_minutes", Number(e.target.value))}
            />
          </>
        ) : (
          <>
            <label>Cron expression (5-field, UTC)</label>
            <input
              placeholder="0 */6 * * *"
              value={form.schedule_cron || ""}
              onChange={(e) => set("schedule_cron", e.target.value)}
            />
          </>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={!!form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          Enabled
        </label>

        {error && <p style={{ color: "var(--err)" }}>{error}</p>}

        <div className="form-actions">
          <button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button className="secondary" onClick={() => navigate("/rules")}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
