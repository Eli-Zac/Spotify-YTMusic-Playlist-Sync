import { RunStatus } from "../api/client";

const CLASS: Record<RunStatus, string> = {
  success: "ok",
  partial: "warn",
  failed: "err",
  running: "muted",
};

export default function StatusBadge({ status }: { status: RunStatus }) {
  return <span className={`badge ${CLASS[status]}`}>{status}</span>;
}
