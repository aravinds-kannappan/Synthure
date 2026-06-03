"""Environment configuration via pydantic-settings."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # Anthropic
    anthropic_api_key: str = ""

    # Auth
    jwt_secret: str = "synthure-demo-secret-2024"

    # Integrations
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    sendgrid_api_key: str = ""
    stripe_secret_key: str = ""

    # App
    environment: str = "development"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
