from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.database import get_session
from app.models import ServiceName
from app.schemas import PlaylistRead
from app.services import spotify_client, ytmusic_client

router = APIRouter(prefix="/api/playlists", tags=["playlists"])


@router.get("/{service}", response_model=list[PlaylistRead])
def list_playlists(service: ServiceName, session: Session = Depends(get_session)):
    try:
        if service == ServiceName.spotify:
            sp = spotify_client.get_client(session)
            return spotify_client.list_playlists(sp)
        yt = ytmusic_client.get_client(session)
        return ytmusic_client.list_playlists(yt)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Couldn't load {service.value} playlists: {exc}"
        ) from exc
