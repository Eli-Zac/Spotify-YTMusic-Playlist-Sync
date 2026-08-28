from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app import scheduler
from app.database import get_session
from app.models import SyncRule, SyncRun
from app.schemas import SyncRuleCreate, SyncRuleRead, SyncRuleUpdate, SyncRunRead
from app.services import sync_engine

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("", response_model=list[SyncRuleRead])
def list_rules(session: Session = Depends(get_session)):
    return session.exec(select(SyncRule)).all()


@router.post("", response_model=SyncRuleRead)
def create_rule(payload: SyncRuleCreate, session: Session = Depends(get_session)):
    rule = SyncRule(**payload.model_dump())
    session.add(rule)
    session.commit()
    session.refresh(rule)
    scheduler.schedule_rule(rule)
    return rule


@router.get("/{rule_id}", response_model=SyncRuleRead)
def get_rule(rule_id: int, session: Session = Depends(get_session)):
    rule = session.get(SyncRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.patch("/{rule_id}", response_model=SyncRuleRead)
def update_rule(rule_id: int, payload: SyncRuleUpdate, session: Session = Depends(get_session)):
    rule = session.get(SyncRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    session.add(rule)
    session.commit()
    session.refresh(rule)
    scheduler.schedule_rule(rule)
    return rule


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, session: Session = Depends(get_session)):
    rule = session.get(SyncRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    scheduler.unschedule_rule(rule_id)
    session.delete(rule)
    session.commit()
    return {"deleted": True}


@router.post("/{rule_id}/run", response_model=SyncRunRead)
def run_now(rule_id: int, session: Session = Depends(get_session)):
    rule = session.get(SyncRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    # A large playlist can take minutes (one match/search call per track) - running
    # it inline would block this request past Cloudflare's edge timeout (524).
    # Create the run row and hand the actual work to the background scheduler;
    # the frontend polls /runs for completion instead of waiting on this response.
    run = sync_engine.create_run(session, rule)
    scheduler.scheduler.add_job(
        sync_engine.run_by_id_in_background, args=[rule.id, run.id], id=f"run-now-{run.id}"
    )
    return run


@router.get("/{rule_id}/runs", response_model=list[SyncRunRead])
def list_runs(rule_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(SyncRun).where(SyncRun.rule_id == rule_id).order_by(SyncRun.started_at.desc()).limit(50)
    ).all()
