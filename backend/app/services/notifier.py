from __future__ import annotations

import logging

import httpx
from sqlmodel import Session

from app.models import RunStatus, SyncRule, SyncRun
from app.settings_store import get_setting

logger = logging.getLogger(__name__)


def get_webhook_config(session: Session) -> dict:
    return {
        "enabled": get_setting(session, "webhook_enabled", "false") == "true",
        "url": get_setting(session, "webhook_url", "") or "",
        "notify_on": get_setting(session, "webhook_notify_on", "failure") or "failure",
    }


def notify_run_result(session: Session, rule: SyncRule, run: SyncRun) -> None:
    config = get_webhook_config(session)
    if not config["enabled"] or not config["url"]:
        return

    is_failure = run.status == RunStatus.failed
    if config["notify_on"] == "failure" and not is_failure:
        return

    title = f"[{'FAILED' if is_failure else run.status.value.upper()}] {rule.name}"
    lines = [
        f"{rule.source_service.value} → {rule.dest_service.value}",
        f"added {run.tracks_added}, removed {run.tracks_removed}, unmatched {run.tracks_unmatched}",
    ]
    if run.error_message:
        lines.append(f"error: {run.error_message}")
    message = "\n".join(lines)

    payload = {
        "title": title,
        "message": message,
        # Generic fields that also work as a Discord/Slack-style webhook body.
        "content": f"**{title}**\n{message}",
        "text": f"*{title}*\n{message}",
    }

    try:
        httpx.post(config["url"], json=payload, timeout=10)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to send webhook notification")
