import { useEffect, useMemo, useRef, useState } from "react";
import { api, Playlist, ServiceName } from "../api/client";

interface Props {
  service: ServiceName;
  playlistId: string;
  playlistName: string;
  onChange: (id: string, name: string) => void;
  placeholder?: string;
}

export default function PlaylistPicker({ service, playlistId, playlistName, onChange, placeholder }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [query, setQuery] = useState(playlistName || "");
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(playlistName || "");
  }, [playlistName]);

  useEffect(() => {
    setPlaylists([]);
    setStatus("idle");
    setManual(false);
  }, [service]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const load = async () => {
    if (status === "loading" || status === "ready") return;
    setStatus("loading");
    setError("");
    try {
      const list = await api.listPlaylists(service);
      setPlaylists(list);
      setStatus("ready");
    } catch (e: any) {
      setError(e.message || "Couldn't load playlists");
      setStatus("error");
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? playlists.filter((p) => p.name.toLowerCase().includes(q)) : playlists;
    return list.slice(0, 50);
  }, [playlists, query]);

  const select = (p: Playlist) => {
    onChange(p.id, p.name);
    setQuery(p.name);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = filtered[highlight];
      if (p) select(p);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (manual) {
    return (
      <div className="picker">
        <input
          value={playlistId}
          onChange={(e) => onChange(e.target.value, playlistName)}
          placeholder="Playlist ID"
        />
        <button type="button" className="picker-toggle" onClick={() => setManual(false)}>
          Search playlists instead
        </button>
      </div>
    );
  }

  return (
    <div className="picker" ref={rootRef}>
      <div className="picker-input-wrap">
        <input
          value={query}
          placeholder={placeholder || "Search your playlists…"}
          onFocus={() => {
            setOpen(true);
            load();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
            if (e.target.value === "") onChange("", "");
          }}
          onKeyDown={onKeyDown}
        />
        {status === "loading" && <span className="picker-spinner" aria-hidden />}
      </div>

      {open && (
        <div className="picker-menu">
          {status === "error" && (
            <div className="picker-empty">
              <span>{error}</span>
            </div>
          )}
          {status === "ready" && filtered.length === 0 && (
            <div className="picker-empty">No playlists match "{query}"</div>
          )}
          {status === "ready" &&
            filtered.map((p, i) => (
              <button
                type="button"
                key={p.id}
                className={`picker-option ${i === highlight ? "highlight" : ""} ${p.id === playlistId ? "selected" : ""}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => select(p)}
              >
                {p.image ? (
                  <img src={p.image} alt="" className="picker-thumb" />
                ) : (
                  <span className="picker-thumb picker-thumb-placeholder" />
                )}
                <span className="picker-option-text">
                  <span className="picker-option-name">{p.name}</span>
                  <span className="picker-option-meta">{p.track_count} tracks</span>
                </span>
              </button>
            ))}
          <button type="button" className="picker-toggle" onClick={() => setManual(true)}>
            Can't find it? Enter playlist ID manually
          </button>
        </div>
      )}
    </div>
  );
}
