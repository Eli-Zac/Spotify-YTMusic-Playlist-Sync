import { useEffect, useState } from "react";
import { api, ConnectionStatus, WebhookSettings } from "../api/client";
import ServiceIcon from "../components/ServiceIcon";

export default function Settings() {
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [webhook, setWebhook] = useState<WebhookSettings>({ enabled: false, url: "", notify_on: "failure" });
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [ytAuth, setYtAuth] = useState<{ verification_url: string; user_code: string } | null>(null);
  const [ytPolling, setYtPolling] = useState(false);

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
      <div className="page-head">
        <h1>Settings</h1>
        <p className="page-sub">Connect your accounts and configure notifications.</p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Connected accounts</h2>
        </div>

        <div className="connection-row">
          <div className="connection-info">
            <ServiceIcon service="spotify" size={28} />
            <div>
              <strong>Spotify</strong>
              <div className="muted">{spotify?.connected ? `Connected as ${spotify.account_label}` : "Not connected"}</div>
            </div>
          </div>
          {spotify?.connected ? (
            <button className="secondary" onClick={async () => { await api.disconnectSpotify(); load(); }}>Disconnect</button>
          ) : (
            <a className="btn" href="/api/auth/spotify/login">Connect</a>
          )}
        </div>

        <div className="connection-row">
          <div className="connection-info">
            <ServiceIcon service="ytmusic" size={28} />
            <div>
              <strong>YT Music</strong>
              <div className="muted">{ytmusic?.connected ? `Connected as ${ytmusic.account_label || "Google account"}` : "Not connected"}</div>
            </div>
          </div>
          {ytmusic?.connected ? (
            <button className="secondary" onClick={async () => { await api.disconnectYtmusic(); load(); }}>Disconnect</button>
          ) : (
            <button onClick={startYtAuth} disabled={ytPolling}>{ytPolling ? "Waiting…" : "Connect"}</button>
          )}
        </div>

        {ytAuth && (
          <div className="device-code-box">
            <p>
              Go to <a href={ytAuth.verification_url} target="_blank" rel="noreferrer">{ytAuth.verification_url}</a> and enter this
              code:
            </p>
            <div className="device-code">{ytAuth.user_code}</div>
            <p className="muted">This page will detect authorization automatically.</p>
          </div>
        )}

        <p className="muted hint-block">
          Spotify and Google API credentials for this app are configured via environment variables
          (<code>SPOTIFY_CLIENT_ID</code>/<code>SECRET</code>, <code>YTMUSIC_OAUTH_CLIENT_ID</code>/<code>SECRET</code>) in your
          docker-compose file. See the README if you haven't set those up yet.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Notifications</h2>
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={webhook.enabled}
            onChange={(e) => setWebhook({ ...webhook, enabled: e.target.checked })}
          />
          Send webhook notifications (ntfy, Discord, Slack, or any JSON-compatible webhook URL)
        </label>

        <div className="field">
          <label>Webhook URL</label>
          <input value={webhook.url} onChange={(e) => setWebhook({ ...webhook, url: e.target.value })} placeholder="https://ntfy.sh/your-topic" />
        </div>

        <div className="field">
          <label>Notify on</label>
          <select value={webhook.notify_on} onChange={(e) => setWebhook({ ...webhook, notify_on: e.target.value as any })}>
            <option value="failure">Failures only</option>
            <option value="always">Every run</option>
          </select>
        </div>

        <div className="form-actions">
          <button onClick={saveWebhook} disabled={savingWebhook}>{savingWebhook ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
