export type ServiceName = "spotify" | "ytmusic";
export type SyncMode = "mirror" | "additive";
export type ScheduleType = "interval" | "cron";
export type RunStatus = "success" | "partial" | "failed" | "running";

export interface SyncRule {
  id: number;
  name: string;
  source_service: ServiceName;
  source_playlist_id: string;
  source_playlist_name: string;
  dest_service: ServiceName;
  dest_playlist_id: string;
  dest_playlist_name: string;
  mode: SyncMode;
  schedule_type: ScheduleType;
  schedule_interval_minutes: number | null;
  schedule_cron: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncRun {
  id: number;
  rule_id: number;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  tracks_added: number;
  tracks_removed: number;
  tracks_unmatched: number;
  error_message: string | null;
}

export interface ConnectionStatus {
  service: ServiceName;
  connected: boolean;
  account_label: string;
  needs_reauth: boolean;
}

export interface WebhookSettings {
  enabled: boolean;
  url: string;
  notify_on: "failure" | "always";
}

export interface Playlist {
  id: string;
  name: string;
  track_count: number;
  image: string | null;
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listRules: () => req<SyncRule[]>("/api/rules"),
  createRule: (data: Partial<SyncRule>) =>
    req<SyncRule>("/api/rules", { method: "POST", body: JSON.stringify(data) }),
  updateRule: (id: number, data: Partial<SyncRule>) =>
    req<SyncRule>(`/api/rules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteRule: (id: number) => req(`/api/rules/${id}`, { method: "DELETE" }),
  runRuleNow: (id: number) => req<SyncRun>(`/api/rules/${id}/run`, { method: "POST" }),
  listRuleRuns: (id: number) => req<SyncRun[]>(`/api/rules/${id}/runs`),

  listRecentRuns: () => req<SyncRun[]>("/api/runs"),

  connections: () => req<ConnectionStatus[]>("/api/settings/connections"),
  listPlaylists: (service: ServiceName) => req<Playlist[]>(`/api/playlists/${service}`),
  getWebhook: () => req<WebhookSettings>("/api/settings/webhook"),
  setWebhook: (data: WebhookSettings) =>
    req<WebhookSettings>("/api/settings/webhook", { method: "PUT", body: JSON.stringify(data) }),

  disconnectSpotify: () => req("/api/auth/spotify", { method: "DELETE" }),
  disconnectYtmusic: () => req("/api/auth/ytmusic", { method: "DELETE" }),
  connectYtmusic: (headersRaw: string) =>
    req<{ connected: boolean }>("/api/auth/ytmusic/connect", {
      method: "POST",
      body: JSON.stringify({ headers_raw: headersRaw }),
    }),
};
