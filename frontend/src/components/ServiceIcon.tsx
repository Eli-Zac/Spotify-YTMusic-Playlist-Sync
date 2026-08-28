import { ServiceName } from "../api/client";

export default function ServiceIcon({ service, size = 16 }: { service: ServiceName; size?: number }) {
  if (service === "spotify") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="svc-icon svc-spotify">
        <circle cx="12" cy="12" r="11" fill="#1DB954" />
        <path
          d="M6.5 9.8c3.2-1 7.6-.6 10.3 1"
          stroke="#0b0f0c"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M6.9 12.9c2.7-.8 6.3-.5 8.7.9"
          stroke="#0b0f0c"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M7.3 15.9c2.2-.6 5-.4 7 .8"
          stroke="#0b0f0c"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="svc-icon svc-ytmusic">
      <circle cx="12" cy="12" r="11" fill="#FF3B3B" />
      <circle cx="12" cy="12" r="6.4" fill="#0b0f0c" />
      <circle cx="12" cy="12" r="5.2" fill="#FF3B3B" />
      <path d="M10.3 9.4l4 2.6-4 2.6z" fill="#0b0f0c" />
    </svg>
  );
}
