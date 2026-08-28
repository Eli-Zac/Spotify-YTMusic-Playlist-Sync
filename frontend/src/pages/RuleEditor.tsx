import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ScheduleType, ServiceName, SyncMode, SyncRule } from "../api/client";
import PlaylistPicker from "../components/PlaylistPicker";
import ServiceIcon from "../components/ServiceIcon";

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
  const [loaded, setLoaded] = useState(isNew);

  useEffect(() => {
    if (!isNew) {
      api.listRules().then((rules) => {
        const rule = rules.find((r) => r.id === Number(id));
        if (rule) setForm(rule);
        setLoaded(true);
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

  if (!loaded) return null;

  return (
    <div>
      <div className="page-head">
        <h1>{isNew ? "New sync rule" : "Edit sync rule"}</h1>
        <p className="page-sub">Pick a source and destination playlist, choose how they sync, and set a schedule.</p>
      </div>

      <div className="card">
        <div className="field">
          <label>Name</label>
          <input value={form.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Discover Weekly → YT Music" />
        </div>

        <div className="rule-flow">
          <div className="rule-side">
            <div className="field">
              <label>Source service</label>
              <div className="service-select">
                {(["spotify", "ytmusic"] as ServiceName[]).map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`service-option ${form.source_service === s ? "active" : ""}`}
                    onClick={() => set("source_service", s)}
                  >
                    <ServiceIcon service={s} />
                    {s === "spotify" ? "Spotify" : "YT Music"}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Source playlist</label>
              <PlaylistPicker
                service={form.source_service as ServiceName}
                playlistId={form.source_playlist_id || ""}
                playlistName={form.source_playlist_name || ""}
                onChange={(pid, name) => setForm((f) => ({ ...f, source_playlist_id: pid, source_playlist_name: name }))}
              />
            </div>
          </div>

          <div className="rule-arrow" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M2 10h14M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="rule-side">
            <div className="field">
              <label>Destination service</label>
              <div className="service-select">
                {(["spotify", "ytmusic"] as ServiceName[]).map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`service-option ${form.dest_service === s ? "active" : ""}`}
                    onClick={() => set("dest_service", s)}
                  >
                    <ServiceIcon service={s} />
                    {s === "spotify" ? "Spotify" : "YT Music"}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Destination playlist</label>
              <PlaylistPicker
                service={form.dest_service as ServiceName}
                playlistId={form.dest_playlist_id || ""}
                playlistName={form.dest_playlist_name || ""}
                onChange={(pid, name) => setForm((f) => ({ ...f, dest_playlist_id: pid, dest_playlist_name: name }))}
              />
              <p className="hint">Must already exist — playlist-sync won't create it for you.</p>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Sync mode</label>
            <select value={form.mode} onChange={(e) => set("mode", e.target.value as SyncMode)}>
              <option value="additive">Additive only — never removes tracks</option>
              <option value="mirror">Mirror — destination matches source exactly</option>
            </select>
          </div>
          <div className="field">
            <label>Schedule type</label>
            <select value={form.schedule_type} onChange={(e) => set("schedule_type", e.target.value as ScheduleType)}>
              <option value="interval">Interval</option>
              <option value="cron">Cron expression</option>
            </select>
          </div>
        </div>

        {form.schedule_type === "interval" ? (
          <div className="field">
            <label>Run every (minutes)</label>
            <input
              type="number"
              min={5}
              value={form.schedule_interval_minutes ?? 60}
              onChange={(e) => set("schedule_interval_minutes", Number(e.target.value))}
            />
          </div>
        ) : (
          <div className="field">
            <label>Cron expression (5-field, UTC)</label>
            <input
              placeholder="0 */6 * * *"
              value={form.schedule_cron || ""}
              onChange={(e) => set("schedule_cron", e.target.value)}
            />
          </div>
        )}

        <label className="checkbox-row">
          <input type="checkbox" checked={!!form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          Enabled
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save rule"}</button>
          <button className="secondary" onClick={() => navigate("/rules")}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
