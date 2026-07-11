"use client";

import { useEffect, useRef, useState } from "react";
import {
  analysiereEntwurf,
  analysiereEntwurfLive,
  ApiError,
  benenneEntwurfUm,
  bulkUpload,
  erstelleEntwurf,
  fetchEntwuerfe,
  fetchErgebnisse,
  ladeDateienHoch,
  loescheDatei,
  loescheEntwurf,
} from "@/lib/api";
import { useSprache, type Sprache } from "@/lib/i18n";
import type {
  Entwurf,
  EntwurfDatei,
  Labels,
  LiveEreignis,
  LiveStand,
  ScreeningErgebnis,
} from "@/lib/types";
import PipelineOverlay from "./PipelineOverlay";
import {
  EmpfehlungChip,
  formatScore,
  FortschrittsBalken,
  Spinner,
  StatusChip,
} from "./ui";

const T = {
  de: {
    stelleLabel: "Stelle:",
    keineStelle: "Keine Stellenausschreibung hinterlegt.",
    koKriterien: "K.O.-Kriterien:",
    koKeine: "keine",
    koErforderlich: "erforderlich",
    lebenslauf: "Lebenslauf",
    motivationsschreiben: "Motivationsschreiben",
    anforderungenBearbeiten: "Anforderungen bearbeiten →",
    aufgeteilt: (n: number) => ` · in ${n} Dokumente aufgeteilt`,
    uploadAbgebrochen: (n: number) =>
      `Upload abgebrochen - ${n} Datei(en) nicht verarbeitet.`,
    manuellAnlegen: "+ Bewerbung manuell anlegen",
    analyseLaeuft: "Analyse läuft…",
    analysieren: (n: number) =>
      `${n === 1 ? "1 Bewerbung" : `${n} Bewerbungen`} analysieren`,
    erstStelle:
      "Erst im Tab „Anforderungen“ eine Stellenausschreibung hinterlegen.",
    genehmigt: "genehmigt",
    abgelehnt: "abgelehnt - Details in den Tabs oben.",
    bewertetVon: (fertig: number, gesamt: number) =>
      `${fertig} von ${gesamt} Bewerbungen bewertet`,
    laden: "Lade…",
    bewerbungFallback: (id: number | string) => `Bewerbung ${id}`,
    // BulkZone
    sortiere: "Sortiere Unterlagen",
    reinwerfen: "Bewerbungen hier reinwerfen",
    bulkHinweis:
      "Auch Sammel-PDFs: Lebenslauf und Motivationsschreiben in einer Datei werden automatisch erkannt, aufgeteilt und dem richtigen Kandidaten zugeordnet.",
    // Karte
    neueBewerbung: "Neue Bewerbung",
    speichere: "Speichere…",
    wirdBewertet: "Wird bewertet -",
    liveAnsicht: "klicken für Live-Ansicht",
    entfernenAria: "Bewerbung entfernen",
    koAbgelehnt: "- K.O.-Kriterium, ohne Bewertung abgelehnt.",
    empfehlung: "Empfehlung:",
    pipelineAnsehen: "Pipeline-Ablauf ansehen →",
    erkanntAls: "erkannt als",
    dateiEntfernen: (name: string) => `${name} entfernen`,
    ablageHinweis:
      "PDFs hier ablegen oder auswählen. Mehrere Dateien pro Bewerbung möglich (z. B. zweiteiliger Lebenslauf + Motivationsschreiben).",
  },
  en: {
    stelleLabel: "Job posting:",
    keineStelle: "No job posting configured.",
    koKriterien: "Knock-out criteria:",
    koKeine: "none",
    koErforderlich: "required",
    lebenslauf: "CV",
    motivationsschreiben: "Cover letter",
    anforderungenBearbeiten: "Edit requirements →",
    aufgeteilt: (n: number) => ` · split into ${n} documents`,
    uploadAbgebrochen: (n: number) =>
      `Upload stopped - ${n} file(s) not processed.`,
    manuellAnlegen: "+ Add application manually",
    analyseLaeuft: "Analysis running…",
    analysieren: (n: number) =>
      `Analyze ${n === 1 ? "1 application" : `${n} applications`}`,
    erstStelle: "First add a job posting in the “Requirements” tab.",
    genehmigt: "approved",
    abgelehnt: "rejected - details in the tabs above.",
    bewertetVon: (fertig: number, gesamt: number) =>
      `${fertig} of ${gesamt} applications evaluated`,
    laden: "Loading…",
    bewerbungFallback: (id: number | string) => `Application ${id}`,
    // BulkZone
    sortiere: "Sorting documents",
    reinwerfen: "Drop applications here",
    bulkHinweis:
      "Combined PDFs work too: a CV and cover letter in one file are detected automatically, split up and assigned to the right candidate.",
    // Karte
    neueBewerbung: "New application",
    speichere: "Saving…",
    wirdBewertet: "Being evaluated -",
    liveAnsicht: "click for live view",
    entfernenAria: "Remove application",
    koAbgelehnt: "- knock-out criterion, rejected without evaluation.",
    empfehlung: "Recommendation:",
    pipelineAnsehen: "View pipeline run →",
    erkanntAls: "detected as",
    dateiEntfernen: (name: string) => `Remove ${name}`,
    ablageHinweis:
      "Drop or select PDFs here. Multiple files per application are fine (e.g. a two-part CV + cover letter).",
  },
};

interface Karte {
  key: number; // lokaler React-Key
  serverId: number | null; // Entwurfs-ID im Backend (null = noch leer)
  name: string;
  dateien: EntwurfDatei[];
  status: "offen" | "laedt" | "laeuft" | "fertig" | "fehler";
  ergebnis?: ScreeningErgebnis;
  fehler?: string;
  live?: LiveStand; // gestreamte Pipeline-Schritte der (letzten) Analyse
}

interface Fortschritt {
  fertig: number;
  gesamt: number;
}

let naechsterKey = 1;
const leereKarte = (): Karte => ({
  key: naechsterKey++,
  serverId: null,
  name: "",
  dateien: [],
  status: "offen",
});

// "Bewerbung" ist der serverseitige Default-Name eines Entwurfs
const karteAusEntwurf = (e: Entwurf): Karte => ({
  key: naechsterKey++,
  serverId: e.id,
  name: e.kandidat === "Bewerbung" ? "" : e.kandidat,
  dateien: e.dateien,
  status: "offen",
});

export default function ScreeningTab({
  stelle,
  labels,
  lebenslaufPflicht,
  motivationPflicht,
  zuAnforderungen,
}: {
  stelle: string;
  labels: Labels;
  lebenslaufPflicht: boolean;
  motivationPflicht: boolean;
  zuAnforderungen: () => void;
}) {
  const { sprache } = useSprache();
  const t = T[sprache];
  const [karten, setKarten] = useState<Karte[] | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [sortiert, setSortiert] = useState(false); // Bulk-Upload laeuft
  const [bulkFortschritt, setBulkFortschritt] = useState<Fortschritt | null>(
    null,
  );
  const [analyseFortschritt, setAnalyseFortschritt] =
    useState<Fortschritt | null>(null);
  const [eingangInfo, setEingangInfo] = useState<string[]>([]);
  const [eingangFehler, setEingangFehler] = useState<string[]>([]);
  // Fullscreen-Pipeline-Ansicht (fuer Praesentationen): zeigt die Karte,
  // deren Analyse gerade laeuft bzw. zuletzt vergroessert wurde
  const [overlayOffen, setOverlayOffen] = useState(false);
  const [liveFokusKey, setLiveFokusKey] = useState<number | null>(null);

  // Persistierte Entwuerfe wiederherstellen
  useEffect(() => {
    fetchEntwuerfe()
      .then((entwuerfe) => setKarten(entwuerfe.map(karteAusEntwurf)))
      .catch(() => setKarten([]));
  }, []);

  const aktualisiere = (key: number, patch: Partial<Karte>) =>
    setKarten((alle) =>
      (alle ?? []).map((k) => (k.key === key ? { ...k, ...patch } : k)),
    );

  /** Ein gestreamtes Schritt-Event in den Live-Stand der Karte einarbeiten. */
  const liveSchritt = (
    key: number,
    ereignis: Extract<LiveEreignis, { typ: "schritt" }>,
  ) => {
    const jetzt = Date.now();
    setKarten((alle) =>
      (alle ?? []).map((k) =>
        k.key === key
          ? {
              ...k,
              live: {
                ...k.live,
                fertig: [
                  ...(k.live?.fertig ?? []),
                  {
                    schritt: ereignis.schritt,
                    ms: jetzt - (k.live?.startZeit ?? jetzt),
                  },
                ],
                koGrund:
                  ereignis.ko_grund !== undefined
                    ? ereignis.ko_grund
                    : k.live?.koGrund,
                korrigiert: k.live?.korrigiert || ereignis.korrigiert === true,
              },
            }
          : k,
      ),
    );
  };

  /** Server-Stand einpflegen, ohne bestehende Karten neu zu erzeugen -
   *  so bleiben React-Keys stabil und nichts flackert beim Bulk-Upload. */
  const uebernehmeServerStand = (entwuerfe: Entwurf[]) =>
    setKarten((alle) => {
      const bisher = alle ?? [];
      const vorhandene = new Map(
        bisher
          .filter((k) => k.serverId !== null && k.status !== "fertig")
          .map((k) => [k.serverId as number, k]),
      );
      const aktualisierte = entwuerfe.map((e) => {
        const karte = vorhandene.get(e.id);
        return karte
          ? {
              ...karte,
              dateien: e.dateien,
              name: karte.name || (e.kandidat === "Bewerbung" ? "" : e.kandidat),
            }
          : karteAusEntwurf(e);
      });
      return [
        ...aktualisierte,
        // leere manuelle Karten und fertige Ergebnis-Karten behalten
        ...bisher.filter(
          (k) => k.serverId === null || k.status === "fertig",
        ),
      ];
    });

  async function dateienHinzufuegen(karte: Karte, neue: File[]) {
    const pdfs = neue.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;
    aktualisiere(karte.key, {
      status: "laedt",
      ergebnis: undefined,
      live: undefined,
    });
    try {
      const serverId =
        karte.serverId ??
        (await erstelleEntwurf(karte.name.trim() || "Bewerbung")).id;
      const entwurf = await ladeDateienHoch(serverId, pdfs);
      aktualisiere(karte.key, {
        serverId,
        dateien: entwurf.dateien,
        status: "offen",
        fehler: undefined,
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
      live: undefined,
    });
  }

  async function karteEntfernen(karte: Karte) {
    if (karte.serverId) await loescheEntwurf(karte.serverId).catch(() => {});
    setKarten((alle) => (alle ?? []).filter((k) => k.key !== karte.key));
  }

  /** Bulk-Upload: eine Datei pro Request. So bleibt jeder Aufruf kurz
   *  (kein Proxy-Timeout bei vielen PDFs) und der Fortschritt ist sichtbar. */
  async function bulkHochladen(neue: File[]) {
    const pdfs = neue.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;
    setSortiert(true);
    setEingangInfo([]);
    setEingangFehler([]);
    setBulkFortschritt({ fertig: 0, gesamt: pdfs.length });

    const info: string[] = [];
    const fehlerZeilen: string[] = [];
    for (const [i, pdf] of pdfs.entries()) {
      try {
        const erg = await bulkUpload([pdf]);
        uebernehmeServerStand(erg.entwuerfe);
        info.push(
          ...erg.verarbeitet.map(
            (v) =>
              `${v.datei} → ${v.kandidat}` +
              (v.dokumente.length > 1 ? t.aufgeteilt(v.dokumente.length) : ""),
          ),
        );
        fehlerZeilen.push(...erg.fehler.map((f) => `${f.datei}: ${f.meldung}`));
      } catch (e) {
        const meldung = e instanceof Error ? e.message : String(e);
        fehlerZeilen.push(`${pdf.name}: ${meldung}`);
        // Quota erschoepft oder Passwort falsch: weitere Versuche sind zwecklos
        if (e instanceof ApiError && (e.status === 429 || e.status === 401)) {
          if (i < pdfs.length - 1)
            fehlerZeilen.push(t.uploadAbgebrochen(pdfs.length - 1 - i));
          setBulkFortschritt({ fertig: i + 1, gesamt: pdfs.length });
          break;
        }
      }
      setBulkFortschritt({ fertig: i + 1, gesamt: pdfs.length });
      setEingangInfo([...info]);
      setEingangFehler([...new Set(fehlerZeilen)]);
    }
    setEingangInfo([...info]);
    setEingangFehler([...new Set(fehlerZeilen)]);
    setSortiert(false);
    setBulkFortschritt(null);
  }

  const bereit = (karten ?? []).filter(
    (k) => k.serverId !== null && k.dateien.length > 0 && k.status !== "fertig",
  );

  /** Wenn die Antwort der Analyse verloren ging (z.B. Verbindungsabbruch),
   *  ist der Entwurf serverseitig oft trotzdem fertig bewertet und geloescht.
   *  Dann das Ergebnis aus dem Verlauf nachladen statt einen Fehler zu zeigen. */
  async function ergebnisNachladen(
    k: Karte,
    kandidat: string,
  ): Promise<boolean> {
    try {
      const entwuerfe = await fetchEntwuerfe();
      if (entwuerfe.some((e) => e.id === k.serverId)) return false; // Entwurf existiert noch -> echter Fehler
      const ergebnisse = await fetchErgebnisse(); // neueste zuerst
      const passend = ergebnisse.find((e) => e.kandidat === kandidat);
      if (!passend) return false;
      aktualisiere(k.key, {
        status: "fertig",
        ergebnis: passend,
        serverId: null,
        fehler: undefined,
      });
      return true;
    } catch {
      return false;
    }
  }

  async function analysieren() {
    setLaeuft(true);
    // alte Upload-Meldungen sind jetzt erledigt - weg damit
    setEingangInfo([]);
    setEingangFehler([]);
    const warteschlange = bereit;
    setAnalyseFortschritt({ fertig: 0, gesamt: warteschlange.length });
    let fertig = 0;
    for (const k of warteschlange) {
      const kandidat = k.name.trim() || t.bewerbungFallback(k.serverId!);
      const optionen = {
        kandidat,
        stelle,
        lebenslaufErforderlich: lebenslaufPflicht,
        motivationsschreibenErforderlich: motivationPflicht,
        sprache,
      };
      aktualisiere(k.key, {
        status: "laeuft",
        fehler: undefined,
        live: { fertig: [], startZeit: Date.now() },
      });
      setLiveFokusKey(k.key); // Overlay folgt der laufenden Analyse
      try {
        let ergebnis: ScreeningErgebnis;
        try {
          ergebnis = await analysiereEntwurfLive(k.serverId!, optionen, (e) =>
            liveSchritt(k.key, e),
          );
        } catch (e) {
          // 404 vor Stream-Beginn: Backend (noch) ohne Live-Endpoint -
          // auf die klassische Analyse ohne Diagramm zurueckfallen
          if (!(e instanceof ApiError) || e.status !== 404) throw e;
          aktualisiere(k.key, { live: undefined });
          ergebnis = await analysiereEntwurf(k.serverId!, optionen);
        }
        // Entwurf lebt jetzt im Verlauf; Karte zeigt das Ergebnis nur noch an
        aktualisiere(k.key, { status: "fertig", ergebnis, serverId: null });
      } catch (e) {
        const geheilt = await ergebnisNachladen(k, kandidat);
        if (!geheilt)
          aktualisiere(k.key, {
            status: "fehler",
            fehler: e instanceof Error ? e.message : String(e),
          });
      }
      fertig++;
      setAnalyseFortschritt({ fertig, gesamt: warteschlange.length });
    }
    setLaeuft(false);
    setAnalyseFortschritt(null);
  }

  if (karten === null)
    return <p className="text-sm text-ink-faint">{t.laden}</p>;

  const fertige = karten.filter((k) => k.status === "fertig");
  const fokusKarte = karten.find((k) => k.key === liveFokusKey);
  const stellenTitel = stelle
    .split("\n")
    .map((zeile) => zeile.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  const pflichten = [
    lebenslaufPflicht && t.lebenslauf,
    motivationPflicht && t.motivationsschreiben,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        {stellenTitel ? (
          <>
            <span className="text-ink-faint">{t.stelleLabel}</span>
            <span className="font-medium">{stellenTitel}</span>
          </>
        ) : (
          <span className="text-rot">{t.keineStelle}</span>
        )}
        <span className="text-ink-faint">
          · {t.koKriterien}{" "}
          {pflichten.length
            ? `${pflichten.join(" + ")} ${t.koErforderlich}`
            : t.koKeine}
        </span>
        <button
          onClick={zuAnforderungen}
          className="ml-auto text-xs font-medium text-tanne transition-colors hover:text-tanne-deep"
        >
          {t.anforderungenBearbeiten}
        </button>
      </div>

      <BulkZone
        deaktiviert={laeuft || sortiert}
        sortiert={sortiert}
        fortschritt={bulkFortschritt}
        onDateien={bulkHochladen}
        sprache={sprache}
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
          onLiveAnsicht={() => {
            setLiveFokusKey(k.key);
            setOverlayOffen(true);
          }}
        />
      ))}

      <button
        onClick={() => setKarten((alle) => [...(alle ?? []), leereKarte()])}
        disabled={laeuft || sortiert}
        className="px-1 text-xs text-ink-faint transition-colors hover:text-tanne disabled:opacity-40"
      >
        {t.manuellAnlegen}
      </button>

      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-4">
          <button
            onClick={analysieren}
            disabled={laeuft || bereit.length === 0 || !stelle.trim()}
            className="rounded-lg bg-tanne px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-tanne-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {laeuft ? t.analyseLaeuft : t.analysieren(bereit.length)}
          </button>
          {!laeuft && bereit.length > 0 && !stelle.trim() && (
            <p className="text-sm text-rot">{t.erstStelle}</p>
          )}
          {fertige.length > 0 && !laeuft && (
            <p className="text-sm text-ink-faint">
              {fertige.filter((k) => k.ergebnis?.status === "genehmigt").length}{" "}
              {t.genehmigt} ·{" "}
              {fertige.filter((k) => k.ergebnis?.status === "abgelehnt").length}{" "}
              {t.abgelehnt}
            </p>
          )}
        </div>
        {laeuft && analyseFortschritt && (
          <div className="max-w-md space-y-1.5">
            <FortschrittsBalken
              fertig={analyseFortschritt.fertig}
              gesamt={analyseFortschritt.gesamt}
            />
            <p className="text-xs text-ink-faint">
              {t.bewertetVon(analyseFortschritt.fertig, analyseFortschritt.gesamt)}
            </p>
          </div>
        )}
      </div>

      <PipelineOverlay
        offen={overlayOffen}
        onSchliessen={() => setOverlayOffen(false)}
        kandidat={
          fokusKarte
            ? fokusKarte.name.trim() ||
              fokusKarte.ergebnis?.kandidat ||
              (fokusKarte.serverId !== null
                ? t.bewerbungFallback(fokusKarte.serverId)
                : t.neueBewerbung)
            : null
        }
        stand={fokusKarte?.live}
        laeuft={fokusKarte?.status === "laeuft"}
        fehlgeschlagen={fokusKarte?.status === "fehler"}
        ergebnis={fokusKarte?.ergebnis}
      />
    </div>
  );
}

function BulkZone({
  deaktiviert,
  sortiert,
  fortschritt,
  onDateien,
  sprache,
}: {
  deaktiviert: boolean;
  sortiert: boolean;
  fortschritt: Fortschritt | null;
  onDateien: (dateien: File[]) => void;
  sprache: Sprache;
}) {
  const t = T[sprache];
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
        <div className="mx-auto max-w-xs space-y-3">
          <span className="flex items-center justify-center gap-3 text-sm text-ink-soft">
            <Spinner /> {t.sortiere}
            {fortschritt
              ? ` (${Math.min(fortschritt.fertig + 1, fortschritt.gesamt)}/${fortschritt.gesamt})`
              : ""}
            …
          </span>
          {fortschritt && (
            <FortschrittsBalken
              fertig={fortschritt.fertig}
              gesamt={fortschritt.gesamt}
            />
          )}
        </div>
      ) : (
        <>
          <p className="font-serif text-xl italic text-ink">{t.reinwerfen}</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-faint">
            {t.bulkHinweis}
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
  onLiveAnsicht,
}: {
  karte: Karte;
  labels: Labels;
  deaktiviert: boolean;
  onName: (name: string) => void;
  onNameFertig: () => void;
  onDateien: (dateien: File[]) => void;
  onDateiEntfernen: (name: string) => void;
  onEntfernen: () => void;
  onLiveAnsicht: () => void;
}) {
  const { sprache } = useSprache();
  const t = T[sprache];
  const [zieht, setZieht] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { ergebnis } = karte;
  // Waehrend der Analyse oeffnet ein Klick auf die Karte die Live-Ansicht
  // der Pipeline (alle Bedienelemente sind dann ohnehin deaktiviert)
  const klickbar = karte.status === "laeuft";

  return (
    <div
      onClick={klickbar ? onLiveAnsicht : undefined}
      className={`rise-in rounded-xl border border-line bg-surface p-5 ${
        klickbar
          ? "cursor-pointer transition-colors hover:border-tanne"
          : ""
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <input
          value={karte.name}
          onChange={(e) => onName(e.target.value)}
          onBlur={onNameFertig}
          placeholder={
            karte.serverId
              ? t.bewerbungFallback(karte.serverId)
              : t.neueBewerbung
          }
          disabled={deaktiviert}
          className="w-full bg-transparent text-base font-medium outline-none placeholder:text-ink-faint"
        />
        <div className="flex shrink-0 items-center gap-3">
          {karte.status === "laedt" && (
            <span className="flex items-center gap-2 text-xs text-ink-faint">
              <Spinner /> {t.speichere}
            </span>
          )}
          {karte.status === "laeuft" && (
            <span className="flex items-center gap-2 text-xs text-ink-faint">
              <Spinner /> {t.wirdBewertet}{" "}
              <span className="text-tanne">{t.liveAnsicht}</span>
            </span>
          )}
          {karte.status === "fertig" && ergebnis && (
            <span className="flex items-center gap-2">
              {ergebnis.gesamt_score !== null && (
                <span className="font-serif text-lg">
                  {formatScore(ergebnis.gesamt_score, sprache)}
                  <span className="text-xs text-ink-faint">/100</span>
                </span>
              )}
              <StatusChip
                status={ergebnis.status}
                ko={ergebnis.ko_grund !== null}
                empfehlung={ergebnis.empfehlung}
              />
            </span>
          )}
          <button
            onClick={onEntfernen}
            disabled={deaktiviert}
            aria-label={t.entfernenAria}
            className="text-ink-faint transition-colors hover:text-rot disabled:opacity-40"
          >
            ✕
          </button>
        </div>
      </div>

      {karte.status === "fertig" && ergebnis?.ko_grund && (
        <p className="mt-2 text-sm text-rot">
          {labels.ko[ergebnis.ko_grund] ?? ergebnis.ko_grund} {t.koAbgelehnt}
        </p>
      )}
      {karte.status === "fertig" && ergebnis?.empfehlung && (
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
          {t.empfehlung} <EmpfehlungChip empfehlung={ergebnis.empfehlung} />
        </p>
      )}
      {karte.status === "fehler" && (
        <p className="mt-2 text-sm text-rot">{karte.fehler}</p>
      )}

      {karte.live && karte.status !== "laeuft" && (
        <button
          onClick={onLiveAnsicht}
          className="mt-2 text-xs font-medium text-tanne transition-colors hover:text-tanne-deep"
        >
          {t.pipelineAnsehen}
        </button>
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
                    {t.erkanntAls} {labels.dokumente[typ] ?? typ}
                  </span>
                )}
                <span className="ml-auto text-xs text-ink-faint">
                  {Math.max(1, Math.round(datei.groesse / 1024))} KB
                </span>
                {karte.status !== "fertig" && (
                  <button
                    onClick={() => onDateiEntfernen(datei.name)}
                    disabled={deaktiviert}
                    aria-label={t.dateiEntfernen(datei.name)}
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
          {t.ablageHinweis}
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
