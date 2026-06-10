"""Zentrale Konfiguration: Modell, Kriterien-Gewichtung und Pfade."""

from pathlib import Path

PROJEKT_ROOT = Path(__file__).resolve().parents[1]
DB_PFAD = PROJEKT_ROOT / "data" / "ergebnisse.db"
STELLE_PFAD = PROJEKT_ROOT / "data" / "stellenausschreibung.md"
UPLOADS_PFAD = PROJEKT_ROOT / "data" / "uploads"

# https://aistudio.google.com/apikey
MODELL_NAME = "gemini-2.5-flash"

# Gewichtung der Bewertungskriterien fuer den Gesamt-Score (Summe = 1.0).
# Der Gesamt-Score wird deterministisch in Python berechnet, NICHT vom LLM.
KRITERIEN_GEWICHTE = {
    "berufserfahrung": 0.35,
    "skills": 0.35,
    "ausbildung": 0.20,
    "sprachkenntnisse": 0.10,
}

# Schwellen fuer die Empfehlung (Gesamt-Score auf Skala 10-100)
SCHWELLE_EINLADEN = 75.0
SCHWELLE_PRUEFEN = 50.0
