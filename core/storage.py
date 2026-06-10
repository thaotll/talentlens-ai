"""SQLite-Persistenz: abgeschlossene Bewertungen (Verlauf/Genehmigt) und
hochgeladene Entwuerfe (Screening-Tab), damit Uploads einen Seiten-Reload
ueberleben. Entwurfs-PDFs liegen unter data/uploads/<entwurf_id>/.
"""

import json
import re
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

from core.config import DB_PFAD, UPLOADS_PFAD
from core.schemas import Bewertung

_SCHEMA = """
CREATE TABLE IF NOT EXISTS bewerbungen (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    zeitstempel    TEXT NOT NULL,
    kandidat       TEXT NOT NULL,
    stelle_titel   TEXT NOT NULL,
    status         TEXT NOT NULL,           -- 'genehmigt' | 'abgelehnt'
    ko_grund       TEXT,                    -- NULL, wenn kein K.O.
    gesamt_score   REAL,                    -- NULL bei K.O.
    empfehlung     TEXT,                    -- NULL bei K.O.
    korrigiert     INTEGER NOT NULL DEFAULT 0,
    dokumente_json TEXT NOT NULL,           -- [{"name": ..., "typ": ...}]
    bewertung_json TEXT                     -- NULL bei K.O.
);
CREATE TABLE IF NOT EXISTS entwuerfe (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    zeitstempel TEXT NOT NULL,
    kandidat    TEXT NOT NULL
);
"""


def _verbinde() -> sqlite3.Connection:
    DB_PFAD.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PFAD)
    con.executescript(_SCHEMA)
    return con


def stelle_titel(stelle: str) -> str:
    """Erste nicht-leere Zeile der Ausschreibung als Kurztitel."""
    for zeile in stelle.splitlines():
        zeile = zeile.strip().lstrip("# ")
        if zeile:
            return zeile[:120]
    return "Unbenannte Stelle"


def speichere_ergebnis(ergebnis: dict) -> int:
    """Speichert ein Pipeline-Ergebnis (dict aus core.pipeline), gibt die ID zurueck."""
    dokumente = [
        {"name": d["name"], "typ": d["typ"].value}
        for d in ergebnis.get("dokumente", [])
    ]
    bewertung = ergebnis.get("bewertung")
    con = _verbinde()
    try:
        cursor = con.execute(
            "INSERT INTO bewerbungen (zeitstempel, kandidat, stelle_titel, status, "
            "ko_grund, gesamt_score, empfehlung, korrigiert, dokumente_json, bewertung_json) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                datetime.now().isoformat(timespec="seconds"),
                ergebnis["kandidat"],
                stelle_titel(ergebnis["stelle"]),
                ergebnis["status"],
                ergebnis["ko_grund"].value if ergebnis.get("ko_grund") else None,
                ergebnis.get("gesamt_score"),
                ergebnis.get("empfehlung"),
                int(ergebnis.get("korrigiert", False)),
                json.dumps(dokumente),
                bewertung.model_dump_json() if bewertung else None,
            ),
        )
        con.commit()
        return cursor.lastrowid
    finally:
        con.close()


def lade_ergebnisse() -> list[dict]:
    """Alle gespeicherten Bewerbungen, neueste zuerst."""
    con = _verbinde()
    try:
        zeilen = con.execute(
            "SELECT id, zeitstempel, kandidat, stelle_titel, status, ko_grund, "
            "gesamt_score, empfehlung, korrigiert, dokumente_json, bewertung_json "
            "FROM bewerbungen ORDER BY id DESC"
        ).fetchall()
    finally:
        con.close()

    return [
        {
            "id": z[0],
            "zeitstempel": z[1],
            "kandidat": z[2],
            "stelle_titel": z[3],
            "status": z[4],
            "ko_grund": z[5],
            "gesamt_score": z[6],
            "empfehlung": z[7],
            "korrigiert": bool(z[8]),
            "dokumente": json.loads(z[9]),
            "bewertung": (
                Bewertung.model_validate(json.loads(z[10])).model_dump(mode="json")
                if z[10] else None
            ),
        }
        for z in zeilen
    ]


def loesche_alle() -> None:
    """Verlauf leeren (fuer Demos)."""
    con = _verbinde()
    try:
        con.execute("DELETE FROM bewerbungen")
        con.commit()
    finally:
        con.close()


# --- Entwuerfe (Screening-Tab, noch nicht analysiert) ----------------------

def _entwurf_ordner(entwurf_id: int) -> Path:
    return UPLOADS_PFAD / str(entwurf_id)


def _sicherer_dateiname(name: str) -> str:
    """Nur der Basisname, ohne Pfad-Tricks und Steuerzeichen."""
    name = Path(name).name
    name = re.sub(r"[^\w.\-() ]", "_", name, flags=re.UNICODE).strip()
    return name or "datei.pdf"


def entwurf_dateien(entwurf_id: int) -> list[dict]:
    ordner = _entwurf_ordner(entwurf_id)
    if not ordner.is_dir():
        return []
    return [
        {"name": p.name, "groesse": p.stat().st_size, "pfad": str(p)}
        for p in sorted(ordner.glob("*.pdf"))
    ]


def _entwurf_dict(entwurf_id: int, kandidat: str) -> dict:
    dateien = [
        {"name": d["name"], "groesse": d["groesse"]}
        for d in entwurf_dateien(entwurf_id)
    ]
    return {"id": entwurf_id, "kandidat": kandidat, "dateien": dateien}


def erstelle_entwurf(kandidat: str) -> dict:
    con = _verbinde()
    try:
        cursor = con.execute(
            "INSERT INTO entwuerfe (zeitstempel, kandidat) VALUES (?, ?)",
            (datetime.now().isoformat(timespec="seconds"), kandidat),
        )
        con.commit()
        return _entwurf_dict(cursor.lastrowid, kandidat)
    finally:
        con.close()


def lade_entwuerfe() -> list[dict]:
    con = _verbinde()
    try:
        zeilen = con.execute(
            "SELECT id, kandidat FROM entwuerfe ORDER BY id"
        ).fetchall()
    finally:
        con.close()
    return [_entwurf_dict(z[0], z[1]) for z in zeilen]


def lade_entwurf(entwurf_id: int) -> dict | None:
    con = _verbinde()
    try:
        zeile = con.execute(
            "SELECT id, kandidat FROM entwuerfe WHERE id = ?", (entwurf_id,)
        ).fetchone()
    finally:
        con.close()
    return _entwurf_dict(zeile[0], zeile[1]) if zeile else None


def finde_entwurf_nach_kandidat(kandidat: str) -> dict | None:
    """Entwurf mit gleichem Kandidatennamen (case-insensitiv) - fuer den
    Bulk-Upload, damit CV und Anschreiben aus getrennten PDFs in derselben
    Bewerbung landen."""
    con = _verbinde()
    try:
        zeile = con.execute(
            "SELECT id, kandidat FROM entwuerfe "
            "WHERE LOWER(TRIM(kandidat)) = LOWER(TRIM(?)) ORDER BY id LIMIT 1",
            (kandidat,),
        ).fetchone()
    finally:
        con.close()
    return _entwurf_dict(zeile[0], zeile[1]) if zeile else None


def benenne_entwurf_um(entwurf_id: int, kandidat: str) -> None:
    con = _verbinde()
    try:
        con.execute(
            "UPDATE entwuerfe SET kandidat = ? WHERE id = ?", (kandidat, entwurf_id)
        )
        con.commit()
    finally:
        con.close()


def speichere_entwurf_datei(entwurf_id: int, name: str, inhalt: bytes) -> None:
    ordner = _entwurf_ordner(entwurf_id)
    ordner.mkdir(parents=True, exist_ok=True)
    name = _sicherer_dateiname(name)
    ziel = ordner / name
    # Namenskollision: " (2)", " (3)", ... anhaengen
    zaehler = 2
    while ziel.exists():
        ziel = ordner / f"{Path(name).stem} ({zaehler}){Path(name).suffix}"
        zaehler += 1
    ziel.write_bytes(inhalt)


def loesche_entwurf_datei(entwurf_id: int, name: str) -> None:
    pfad = _entwurf_ordner(entwurf_id) / _sicherer_dateiname(name)
    pfad.unlink(missing_ok=True)


def loesche_entwurf(entwurf_id: int) -> None:
    con = _verbinde()
    try:
        con.execute("DELETE FROM entwuerfe WHERE id = ?", (entwurf_id,))
        con.commit()
    finally:
        con.close()
    shutil.rmtree(_entwurf_ordner(entwurf_id), ignore_errors=True)
