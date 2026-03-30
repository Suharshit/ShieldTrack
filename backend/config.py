"""
config.py — Centralised settings loader
========================================
All configuration lives here. The rest of the app imports from
this module rather than reading environment variables directly.
This makes it easy to change a setting in one place, and to see
at a glance everything the server depends on.
"""

import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    SUPABASE_URL: str       = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    GOOGLE_MAPS_API_KEY: str  = os.getenv("GOOGLE_MAPS_API_KEY", "mock")
    MODEL_PATH: str           = os.getenv("MODEL_PATH", "eta_model.pkl")
    BUS_STALE_THRESHOLD: int  = int(os.getenv("BUS_STALE_THRESHOLD_SECONDS", "60"))
    DEBUG: bool               = os.getenv("DEBUG", "false").lower() == "true"

settings = Settings()
