from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/piaoxiaozhu"
    REDIS_URL: str = "redis://localhost:6379/0"

    OSS_ACCESS_KEY_ID: str = ""
    OSS_ACCESS_KEY_SECRET: str = ""
    OSS_ENDPOINT: str = ""
    OSS_BUCKET_NAME: str = ""

    WX_APPID: str = ""
    WX_SECRET: str = ""

    WX_MCH_ID: str = ""
    WX_API_KEY: str = ""
    WX_CERT_PATH: str = ""

    LLM_BASE_URL: str = ""
    LLM_API_KEY: str = ""
    LLM_MODEL_NAME: str = "gpt-4o"

    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
