from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app import scheduler
from app.database import get_session
from app.models import SyncRule, SyncRun
from app.schemas import SyncRuleCreate, SyncRuleRead, SyncRuleUpdate, SyncRunRead
from app.services.sync_engine import run_sync

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
    return run_sync(session, rule)


@router.get("/{rule_id}/runs", response_model=list[SyncRunRead])
def list_runs(rule_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(SyncRun).where(SyncRun.rule_id == rule_id).order_by(SyncRun.started_at.desc()).limit(50)
    ).all()
