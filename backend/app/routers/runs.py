from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.database import get_session
from app.models import SyncRun
from app.schemas import SyncRunRead

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.get("", response_model=list[SyncRunRead])
def list_recent_runs(session: Session = Depends(get_session)):
    return session.exec(select(SyncRun).order_by(SyncRun.started_at.desc()).limit(100)).all()
