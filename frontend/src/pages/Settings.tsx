import { useEffect, useState } from "react";
import { api, ConnectionStatus, WebhookSettings } from "../api/client";

export default function Settings() {
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [webhook, setWebhook] = useState<WebhookSettings>({ enabled: false, url: "", notify_on: "failure" });
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [ytAuth, setYtAuth] = useState<{ verification_url: string; user_code: string } | null>(null);
  const [ytPolling, setYtPolling] = useState(false);
  const [ytError, setYtError] = useState("");

  const load = async () => {
    const [conns, wh] = await Promise.all([api.connections(), api.getWebhook()]);
    setConnections(conns);
    setWebhook(wh);
  };

  useEffect(() => {
    load();
  }, []);

  const spotify = connections.find((c) => c.service === "spotify");
  const ytmusic = connections.find((c) => c.service === "ytmusic");

  const saveWebhook = async () => {
    setSavingWebhook(true);
    try {
      await api.setWebhook(webhook);
    } finally {
      setSavingWebhook(false);
    }
  };

  const startYtAuth = async () => {
    setYtError("");
    const res = await api.startYtmusicAuth();
    setYtAuth(res);
    setYtPolling(true);
    const interval = setInterval(async () => {
      try {
        await api.completeYtmusicAuth();
        clearInterval(interval);
        setYtPolling(false);
        setYtAuth(null);
        load();
      } catch {
        // not authorized yet, keep polling
      }
    }, (res.interval || 5) * 1000);
    setTimeout(() => clearInterval(interval), (res.expires_in || 1800) * 1000);
  };

  return (
    <div>
      <h2>Settings</h2>

      <div className="card">
        <h2 style={{ fontSize: 15 }}>Connected accounts</h2>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
          <div>
            <strong>Spotify</strong>
            <div className="muted">{spotify?.connected ? `Connected as ${spotify.account_label}` : "Not connected"}</div>
          </div>
          {spotify?.connected ? (
            <button className="secondary" onClick={async () => { await api.disconnectSpotify(); load(); }}>Disconnect</button>
          ) : (
            <a className="btn" href="/api/auth/spotify/login">Connect with Spotify</a>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
          <div>
            <strong>YT Music (Google)</strong>
            <div className="muted">{ytmusic?.connected ? `Connected as ${ytmusic.account_label || "Google account"}` : "Not connected"}</div>
          </div>
          {ytmusic?.connected ? (
            <button className="secondary" onClick={async () => { await api.disconnectYtmusic(); load(); }}>Disconnect</button>
          ) : (
            <button onClick={startYtAuth} disabled={ytPolling}>{ytPolling ? "Waiting for authorization…" : "Connect with Google"}</button>
          )}
        </div>

        {ytAuth && (
          <div className="card" style={{ background: "#14161a" }}>
            <p>Go to <a href={ytAuth.verification_url} target="_blank" rel="noreferrer">{ytAuth.verification_url}</a> and enter this code:</p>
            <h2 style={{ letterSpacing: 4 }}>{ytAuth.user_code}</h2>
            <p className="muted">This page will detect authorization automatically.</p>
          </div>
        )}
        {ytError && <p style={{ color: "var(--err)" }}>{ytError}</p>}

        <p className="muted" style={{ marginTop: 16 }}>
          Spotify and Google API credentials for this app are configured via environment variables
          (SPOTIFY_CLIENT_ID/SECRET, YTMUSIC_OAUTH_CLIENT_ID/SECRET) in your docker-compose file. See the README
          if you haven't set those up yet.
        </p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15 }}>Notifications</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={webhook.enabled}
            onChange={(e) => setWebhook({ ...webhook, enabled: e.target.checked })}
          />
          Send webhook notifications (ntfy, Discord, Slack, or any JSON-compatible webhook URL)
        </label>

        <label>Webhook URL</label>
        <input value={webhook.url} onChange={(e) => setWebhook({ ...webhook, url: e.target.value })} placeholder="https://ntfy.sh/your-topic" />

        <label>Notify on</label>
        <select value={webhook.notify_on} onChange={(e) => setWebhook({ ...webhook, notify_on: e.target.value as any })}>
          <option value="failure">Failures only</option>
          <option value="always">Every run</option>
        </select>

        <div className="form-actions">
          <button onClick={saveWebhook} disabled={savingWebhook}>{savingWebhook ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
