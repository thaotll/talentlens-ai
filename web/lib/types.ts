export type DokumentTyp = "lebenslauf" | "motivationsschreiben" | "sonstiges";

export interface Dokument {
  name: string;
  typ: DokumentTyp;
}

export interface KriteriumScore {
  kriterium: string;
  score: number;
  begruendung: string;
  belege: string[];
}

export interface Bewertung {
  kriterien: KriteriumScore[];
  staerken: string[];
  ablehnungsgruende: string[];
  zusammenfassung: string;
}

export interface ScreeningErgebnis {
  id: number;
  kandidat: string;
  status: "genehmigt" | "abgelehnt";
  ko_grund: string | null;
  gesamt_score: number | null;
  empfehlung: string | null;
  korrigiert: boolean;
  dokumente: Dokument[];
  bewertung: Bewertung | null;
}

export interface VerlaufEintrag extends ScreeningErgebnis {
  zeitstempel: string;
  stelle_titel: string;
}

export interface EntwurfDatei {
  name: string;
  groesse: number;
}

export interface Entwurf {
  id: number;
  kandidat: string;
  dateien: EntwurfDatei[];
}

export interface Konfiguration {
  modell: string;
  gewichte: Record<string, number>;
  schwelle_einladen: number;
  schwelle_pruefen: number;
}

export interface Labels {
  gruende: Record<string, string>;
  kriterien: Record<string, string>;
  ko: Record<string, string>;
  dokumente: Record<string, string>;
}

/** /api/labels liefert beide Sprachen; das UI waehlt nach der Sprachwahl. */
export interface AlleLabels {
  de: Labels;
  en: Labels;
}

// --- Live-Analyse (gestreamte Pipeline-Schritte) -----------------------------

/** Schritt-Namen wie in core/pipeline.py (PIPELINE_SCHRITTE). */
export type PipelineSchritt =
  | "extraktion"
  | "ko_pruefung"
  | "ko_ablehnung"
  | "zusammenfuehren"
  | "anonymisierung"
  | "bewertung"
  | "selbstkritik"
  | "score";

/** Eine NDJSON-Zeile aus /analysieren/live. */
export type LiveEreignis =
  | {
      typ: "schritt";
      schritt: PipelineSchritt;
      ko_grund?: string | null; // nur bei ko_pruefung
      korrigiert?: boolean; // nur bei selbstkritik
    }
  | ({ typ: "ergebnis" } & ScreeningErgebnis)
  | { typ: "fehler"; detail: string; status: number };

/** Ein abgeschlossener Schritt mit Zeit seit Analyse-Start (fuers Protokoll). */
export interface LiveSchrittEintrag {
  schritt: PipelineSchritt;
  ms: number;
}

/** Aufgelaufener Stand fuers Live-Diagramm einer Bewerbung. */
export interface LiveStand {
  fertig: LiveSchrittEintrag[];
  /** undefined = K.O.-Pruefung noch offen, null = bestanden, sonst der Grund */
  koGrund?: string | null;
  korrigiert?: boolean;
  startZeit?: number; // Date.now() beim Analyse-Start
}

// --- HR-Assistent (Tool-Calling-Agent) --------------------------------------

export interface ToolAufruf {
  tool: string;
  args: Record<string, unknown>;
}

export interface AssistentAntwort {
  antwort: string;
  tool_aufrufe: ToolAufruf[];
}

export interface ChatNachricht {
  rolle: "nutzer" | "assistent";
  text: string;
  toolAufrufe?: ToolAufruf[];
}
