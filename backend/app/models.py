from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class ServiceName(str, Enum):
    spotify = "spotify"
    ytmusic = "ytmusic"


class SyncMode(str, Enum):
    mirror = "mirror"
    additive = "additive"


class ScheduleType(str, Enum):
    interval = "interval"
    cron = "cron"


class Credential(SQLModel, table=True):
    """One row per connected service (spotify / ytmusic). Single-user instance."""

    id: Optional[int] = Field(default=None, primary_key=True)
    service: ServiceName = Field(unique=True, index=True)
    account_label: str = ""
    access_token_enc: str
    refresh_token_enc: Optional[str] = None
    expires_at: Optional[datetime] = None
    extra_enc: Optional[str] = None  # for ytmusicapi oauth json blob etc.
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SyncRule(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str

    source_service: ServiceName
    source_playlist_id: str
    source_playlist_name: str = ""

    dest_service: ServiceName
    dest_playlist_id: str
    dest_playlist_name: str = ""

    mode: SyncMode = SyncMode.additive

    schedule_type: ScheduleType = ScheduleType.interval
    schedule_interval_minutes: Optional[int] = 60
    schedule_cron: Optional[str] = None

    enabled: bool = True

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RunStatus(str, Enum):
    success = "success"
    partial = "partial"
    failed = "failed"
    running = "running"


class SyncRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    rule_id: int = Field(foreign_key="syncrule.id", index=True)
    status: RunStatus = RunStatus.running
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None
    tracks_added: int = 0
    tracks_removed: int = 0
    tracks_unmatched: int = 0
    error_message: Optional[str] = None
    detail_json: Optional[str] = None


class AppSetting(SQLModel, table=True):
    """Simple key/value store for global settings (webhook url, etc.)."""

    key: str = Field(primary_key=True)
    value: Optional[str] = None
