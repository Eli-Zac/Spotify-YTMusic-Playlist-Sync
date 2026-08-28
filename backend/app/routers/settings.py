from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.models import ServiceName
from app.schemas import ConnectionStatus, WebhookSettings
from app.services import spotify_client, ytmusic_client
from app.settings_store import set_setting
from app.services.notifier import get_webhook_config

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/connections", response_model=list[ConnectionStatus])
def connections(session: Session = Depends(get_session)):
    spotify_cred = spotify_client.get_credential(session)
    ytmusic_cred = ytmusic_client.get_credential(session)
    return [
        ConnectionStatus(
            service=ServiceName.spotify,
            connected=spotify_cred is not None,
            account_label=spotify_cred.account_label if spotify_cred else "",
        ),
        ConnectionStatus(
            service=ServiceName.ytmusic,
            connected=ytmusic_cred is not None,
            account_label=ytmusic_cred.account_label if ytmusic_cred else "",
        ),
    ]


@router.get("/webhook", response_model=WebhookSettings)
def get_webhook(session: Session = Depends(get_session)):
    return WebhookSettings(**get_webhook_config(session))


@router.put("/webhook", response_model=WebhookSettings)
def update_webhook(payload: WebhookSettings, session: Session = Depends(get_session)):
    set_setting(session, "webhook_enabled", "true" if payload.enabled else "false")
    set_setting(session, "webhook_url", payload.url)
    set_setting(session, "webhook_notify_on", payload.notify_on)
    return payload
