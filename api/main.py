"""FastAPI-Schicht um die LangChain-Pipeline.

Start:  uvicorn api.main:app --reload --port 8000
Das Next.js-Frontend (web/) proxied /api/* hierher.

Ablauf: Uploads landen sofort als *Entwurf* in SQLite + data/uploads/
(ueberleben damit einen Seiten-Reload). Die Analyse laeuft auf den
gespeicherten Dateien; ein erfolgreich analysierter Entwurf wandert in den
Verlauf und wird als Entwurf geloescht.
"""

import json
import os
import secrets
import sys
from contextvars import ContextVar
from pathlib import Path
from typing import Literal

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from pathlib import Path as PfadTyp

from core import storage
from core.agent import beantworte_frage
from core.config import (
    KRITERIEN_GEWICHTE,
    MODELL_NAME,
    SCHWELLE_EINLADEN,
    SCHWELLE_PRUEFEN,
    STELLE_PFAD,
)
from core.eingang import build_aufteilungs_chain, sortiere_pdf
from core.llm import api_key_vorhanden, get_llm
from core.pipeline import PIPELINE_SCHRITTE, build_screening_pipeline
from core.schemas import (
    DOKUMENT_LABELS,
    DOKUMENT_LABELS_EN,
    GRUND_LABELS,
    GRUND_LABELS_EN,
    KO_LABELS,
    KO_LABELS_EN,
    KRITERIUM_LABELS,
    KRITERIUM_LABELS_EN,
)

app = FastAPI(title="TalentLens API")

# Beim Hosting die Frontend-Domain erlauben (nur noetig, falls das Frontend
# das Backend direkt statt ueber den Next-Proxy aufruft).
_frontend_origin = os.getenv("TALENTLENS_FRONTEND_ORIGIN", "").strip()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"]
    + ([_frontend_origin] if _frontend_origin else []),
    allow_methods=["*"],
    allow_headers=["*"],
)

_pipeline = None
_aufteilungs_chain = None

# Schutz gegen versehentliche/boeswillige Riesen-Uploads (relevant fuers Hosting)
MAX_DATEIEN_PRO_UPLOAD = 20
MAX_DATEI_BYTES = 15 * 1024 * 1024  # 15 MB pro PDF

# UI-Sprache des Aufrufers (X-Sprache-Header, vom Frontend mitgeschickt).
# Wird pro Request in der Middleware gesetzt, damit Fehlermeldungen in der
# Sprache des Dashboards erscheinen. Default "de" haelt CLI/Tests unveraendert.
_SPRACHE: ContextVar[str] = ContextVar("sprache", default="de")


def _t(de: str, en: str, sprache: str | None = None) -> str:
    """Text in der Request-Sprache. sprache uebersteuert den Header-Wert -
    noetig im Streaming-Endpoint, dessen Generator ausserhalb des
    Middleware-Kontexts laeuft."""
    return en if (sprache or _SPRACHE.get()) == "en" else de


def _passwort() -> str:
    """Optionales Zugriffs-Passwort (fuers Hosting). Leer = kein Schutz."""
    return os.getenv("TALENTLENS_PASSWORT", "").strip()


@app.middleware("http")
async def passwort_schutz(request: Request, call_next):
    """Ist TALENTLENS_PASSWORT gesetzt, brauchen alle Endpoints ausser
    /api/health den passenden X-Passwort-Header. Lokal ohne gesetzte
    Variable aendert sich nichts. Setzt ausserdem die Request-Sprache
    fuer _t() aus dem X-Sprache-Header."""
    _SPRACHE.set("en" if request.headers.get("x-sprache") == "en" else "de")
    erwartet = _passwort()
    if (
        erwartet
        and request.url.path != "/api/health"
        and request.method != "OPTIONS"
    ):
        geliefert = request.headers.get("x-passwort", "")
        if not secrets.compare_digest(geliefert, erwartet):
            return JSONResponse(
                status_code=401,
                content={"detail": _t(
                    "Passwort fehlt oder ist falsch.",
                    "Password missing or incorrect.",
                )},
            )
    return await call_next(request)


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


def _quota_exception(sprache: str | None = None) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail=_t(
            "Gemini-Rate-Limit erreicht: Gerade laufen zu viele Anfragen "
            "gleichzeitig. Einen Moment warten und erneut versuchen - der "
            "Entwurf bleibt erhalten. (Tritt es dauerhaft auf: Quota-Limits "
            "im Google-Cloud-Projekt pruefen.)",
            "Gemini rate limit reached: too many requests are running at "
            "once. Wait a moment and try again - the draft is kept. (If it "
            "persists: check the quota limits in the Google Cloud project.)",
            sprache,
        ),
    )


def _ist_quota_fehler(e: Exception) -> bool:
    meldung = str(e)
    return "RESOURCE_EXHAUSTED" in meldung or "429" in meldung


@app.exception_handler(Exception)
async def unbehandelte_fehler(request: Request, exc: Exception):
    """Macht JEDEN unbehandelten Fehler im UI sichtbar (Fehlertyp + Klartext),
    statt nur 'Internal Server Error'. HTTPExceptions haben ihren eigenen
    Handler und landen hier nicht."""
    if _ist_quota_fehler(exc):
        return JSONResponse(status_code=429, content={"detail": _quota_exception().detail})
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {str(exc)[:500]}"},
    )


class EntwurfDaten(BaseModel):
    kandidat: str = "Bewerbung"


def _entwurf_oder_404(entwurf_id: int) -> dict:
    entwurf = storage.lade_entwurf(entwurf_id)
    if entwurf is None:
        raise HTTPException(
            status_code=404,
            detail=_t("Entwurf nicht gefunden.", "Draft not found."),
        )
    return entwurf


@app.get("/api/health")
def health():
    """Schnelle Selbstdiagnose: Ist der API-Key geladen? (Ohne den Key zu zeigen.)"""
    return {
        "ok": api_key_vorhanden(),
        "api_key_geladen": api_key_vorhanden(),
        "passwort_erforderlich": bool(_passwort()),
        "modell": MODELL_NAME,
    }


@app.get("/api/stelle")
def stelle():
    text = STELLE_PFAD.read_text(encoding="utf-8") if STELLE_PFAD.exists() else ""
    return {"text": text}


@app.get("/api/konfiguration")
def konfiguration():
    """Echte Konfigurationswerte fuer den Doku-Tab - immer synchron zum Code."""
    return {
        "modell": MODELL_NAME,
        "gewichte": KRITERIEN_GEWICHTE,
        "schwelle_einladen": SCHWELLE_EINLADEN,
        "schwelle_pruefen": SCHWELLE_PRUEFEN,
    }


@app.get("/api/labels")
def labels():
    """Anzeige-Labels fuer Enums in beiden Sprachen, damit das Frontend sie
    nicht duplizieren muss und der Sprachwechsel ohne Neuladen klappt."""
    return {
        "de": {
            "gruende": {k.value: v for k, v in GRUND_LABELS.items()},
            "kriterien": {k.value: v for k, v in KRITERIUM_LABELS.items()},
            "ko": {k.value: v for k, v in KO_LABELS.items()},
            "dokumente": {k.value: v for k, v in DOKUMENT_LABELS.items()},
        },
        "en": {
            "gruende": {k.value: v for k, v in GRUND_LABELS_EN.items()},
            "kriterien": {k.value: v for k, v in KRITERIUM_LABELS_EN.items()},
            "ko": {k.value: v for k, v in KO_LABELS_EN.items()},
            "dokumente": {k.value: v for k, v in DOKUMENT_LABELS_EN.items()},
        },
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
    if len(dateien) > MAX_DATEIEN_PRO_UPLOAD:
        raise HTTPException(
            status_code=413,
            detail=_t(
                f"Maximal {MAX_DATEIEN_PRO_UPLOAD} Dateien pro Upload.",
                f"At most {MAX_DATEIEN_PRO_UPLOAD} files per upload.",
            ),
        )
    for datei in dateien:
        if not (datei.filename or "").lower().endswith(".pdf"):
            continue
        inhalt = datei.file.read()
        if len(inhalt) > MAX_DATEI_BYTES:
            mb = MAX_DATEI_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=_t(
                    f"{datei.filename}: Datei groesser als {mb} MB.",
                    f"{datei.filename}: file larger than {mb} MB.",
                ),
            )
        storage.speichere_entwurf_datei(entwurf_id, datei.filename, inhalt)
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
    if len(dateien) > MAX_DATEIEN_PRO_UPLOAD:
        raise HTTPException(
            status_code=413,
            detail=_t(
                f"Maximal {MAX_DATEIEN_PRO_UPLOAD} Dateien pro Upload.",
                f"At most {MAX_DATEIEN_PRO_UPLOAD} files per upload.",
            ),
        )
    verarbeitet, fehler = [], []
    for datei in dateien:
        name = datei.filename or "datei.pdf"
        if not name.lower().endswith(".pdf"):
            fehler.append({
                "datei": name,
                "meldung": _t("Keine PDF-Datei.", "Not a PDF file."),
            })
            continue
        inhalt = datei.file.read()
        if len(inhalt) > MAX_DATEI_BYTES:
            mb = MAX_DATEI_BYTES // (1024 * 1024)
            fehler.append({
                "datei": name,
                "meldung": _t(
                    f"Datei groesser als {mb} MB.",
                    f"File larger than {mb} MB.",
                ),
            })
            continue
        try:
            sortiert = sortiere_pdf(name, inhalt, get_aufteilungs_chain())
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

def _analyse_eingabe(
    entwurf_id: int,
    stelle: str,
    kandidat: str | None,
    lebenslauf_erforderlich: bool,
    motivationsschreiben_erforderlich: bool,
    sprache: str,
) -> dict:
    """Entwurf validieren und den Pipeline-Input bauen (404/422 bei Problemen)."""
    entwurf = _entwurf_oder_404(entwurf_id)
    dateien = storage.entwurf_dateien(entwurf_id)
    if not dateien:
        raise HTTPException(
            status_code=422,
            detail=_t(
                "Entwurf enthaelt keine PDFs.",
                "Draft contains no PDFs.",
                sprache,
            ),
        )
    return {
        "dateien": [{"name": d["name"], "pfad": d["pfad"]} for d in dateien],
        "stelle": stelle,
        "kandidat": (kandidat or entwurf["kandidat"]).strip() or entwurf["kandidat"],
        "sprache": sprache,  # Ausgabesprache der LLM-Bewertung
        "ko_kriterien": {
            "lebenslauf_erforderlich": lebenslauf_erforderlich,
            "motivationsschreiben_erforderlich": motivationsschreiben_erforderlich,
        },
    }


def _analyse_fehler(e: Exception, sprache: str | None = None) -> HTTPException:
    """Pipeline-Fehler auf verstaendliche HTTP-Fehler abbilden."""
    if isinstance(e, RuntimeError):  # z.B. fehlender API-Key
        return HTTPException(status_code=500, detail=str(e))
    if isinstance(e, ValueError):  # z.B. gescanntes PDF ohne Text
        return HTTPException(status_code=422, detail=str(e))
    if _ist_quota_fehler(e):
        return _quota_exception(sprache)
    return HTTPException(
        status_code=502,
        detail=_t("Analyse fehlgeschlagen: ", "Analysis failed: ", sprache)
        + str(e)[:300],
    )


def _ergebnis_speichern(entwurf_id: int, ergebnis: dict) -> dict:
    """Ergebnis in den Verlauf uebernehmen und als API-Antwort aufbereiten."""
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


@app.post("/api/entwuerfe/{entwurf_id}/analysieren")
def analysieren(
    entwurf_id: int,
    stelle: str = Form(...),
    kandidat: str = Form(None),
    lebenslauf_erforderlich: bool = Form(True),
    motivationsschreiben_erforderlich: bool = Form(False),
    sprache: str = Form("de"),
):
    """Bewertet einen Entwurf. Synchroner Endpoint (def, nicht async)
    -> FastAPI fuehrt ihn im Threadpool aus; das Frontend ruft pro
    Bewerbung auf und zeigt so den Fortschritt pro Kandidat."""
    eingabe = _analyse_eingabe(
        entwurf_id, stelle, kandidat,
        lebenslauf_erforderlich, motivationsschreiben_erforderlich, sprache,
    )
    try:
        ergebnis = get_pipeline().invoke(eingabe)
    except Exception as e:
        raise _analyse_fehler(e, sprache)
    return _ergebnis_speichern(entwurf_id, ergebnis)


@app.post("/api/entwuerfe/{entwurf_id}/analysieren/live")
async def analysieren_live(
    entwurf_id: int,
    stelle: str = Form(...),
    kandidat: str = Form(None),
    lebenslauf_erforderlich: bool = Form(True),
    motivationsschreiben_erforderlich: bool = Form(False),
    sprache: str = Form("de"),
):
    """Wie /analysieren, aber als NDJSON-Stream: Pro abgeschlossenem
    Pipeline-Schritt kommt sofort eine Zeile {"typ": "schritt", ...} - das
    Frontend zeichnet daraus das Live-Diagramm. Die Events liefert
    LangChains astream_events() ueber die benannten Runnables der Kette.
    Fehler kommen als {"typ": "fehler"}-Zeile, weil der HTTP-Status 200
    beim Streamen schon gesendet ist."""
    eingabe = _analyse_eingabe(
        entwurf_id, stelle, kandidat,
        lebenslauf_erforderlich, motivationsschreiben_erforderlich, sprache,
    )

    def zeile(daten: dict) -> str:
        return json.dumps(daten, ensure_ascii=False) + "\n"

    async def strom():
        ergebnis = None
        try:
            async for event in get_pipeline().astream_events(eingabe):
                if event["event"] != "on_chain_end":
                    continue
                name = event.get("name")
                if name in PIPELINE_SCHRITTE:
                    schritt: dict = {"typ": "schritt", "schritt": name}
                    ausgabe = event["data"].get("output")
                    # Zweig-Entscheidung bzw. Korrektur direkt mitgeben,
                    # damit das Diagramm nicht auf das Endergebnis warten muss
                    if name == "ko_pruefung" and isinstance(ausgabe, dict):
                        grund = ausgabe.get("ko_grund")
                        schritt["ko_grund"] = grund.value if grund else None
                    if name == "selbstkritik" and isinstance(ausgabe, dict):
                        schritt["korrigiert"] = bool(ausgabe.get("korrigiert"))
                    yield zeile(schritt)
                elif not event.get("parent_ids"):  # Wurzel-Kette: Endergebnis
                    ergebnis = event["data"].get("output")
        except Exception as e:
            fehler = _analyse_fehler(e, sprache)
            yield zeile({
                "typ": "fehler",
                "detail": fehler.detail,
                "status": fehler.status_code,
            })
            return
        if ergebnis is None:
            yield zeile({
                "typ": "fehler",
                "detail": _t(
                    "Analyse lieferte kein Ergebnis.",
                    "Analysis returned no result.",
                    sprache,
                ),
                "status": 502,
            })
            return
        yield zeile({"typ": "ergebnis", **_ergebnis_speichern(entwurf_id, ergebnis)})

    return StreamingResponse(
        strom(),
        media_type="application/x-ndjson",
        # Puffern unterwegs (Proxys) explizit abschalten, sonst kommen die
        # Schritt-Zeilen gebuendelt statt live an
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# --- HR-Assistent (Tool-Calling-Agent) ---------------------------------------

class AssistentNachricht(BaseModel):
    rolle: Literal["nutzer", "assistent"]
    text: str


class AssistentDaten(BaseModel):
    frage: str
    verlauf: list[AssistentNachricht] = []
    stelle: str = ""  # aktuell im Dashboard bearbeitete Ausschreibung
    sprache: Literal["de", "en"] = "de"  # Antwortsprache (folgt der UI)


@app.post("/api/assistent")
def assistent(daten: AssistentDaten):
    """Freie Fragen zu den Screening-Ergebnissen. Anders als die Analyse
    laeuft hier ein Agent (core/agent.py): Das LLM waehlt selbst, welche
    Werkzeuge es aufruft. Die Antwort enthaelt die Tool-Aufrufe, damit das
    UI die Agent-Schritte zeigen kann."""
    frage = daten.frage.strip()
    if not frage:
        raise HTTPException(
            status_code=422,
            detail=_t("Frage ist leer.", "Question is empty.", daten.sprache),
        )
    try:
        return beantworte_frage(
            frage,
            verlauf=[n.model_dump() for n in daten.verlauf],
            stelle=daten.stelle,
            sprache=daten.sprache,
        )
    except RuntimeError as e:  # z.B. fehlender API-Key
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        if _ist_quota_fehler(e):
            raise _quota_exception(daten.sprache)
        raise HTTPException(
            status_code=502,
            detail=_t(
                "Assistent fehlgeschlagen: ",
                "Assistant failed: ",
                daten.sprache,
            )
            + str(e)[:300],
        )


# --- Ergebnisse ------------------------------------------------------------

@app.get("/api/ergebnisse")
def ergebnisse():
    return storage.lade_ergebnisse()


@app.delete("/api/ergebnisse")
def ergebnisse_loeschen():
    storage.loesche_alle()
    return {"ok": True}
