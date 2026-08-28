import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import settings


def _derive_key() -> bytes:
    key = settings.encryption_key
    if not key:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set. Generate one with: "
            "python -c \"import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())\""
        )
    # Accept either a proper Fernet key or an arbitrary passphrase (hashed to 32 bytes).
    try:
        Fernet(key.encode())
        return key.encode()
    except Exception:
        digest = hashlib.sha256(key.encode()).digest()
        return base64.urlsafe_b64encode(digest)


def _fernet() -> Fernet:
    return Fernet(_derive_key())


def encrypt(value: str) -> str:
    if value is None:
        return value
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    if value is None:
        return value
    return _fernet().decrypt(value.encode()).decode()
