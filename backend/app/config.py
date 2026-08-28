from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    data_dir: str = "/data"
    database_url: str = ""
    encryption_key: str = ""

    spotify_client_id: str = ""
    spotify_client_secret: str = ""
    spotify_redirect_uri: str = "http://localhost:8000/api/auth/spotify/callback"

    ytmusic_oauth_client_id: str = ""
    ytmusic_oauth_client_secret: str = ""

    public_base_url: str = "http://localhost:8000"

    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        Path(self.data_dir).mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{self.data_dir}/app.db"


settings = Settings()
