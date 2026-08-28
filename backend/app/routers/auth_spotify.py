from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.database import get_session
from app.services import spotify_client

router = APIRouter(prefix="/api/auth/spotify", tags=["auth-spotify"])


@router.get("/login")
def login():
    oauth = spotify_client.build_oauth()
    return RedirectResponse(oauth.get_authorize_url())


@router.get("/callback")
def callback(code: str, session: Session = Depends(get_session)):
    oauth = spotify_client.build_oauth()
    try:
        token_info = oauth.get_access_token(code, as_dict=True, check_cache=False)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Spotify auth failed: {exc}") from exc

    spotify_client.store_token(session, token_info)

    try:
        sp = spotify_client.get_client(session)
        me = sp.me()
        spotify_client.store_token(session, token_info, account_label=me.get("display_name") or me.get("id", ""))
    except Exception:  # noqa: BLE001
        pass

    return RedirectResponse("/#/settings?connected=spotify")


@router.delete("")
def disconnect(session: Session = Depends(get_session)):
    cred = spotify_client.get_credential(session)
    if cred:
        session.delete(cred)
        session.commit()
    return {"disconnected": True}
