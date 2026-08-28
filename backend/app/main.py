import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app import scheduler
from app.database import init_db
from app.routers import auth_spotify, auth_ytmusic, playlists, rules, runs, settings as settings_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Spotify ↔ YT Music Playlist Sync", lifespan=lifespan)

app.include_router(auth_spotify.router)
app.include_router(auth_ytmusic.router)
app.include_router(playlists.router)
app.include_router(rules.router)
app.include_router(runs.router)
app.include_router(settings_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


FRONTEND_DIST = Path(__file__).resolve().parent.parent / "static"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static")
