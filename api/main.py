"""FastAPI-Schicht um die LangChain-Pipeline.

Start:  uvicorn api.main:app --reload --port 8000
Das Next.js-Frontend (web/) proxied /api/* hierher.

Ablauf: Uploads landen sofort als *Entwurf* in SQLite + data/uploads/
(ueberleben damit einen Seiten-Reload). Die Analyse laeuft auf den
gespeicherten Dateien; ein erfolgreich analysierter Entwurf wandert in den
Verlauf und wird als Entwurf geloescht.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pathlib import Path as PfadTyp

from core import storage
from core.config import (
    KRITERIEN_GEWICHTE,
    MODELL_NAME,
    SCHWELLE_EINLADEN,
    SCHWELLE_PRUEFEN,
    STELLE_PFAD,
)
from core.eingang import build_aufteilungs_chain, sortiere_pdf
from core.llm import api_key_vorhanden, get_llm
from core.pipeline import build_screening_pipeline
from core.schemas import DOKUMENT_LABELS, GRUND_LABELS, KO_LABELS, KRITERIUM_LABELS

app = FastAPI(title="TalentLens API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_pipeline = None
_aufteilungs_chain = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = build_screening_pipeline()
    return _pipeline


def get_aufteilungs_chain():
    global _aufteilungs_chain
    if _aufteilungs_chain is None:
        _aufteilungs_chain = build_aufteilungs_chain(get_llm())
    return _aufteilungs_chain


def _quota_exception() -> HTTPException:
    return HTTPException(
        status_code=429,
        detail="Gemini-Quota erschoepft: Der API-Key laeuft im Free Tier "
        "(20 Anfragen/Tag fuer gemini-2.5-flash). Billing im "
        "Google-Cloud-Projekt aktivieren oder bis zum naechsten Tag "
        "warten. Der Entwurf bleibt erhalten.",
    )


def _ist_quota_fehler(e: Exception) -> bool:
    meldung = str(e)
    return "RESOURCE_EXHAUSTED" in meldung or "429" in meldung


class EntwurfDaten(BaseModel):
    kandidat: str = "Bewerbung"


def _entwurf_oder_404(entwurf_id: int) -> dict:
    entwurf = storage.lade_entwurf(entwurf_id)
    if entwurf is None:
        raise HTTPException(status_code=404, detail="Entwurf nicht gefunden.")
    return entwurf


@app.get("/api/health")
def health():
    """Schnelle Selbstdiagnose: Ist der API-Key geladen? (Ohne den Key zu zeigen.)"""
    return {
        "ok": api_key_vorhanden(),
        "api_key_geladen": api_key_vorhanden(),
        "modell": MODELL_NAME,
    }


@app.get("/api/stelle")
def stelle():
    text = STELLE_PFAD.read_text(encoding="utf-8") if STELLE_PFAD.exists() else ""
    return {"text": text}


@app.get("/api/konfiguration")
def konfiguration():
    """Echte Konfigurationswerte fuer den Doku-Tab — immer synchron zum Code."""
    return {
        "modell": MODELL_NAME,
        "gewichte": KRITERIEN_GEWICHTE,
        "schwelle_einladen": SCHWELLE_EINLADEN,
        "schwelle_pruefen": SCHWELLE_PRUEFEN,
    }


@app.get("/api/labels")
def labels():
    """Anzeige-Labels fuer Enums, damit das Frontend sie nicht duplizieren muss."""
    return {
        "gruende": {k.value: v for k, v in GRUND_LABELS.items()},
        "kriterien": {k.value: v for k, v in KRITERIUM_LABELS.items()},
        "ko": {k.value: v for k, v in KO_LABELS.items()},
        "dokumente": {k.value: v for k, v in DOKUMENT_LABELS.items()},
    }


# --- Entwuerfe -------------------------------------------------------------

@app.get("/api/entwuerfe")
def entwuerfe():
    return storage.lade_entwuerfe()


@app.post("/api/entwuerfe")
def entwurf_erstellen(daten: EntwurfDaten):
    return storage.erstelle_entwurf(daten.kandidat)


@app.patch("/api/entwuerfe/{entwurf_id}")
def entwurf_umbenennen(entwurf_id: int, daten: EntwurfDaten):
    _entwurf_oder_404(entwurf_id)
    storage.benenne_entwurf_um(entwurf_id, daten.kandidat)
    return storage.lade_entwurf(entwurf_id)


@app.delete("/api/entwuerfe/{entwurf_id}")
def entwurf_loeschen(entwurf_id: int):
    storage.loesche_entwurf(entwurf_id)
    return {"ok": True}


@app.post("/api/entwuerfe/{entwurf_id}/dateien")
def dateien_hochladen(entwurf_id: int, dateien: list[UploadFile] = File(...)):
    _entwurf_oder_404(entwurf_id)
    for datei in dateien:
        if not (datei.filename or "").lower().endswith(".pdf"):
            continue
        storage.speichere_entwurf_datei(entwurf_id, datei.filename, datei.file.read())
    return storage.lade_entwurf(entwurf_id)


@app.delete("/api/entwuerfe/{entwurf_id}/dateien/{name}")
def datei_loeschen(entwurf_id: int, name: str):
    _entwurf_oder_404(entwurf_id)
    storage.loesche_entwurf_datei(entwurf_id, name)
    return storage.lade_entwurf(entwurf_id)


# --- Posteingang (Bulk-Upload) ----------------------------------------------

@app.post("/api/eingang")
def eingang(dateien: list[UploadFile] = File(...)):
    """Bulk-Upload: gemischte PDFs automatisch aufteilen und Kandidaten
    zuordnen. Ein Sammel-PDF (z.B. 2 Seiten CV + 1 Seite Anschreiben) wird
    in Einzeldokumente zerlegt; Dokumente mit gleichem erkannten Namen
    landen in derselben Bewerbung."""
    verarbeitet, fehler = [], []
    for datei in dateien:
        name = datei.filename or "datei.pdf"
        if not name.lower().endswith(".pdf"):
            fehler.append({"datei": name, "meldung": "Keine PDF-Datei."})
            continue
        try:
            sortiert = sortiere_pdf(name, datei.file.read(), get_aufteilungs_chain())
        except Exception as e:
            if _ist_quota_fehler(e):
                raise _quota_exception()
            fehler.append({"datei": name, "meldung": str(e)[:200]})
            continue

        kandidat = (sortiert["kandidat"] or "").strip() or (
            PfadTyp(name).stem.replace("_", " ").replace("-", " ").title()
        )
        entwurf = (
            storage.finde_entwurf_nach_kandidat(kandidat)
            or storage.erstelle_entwurf(kandidat)
        )
        for dokument in sortiert["dokumente"]:
            storage.speichere_entwurf_datei(
                entwurf["id"], dokument["name"], dokument["inhalt"]
            )
        verarbeitet.append({
            "datei": name,
            "kandidat": kandidat,
            "dokumente": [d["name"] for d in sortiert["dokumente"]],
        })

    return {
        "entwuerfe": storage.lade_entwuerfe(),
        "verarbeitet": verarbeitet,
        "fehler": fehler,
    }


# --- Analyse ---------------------------------------------------------------

@app.post("/api/entwuerfe/{entwurf_id}/analysieren")
def analysieren(
    entwurf_id: int,
    stelle: str = Form(...),
    kandidat: str = Form(None),
    lebenslauf_erforderlich: bool = Form(True),
    motivationsschreiben_erforderlich: bool = Form(False),
):
    """Bewertet einen Entwurf. Synchroner Endpoint (def, nicht async)
    -> FastAPI fuehrt ihn im Threadpool aus; das Frontend ruft pro
    Bewerbung auf und zeigt so den Fortschritt pro Kandidat."""
    entwurf = _entwurf_oder_404(entwurf_id)
    dateien = storage.entwurf_dateien(entwurf_id)
    if not dateien:
        raise HTTPException(status_code=422, detail="Entwurf enthaelt keine PDFs.")

    try:
        ergebnis = get_pipeline().invoke({
            "dateien": [{"name": d["name"], "pfad": d["pfad"]} for d in dateien],
            "stelle": stelle,
            "kandidat": (kandidat or entwurf["kandidat"]).strip() or entwurf["kandidat"],
            "ko_kriterien": {
                "lebenslauf_erforderlich": lebenslauf_erforderlich,
                "motivationsschreiben_erforderlich": motivationsschreiben_erforderlich,
            },
        })
    except RuntimeError as e:  # z.B. fehlender API-Key
        raise HTTPException(status_code=500, detail=str(e))
    except ValueError as e:  # z.B. gescanntes PDF ohne Text
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # LLM-/Netzwerkfehler verstaendlich machen
        if _ist_quota_fehler(e):
            raise _quota_exception()
        raise HTTPException(
            status_code=502, detail=f"Analyse fehlgeschlagen: {str(e)[:300]}"
        )

    ergebnis_id = storage.speichere_ergebnis(ergebnis)
    storage.loesche_entwurf(entwurf_id)  # analysiert -> lebt jetzt im Verlauf

    bewertung = ergebnis.get("bewertung")
    return {
        "id": ergebnis_id,
        "kandidat": ergebnis["kandidat"],
        "status": ergebnis["status"],
        "ko_grund": ergebnis["ko_grund"].value if ergebnis.get("ko_grund") else None,
        "gesamt_score": ergebnis.get("gesamt_score"),
        "empfehlung": ergebnis.get("empfehlung"),
        "korrigiert": ergebnis.get("korrigiert", False),
        "dokumente": [
            {"name": d["name"], "typ": d["typ"].value}
            for d in ergebnis.get("dokumente", [])
        ],
        "bewertung": bewertung.model_dump(mode="json") if bewertung else None,
    }


# --- Ergebnisse ------------------------------------------------------------

@app.get("/api/ergebnisse")
def ergebnisse():
    return storage.lade_ergebnisse()


@app.delete("/api/ergebnisse")
def ergebnisse_loeschen():
    storage.loesche_alle()
    return {"ok": True}
