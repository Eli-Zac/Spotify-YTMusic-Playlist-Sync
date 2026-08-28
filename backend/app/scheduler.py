from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import Session, select

from app.database import engine
from app.models import ScheduleType, SyncRule
from app.services.sync_engine import run_sync

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler()


def _job_id(rule_id: int) -> str:
    return f"sync-rule-{rule_id}"


def run_rule_by_id(rule_id: int) -> None:
    with Session(engine) as session:
        rule = session.get(SyncRule, rule_id)
        if not rule or not rule.enabled:
            return
        try:
            run_sync(session, rule)
        except Exception:  # noqa: BLE001
            logger.exception("Scheduled sync failed for rule %s", rule_id)


def schedule_rule(rule: SyncRule) -> None:
    job_id = _job_id(rule.id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if not rule.enabled:
        return

    if rule.schedule_type == ScheduleType.cron and rule.schedule_cron:
        trigger = CronTrigger.from_crontab(rule.schedule_cron)
    else:
        minutes = rule.schedule_interval_minutes or 60
        trigger = IntervalTrigger(minutes=minutes)

    scheduler.add_job(run_rule_by_id, trigger=trigger, id=job_id, args=[rule.id], replace_existing=True)


def unschedule_rule(rule_id: int) -> None:
    job_id = _job_id(rule_id)
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)


def load_all_rules() -> None:
    with Session(engine) as session:
        rules = session.exec(select(SyncRule)).all()
        for rule in rules:
            schedule_rule(rule)


def start() -> None:
    load_all_rules()
    scheduler.start()


def shutdown() -> None:
    scheduler.shutdown(wait=False)
