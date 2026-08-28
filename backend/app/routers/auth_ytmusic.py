from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.database import get_session
from app.services import ytmusic_client

router = APIRouter(prefix="/api/auth/ytmusic", tags=["auth-ytmusic"])


@router.post("/start")
def start():
    try:
        return ytmusic_client.start_device_auth()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/complete")
def complete(session: Session = Depends(get_session)):
    try:
        return ytmusic_client.complete_device_auth(session)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("")
def disconnect(session: Session = Depends(get_session)):
    cred = ytmusic_client.get_credential(session)
    if cred:
        session.delete(cred)
        session.commit()
    return {"disconnected": True}
