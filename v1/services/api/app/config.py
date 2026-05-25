from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite+aiosqlite:///./piaoxiaozhu.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7

    WX_APPID: Optional[str] = None
    WX_SECRET: Optional[str] = None
    WX_MCH_ID: Optional[str] = None
    WX_API_KEY: Optional[str] = None
    WX_CERT_PATH: Optional[str] = None

    LLM_BASE_URL: str = "https://api.stepfun.com/v1"
    LLM_API_KEY: str = ""
    LLM_MODEL_NAME: str = "step-1-8k"

    OSS_ACCESS_KEY_ID: Optional[str] = None
    OSS_ACCESS_KEY_SECRET: Optional[str] = None
    OSS_ENDPOINT: Optional[str] = None
    OSS_BUCKET_NAME: Optional[str] = None
    UPLOAD_DIR: str = "./uploads"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
