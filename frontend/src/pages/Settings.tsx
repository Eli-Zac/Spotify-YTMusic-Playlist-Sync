import { useEffect, useState } from "react";
import { api, ConnectionStatus, WebhookSettings } from "../api/client";
import ServiceIcon from "../components/ServiceIcon";

export default function Settings() {
  const [connections, setConnections] = useState<ConnectionStatus[]>([]);
  const [webhook, setWebhook] = useState<WebhookSettings>({ enabled: false, url: "", notify_on: "failure" });
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [ytHeadersOpen, setYtHeadersOpen] = useState(false);
  const [ytHeadersRaw, setYtHeadersRaw] = useState("");
  const [ytConnecting, setYtConnecting] = useState(false);
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

  const submitYtHeaders = async () => {
    setYtConnecting(true);
    setYtError("");
    try {
      await api.connectYtmusic(ytHeadersRaw);
      setYtHeadersOpen(false);
      setYtHeadersRaw("");
      load();
    } catch (e: any) {
      setYtError(e.message || "Couldn't connect with those headers");
    } finally {
      setYtConnecting(false);
    }
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
              <div className="muted">
                {ytmusic?.connected
                  ? ytmusic.needs_reauth
                    ? "Session expired — reconnect below"
                    : `Connected as ${ytmusic.account_label || "Google account"}`
                  : "Not connected"}
              </div>
            </div>
          </div>
          <div className="connection-actions">
            {ytmusic?.needs_reauth && <span className="badge warn">Reconnect needed</span>}
            {ytmusic?.connected && (
              <button className="secondary" onClick={async () => { await api.disconnectYtmusic(); load(); }}>Disconnect</button>
            )}
            <button onClick={() => setYtHeadersOpen((v) => !v)}>
              {ytmusic?.connected ? "Reconnect" : "Connect"}
            </button>
          </div>
        </div>

        {ytHeadersOpen && (
          <div className="device-code-box">
            <p>YT Music has no login button here — instead, paste request headers copied from your browser:</p>
            <ol className="hint-list">
              <li>Open <a href="https://music.youtube.com" target="_blank" rel="noreferrer">music.youtube.com</a> in Chrome or Firefox and make sure you're logged in.</li>
              <li>Open DevTools (F12) → the <strong>Network</strong> tab, then reload the page.</li>
              <li>Find a request to <code>/youtubei/v1/browse</code> (filter by "browse"), right-click it, and choose <strong>Copy → Copy request headers</strong>.</li>
              <li>Paste the full thing below.</li>
            </ol>
            <textarea
              className="headers-input"
              rows={8}
              value={ytHeadersRaw}
              onChange={(e) => setYtHeadersRaw(e.target.value)}
              placeholder={"accept: */*\ncookie: ...\nauthorization: SAPISIDHASH ...\n..."}
            />
            {ytError && <p className="error-text">{ytError}</p>}
            <div className="form-actions">
              <button onClick={submitYtHeaders} disabled={ytConnecting || !ytHeadersRaw.trim()}>
                {ytConnecting ? "Connecting…" : "Save"}
              </button>
              <button className="secondary" onClick={() => { setYtHeadersOpen(false); setYtError(""); }}>Cancel</button>
            </div>
            <p className="muted">
              This session isn't permanent — YouTube will eventually expire it. When it does, syncing will fail and
              (if webhook notifications are enabled below) you'll get a message telling you to paste fresh headers here.
            </p>
          </div>
        )}

        <p className="muted hint-block">
          Spotify API credentials for this app are configured via environment variables
          (<code>SPOTIFY_CLIENT_ID</code>/<code>SECRET</code>) in your docker-compose file.
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
