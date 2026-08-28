from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models import RunStatus, ScheduleType, ServiceName, SyncMode


class SyncRuleCreate(BaseModel):
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


class SyncRuleUpdate(BaseModel):
    name: Optional[str] = None
    source_service: Optional[ServiceName] = None
    source_playlist_id: Optional[str] = None
    source_playlist_name: Optional[str] = None
    dest_service: Optional[ServiceName] = None
    dest_playlist_id: Optional[str] = None
    dest_playlist_name: Optional[str] = None
    mode: Optional[SyncMode] = None
    schedule_type: Optional[ScheduleType] = None
    schedule_interval_minutes: Optional[int] = None
    schedule_cron: Optional[str] = None
    enabled: Optional[bool] = None


class SyncRuleRead(BaseModel):
    id: int
    name: str
    source_service: ServiceName
    source_playlist_id: str
    source_playlist_name: str
    dest_service: ServiceName
    dest_playlist_id: str
    dest_playlist_name: str
    mode: SyncMode
    schedule_type: ScheduleType
    schedule_interval_minutes: Optional[int]
    schedule_cron: Optional[str]
    enabled: bool
    created_at: datetime
    updated_at: datetime


class SyncRunRead(BaseModel):
    id: int
    rule_id: int
    status: RunStatus
    started_at: datetime
    finished_at: Optional[datetime]
    tracks_added: int
    tracks_removed: int
    tracks_unmatched: int
    error_message: Optional[str]


class WebhookSettings(BaseModel):
    enabled: bool = False
    url: str = ""
    notify_on: str = "failure"  # "failure" | "always"


class ConnectionStatus(BaseModel):
    service: ServiceName
    connected: bool
    account_label: str = ""


class PlaylistRead(BaseModel):
    id: str
    name: str
    track_count: int = 0
    image: Optional[str] = None
