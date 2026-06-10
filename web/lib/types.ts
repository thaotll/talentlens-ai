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
