from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/costcenter_db"
    AZURE_TENANT_ID: str = ""
    AZURE_CLIENT_ID: str = ""
    SECRET_KEY: str = "changeme-use-a-real-secret-in-production"
    UPLOAD_DIR: str = "uploads"

    model_config = {"env_file": ".env"}


settings = Settings()
