from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app.database import get_session
from app.services import ytmusic_client

router = APIRouter(prefix="/api/auth/ytmusic", tags=["auth-ytmusic"])


class ConnectPayload(BaseModel):
    headers_raw: str


@router.post("/connect")
def connect(payload: ConnectPayload, session: Session = Depends(get_session)):
    try:
        ytmusic_client.store_browser_headers(session, payload.headers_raw)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"connected": True}


@router.delete("")
def disconnect(session: Session = Depends(get_session)):
    cred = ytmusic_client.get_credential(session)
    if cred:
        session.delete(cred)
        session.commit()
    ytmusic_client.clear_needs_reauth(session)
    return {"disconnected": True}
