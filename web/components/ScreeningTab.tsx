"use client";

import { useEffect, useRef, useState } from "react";
import {
  analysiereEntwurf,
  benenneEntwurfUm,
  bulkUpload,
  erstelleEntwurf,
  fetchEntwuerfe,
  ladeDateienHoch,
  loescheDatei,
  loescheEntwurf,
} from "@/lib/api";
import type {
  Entwurf,
  EntwurfDatei,
  Labels,
  ScreeningErgebnis,
} from "@/lib/types";
import { EmpfehlungChip, formatScore, Spinner, StatusChip } from "./ui";

interface Karte {
  key: number; // lokaler React-Key
  serverId: number | null; // Entwurfs-ID im Backend (null = noch leer)
  name: string;
  dateien: EntwurfDatei[];
  status: "offen" | "laedt" | "laeuft" | "fertig" | "fehler";
  ergebnis?: ScreeningErgebnis;
  fehler?: string;
}

let naechsterKey = 1;
const leereKarte = (): Karte => ({
  key: naechsterKey++,
  serverId: null,
  name: "",
  dateien: [],
  status: "offen",
});

const karteAusEntwurf = (e: Entwurf): Karte => ({
  key: naechsterKey++,
  serverId: e.id,
  name: e.kandidat === "Bewerbung" ? "" : e.kandidat,
  dateien: e.dateien,
  status: "offen",
});

export default function ScreeningTab({
  stelle,
  setStelle,
  labels,
}: {
  stelle: string;
  setStelle: (s: string) => void;
  labels: Labels;
}) {
  const [karten, setKarten] = useState<Karte[] | null>(null);
  const [lebenslaufPflicht, setLebenslaufPflicht] = useState(true);
  const [motivationPflicht, setMotivationPflicht] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [sortiert, setSortiert] = useState(false); // Bulk-Upload laeuft
  const [eingangInfo, setEingangInfo] = useState<string[]>([]);
  const [eingangFehler, setEingangFehler] = useState<string[]>([]);

  // Persistierte Entwuerfe wiederherstellen; K.O.-Haken aus localStorage
  useEffect(() => {
    setLebenslaufPflicht(localStorage.getItem("tl.ko.lebenslauf") !== "0");
    setMotivationPflicht(localStorage.getItem("tl.ko.motivation") === "1");
    fetchEntwuerfe()
      .then((entwuerfe) => setKarten(entwuerfe.map(karteAusEntwurf)))
      .catch(() => setKarten([]));
  }, []);

  useEffect(() => {
    if (karten !== null)
      localStorage.setItem("tl.ko.lebenslauf", lebenslaufPflicht ? "1" : "0");
  }, [lebenslaufPflicht, karten]);
  useEffect(() => {
    if (karten !== null)
      localStorage.setItem("tl.ko.motivation", motivationPflicht ? "1" : "0");
  }, [motivationPflicht, karten]);

  const aktualisiere = (key: number, patch: Partial<Karte>) =>
    setKarten((alle) =>
      (alle ?? []).map((k) => (k.key === key ? { ...k, ...patch } : k)),
    );

  async function dateienHinzufuegen(karte: Karte, neue: File[]) {
    const pdfs = neue.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;
    aktualisiere(karte.key, { status: "laedt", ergebnis: undefined });
    try {
      const serverId =
        karte.serverId ??
        (await erstelleEntwurf(karte.name.trim() || "Bewerbung")).id;
      const entwurf = await ladeDateienHoch(serverId, pdfs);
      aktualisiere(karte.key, {
        serverId,
        dateien: entwurf.dateien,
        status: "offen",
      });
    } catch (e) {
      aktualisiere(karte.key, {
        status: "fehler",
        fehler: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function dateiEntfernen(karte: Karte, name: string) {
    if (!karte.serverId) return;
    const entwurf = await loescheDatei(karte.serverId, name);
    aktualisiere(karte.key, {
      dateien: entwurf.dateien,
      status: "offen",
      ergebnis: undefined,
    });
  }

  async function karteEntfernen(karte: Karte) {
    if (karte.serverId) await loescheEntwurf(karte.serverId).catch(() => {});
    setKarten((alle) => (alle ?? []).filter((k) => k.key !== karte.key));
  }

  async function bulkHochladen(neue: File[]) {
    const pdfs = neue.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;
    setSortiert(true);
    setEingangInfo([]);
    setEingangFehler([]);
    try {
      const erg = await bulkUpload(pdfs);
      // Server-Stand uebernehmen; fertige Karten (leben im Verlauf) behalten
      setKarten((alle) => [
        ...erg.entwuerfe.map(karteAusEntwurf),
        ...(alle ?? []).filter((k) => k.status === "fertig"),
      ]);
      setEingangInfo(
        erg.verarbeitet.map(
          (v) =>
            `${v.datei} → ${v.kandidat}` +
            (v.dokumente.length > 1
              ? ` · in ${v.dokumente.length} Dokumente aufgeteilt`
              : ""),
        ),
      );
      setEingangFehler(erg.fehler.map((f) => `${f.datei}: ${f.meldung}`));
    } catch (e) {
      setEingangFehler([e instanceof Error ? e.message : String(e)]);
    }
    setSortiert(false);
  }

  const bereit = (karten ?? []).filter(
    (k) => k.serverId !== null && k.dateien.length > 0 && k.status !== "fertig",
  );

  async function analysieren() {
    setLaeuft(true);
    for (const k of bereit) {
      aktualisiere(k.key, { status: "laeuft", fehler: undefined });
      try {
        const ergebnis = await analysiereEntwurf(k.serverId!, {
          kandidat: k.name.trim() || `Bewerbung ${k.serverId}`,
          stelle,
          lebenslaufErforderlich: lebenslaufPflicht,
          motivationsschreibenErforderlich: motivationPflicht,
        });
        // Entwurf lebt jetzt im Verlauf; Karte zeigt das Ergebnis nur noch an
        aktualisiere(k.key, { status: "fertig", ergebnis, serverId: null });
      } catch (e) {
        aktualisiere(k.key, {
          status: "fehler",
          fehler: e instanceof Error ? e.message : String(e),
        });
      }
    }
    setLaeuft(false);
  }

  if (karten === null)
    return <p className="text-sm text-ink-faint">Lade…</p>;

  const fertige = karten.filter((k) => k.status === "fertig");

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <section className="space-y-4">
        <BulkZone
          deaktiviert={laeuft || sortiert}
          sortiert={sortiert}
          onDateien={bulkHochladen}
        />
        {(eingangInfo.length > 0 || eingangFehler.length > 0) && (
          <ul className="space-y-0.5 px-1 text-xs">
            {eingangInfo.map((zeile) => (
              <li key={zeile} className="text-ink-faint">
                {zeile}
              </li>
            ))}
            {eingangFehler.map((zeile) => (
              <li key={zeile} className="text-rot">
                {zeile}
              </li>
            ))}
          </ul>
        )}

        {karten.map((k) => (
          <BewerbungsKarte
            key={k.key}
            karte={k}
            labels={labels}
            deaktiviert={laeuft}
            onName={(name) => aktualisiere(k.key, { name })}
            onNameFertig={() => {
              if (k.serverId)
                benenneEntwurfUm(
                  k.serverId,
                  k.name.trim() || "Bewerbung",
                ).catch(() => {});
            }}
            onDateien={(dateien) => dateienHinzufuegen(k, dateien)}
            onDateiEntfernen={(name) => dateiEntfernen(k, name)}
            onEntfernen={() => karteEntfernen(k)}
          />
        ))}

        <button
          onClick={() => setKarten((alle) => [...(alle ?? []), leereKarte()])}
          disabled={laeuft || sortiert}
          className="px-1 text-xs text-ink-faint transition-colors hover:text-tanne disabled:opacity-40"
        >
          + Bewerbung manuell anlegen
        </button>

        <div className="flex items-center gap-4 pt-2">
          <button
            onClick={analysieren}
            disabled={laeuft || bereit.length === 0 || !stelle.trim()}
            className="rounded-lg bg-tanne px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-tanne-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {laeuft
              ? "Analyse läuft…"
              : `${bereit.length === 1 ? "1 Bewerbung" : `${bereit.length} Bewerbungen`} analysieren`}
          </button>
          {fertige.length > 0 && !laeuft && (
            <p className="text-sm text-ink-faint">
              {fertige.filter((k) => k.ergebnis?.status === "genehmigt").length}{" "}
              genehmigt ·{" "}
              {fertige.filter((k) => k.ergebnis?.status === "abgelehnt").length}{" "}
              abgelehnt — Details in den Tabs oben.
            </p>
          )}
        </div>
      </section>

      <aside className="space-y-8 lg:border-l lg:border-line lg:pl-8">
        <div>
          <h2 className="text-sm font-medium">K.O.-Kriterien</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            Wird ein Pflichtdokument nicht erkannt, wird die Bewerbung ohne
            LLM-Bewertung direkt abgelehnt.
          </p>
          <div className="mt-3 space-y-2.5">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={lebenslaufPflicht}
                onChange={(e) => setLebenslaufPflicht(e.target.checked)}
                className="mt-0.5 size-4 accent-tanne"
              />
              Lebenslauf erforderlich
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={motivationPflicht}
                onChange={(e) => setMotivationPflicht(e.target.checked)}
                className="mt-0.5 size-4 accent-tanne"
              />
              Motivationsschreiben erforderlich
            </label>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium">Stellenausschreibung</h2>
          <textarea
            value={stelle}
            onChange={(e) => setStelle(e.target.value)}
            disabled={laeuft}
            rows={14}
            className="mt-3 w-full resize-y rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-ink-soft outline-none focus:border-tanne"
          />
        </div>
      </aside>
    </div>
  );
}

function BulkZone({
  deaktiviert,
  sortiert,
  onDateien,
}: {
  deaktiviert: boolean;
  sortiert: boolean;
  onDateien: (dateien: File[]) => void;
}) {
  const [zieht, setZieht] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setZieht(true);
      }}
      onDragLeave={() => setZieht(false)}
      onDrop={(e) => {
        e.preventDefault();
        setZieht(false);
        if (!deaktiviert) onDateien(Array.from(e.dataTransfer.files));
      }}
      onClick={() => !deaktiviert && inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        zieht
          ? "border-tanne bg-tanne-soft"
          : "border-line-strong hover:border-tanne"
      }`}
    >
      {sortiert ? (
        <span className="flex items-center justify-center gap-3 text-sm text-ink-soft">
          <Spinner /> Sortiere Unterlagen — erkenne Dokumente und Kandidaten…
        </span>
      ) : (
        <>
          <p className="font-serif text-xl italic text-ink">
            Bewerbungen hier reinwerfen
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-faint">
            Auch Sammel-PDFs: Lebenslauf und Motivationsschreiben in einer
            Datei werden automatisch erkannt, aufgeteilt und dem richtigen
            Kandidaten zugeordnet.
          </p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(e) => {
          onDateien(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function BewerbungsKarte({
  karte,
  labels,
  deaktiviert,
  onName,
  onNameFertig,
  onDateien,
  onDateiEntfernen,
  onEntfernen,
}: {
  karte: Karte;
  labels: Labels;
  deaktiviert: boolean;
  onName: (name: string) => void;
  onNameFertig: () => void;
  onDateien: (dateien: File[]) => void;
  onDateiEntfernen: (name: string) => void;
  onEntfernen: () => void;
}) {
  const [zieht, setZieht] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { ergebnis } = karte;

  return (
    <div className="rise-in rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-4">
        <input
          value={karte.name}
          onChange={(e) => onName(e.target.value)}
          onBlur={onNameFertig}
          placeholder={
            karte.serverId ? `Bewerbung ${karte.serverId}` : "Neue Bewerbung"
          }
          disabled={deaktiviert}
          className="w-full bg-transparent text-base font-medium outline-none placeholder:text-ink-faint"
        />
        <div className="flex shrink-0 items-center gap-3">
          {karte.status === "laedt" && (
            <span className="flex items-center gap-2 text-xs text-ink-faint">
              <Spinner /> Speichere…
            </span>
          )}
          {karte.status === "laeuft" && (
            <span className="flex items-center gap-2 text-xs text-ink-faint">
              <Spinner /> Wird bewertet…
            </span>
          )}
          {karte.status === "fertig" && ergebnis && (
            <span className="flex items-center gap-2">
              {ergebnis.gesamt_score !== null && (
                <span className="font-serif text-lg">
                  {formatScore(ergebnis.gesamt_score)}
                </span>
              )}
              <StatusChip
                status={ergebnis.status}
                ko={ergebnis.ko_grund !== null}
              />
            </span>
          )}
          <button
            onClick={onEntfernen}
            disabled={deaktiviert}
            aria-label="Bewerbung entfernen"
            className="text-ink-faint transition-colors hover:text-rot disabled:opacity-40"
          >
            ✕
          </button>
        </div>
      </div>

      {karte.status === "fertig" && ergebnis?.ko_grund && (
        <p className="mt-2 text-sm text-rot">
          {labels.ko[ergebnis.ko_grund] ?? ergebnis.ko_grund} — K.O.-Kriterium,
          ohne Bewertung abgelehnt.
        </p>
      )}
      {karte.status === "fertig" && ergebnis?.empfehlung && (
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
          Empfehlung: <EmpfehlungChip empfehlung={ergebnis.empfehlung} />
        </p>
      )}
      {karte.status === "fehler" && (
        <p className="mt-2 text-sm text-rot">{karte.fehler}</p>
      )}

      {karte.dateien.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {karte.dateien.map((datei) => {
            const typ = ergebnis?.dokumente.find(
              (d) => d.name === datei.name,
            )?.typ;
            return (
              <li
                key={datei.name}
                className="flex items-center gap-2.5 text-sm"
              >
                <span className="rounded border border-line px-1 py-px text-[10px] uppercase tracking-wide text-ink-faint">
                  pdf
                </span>
                <span className="truncate">{datei.name}</span>
                {typ && (
                  <span className="text-xs text-ink-faint">
                    erkannt als {labels.dokumente[typ] ?? typ}
                  </span>
                )}
                <span className="ml-auto text-xs text-ink-faint">
                  {Math.max(1, Math.round(datei.groesse / 1024))} KB
                </span>
                {karte.status !== "fertig" && (
                  <button
                    onClick={() => onDateiEntfernen(datei.name)}
                    disabled={deaktiviert}
                    aria-label={`${datei.name} entfernen`}
                    className="text-ink-faint transition-colors hover:text-rot disabled:opacity-40"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {karte.status !== "fertig" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setZieht(true);
          }}
          onDragLeave={() => setZieht(false)}
          onDrop={(e) => {
            e.preventDefault();
            setZieht(false);
            if (!deaktiviert) onDateien(Array.from(e.dataTransfer.files));
          }}
          onClick={() => !deaktiviert && inputRef.current?.click()}
          className={`mt-4 cursor-pointer rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors ${
            zieht
              ? "border-tanne bg-tanne-soft text-tanne-deep"
              : "border-line-strong text-ink-faint hover:border-tanne hover:text-tanne"
          }`}
        >
          PDFs hierher ziehen oder klicken — mehrere Dateien pro Bewerbung
          möglich (z.&nbsp;B. zweiteiliger Lebenslauf + Motivationsschreiben)
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => {
              onDateien(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
