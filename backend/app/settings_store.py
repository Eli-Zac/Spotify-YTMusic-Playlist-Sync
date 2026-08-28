from sqlmodel import Session, select

from app.models import AppSetting


def get_setting(session: Session, key: str, default: str | None = None) -> str | None:
    row = session.get(AppSetting, key)
    return row.value if row else default


def set_setting(session: Session, key: str, value: str | None) -> None:
    row = session.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value=value)
    else:
        row.value = value
    session.add(row)
    session.commit()


def all_settings(session: Session) -> dict[str, str | None]:
    rows = session.exec(select(AppSetting)).all()
    return {r.key: r.value for r in rows}
