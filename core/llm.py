"""LLM-Factory: Gemini mit temperature=0 (bezahlter API-Key, kein Rate-Limit)."""

import os

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

from core.config import MODELL_NAME

load_dotenv()


def get_llm() -> ChatGoogleGenerativeAI:
    if not os.getenv("GOOGLE_API_KEY"):
        raise RuntimeError(
            "GOOGLE_API_KEY fehlt. Lege eine .env-Datei an (siehe .env.example) "
            "und trage den Key von https://aistudio.google.com/apikey ein."
        )
    return ChatGoogleGenerativeAI(
        model=MODELL_NAME,
        temperature=0,  # reproduzierbare Bewertungen
    )
