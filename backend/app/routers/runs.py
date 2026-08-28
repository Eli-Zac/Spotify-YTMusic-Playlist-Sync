from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.database import get_session
from app.models import RunStatus, SyncRun
from app.schemas import SyncRunRead
from app.services import sync_engine

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.get("", response_model=list[SyncRunRead])
def list_recent_runs(session: Session = Depends(get_session)):
    return session.exec(select(SyncRun).order_by(SyncRun.started_at.desc()).limit(100)).all()


@router.post("/{run_id}/cancel", response_model=SyncRunRead)
def cancel_run(run_id: int, session: Session = Depends(get_session)):
    run = session.get(SyncRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status != RunStatus.running:
        raise HTTPException(status_code=400, detail=f"Run is already {run.status.value}")
    # Cooperative: the background job checks this at its next safe point (between
    # tracks) rather than being killed outright, since an in-flight external API
    # call can't be interrupted mid-request. The run stays "running" until it
    # actually stops and updates itself.
    sync_engine.request_cancel(run_id)
    return run
