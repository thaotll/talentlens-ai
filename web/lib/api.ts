import type { Sprache } from "./i18n";
import type {
  AlleLabels,
  AssistentAntwort,
  Entwurf,
  Konfiguration,
  LiveEreignis,
  ScreeningErgebnis,
  VerlaufEintrag,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Optionales Zugriffs-Passwort (fuers Hosting): wird lokal gespeichert und
// bei jedem Aufruf mitgeschickt. Das Backend prueft es nur, wenn dort
// TALENTLENS_PASSWORT gesetzt ist.
const PASSWORT_KEY = "tl.passwort";

export function speicherePasswort(passwort: string) {
  localStorage.setItem(PASSWORT_KEY, passwort);
}

function passwortHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const passwort = localStorage.getItem(PASSWORT_KEY);
  return passwort ? { "X-Passwort": passwort } : {};
}

// UI-Sprache mitschicken, damit Backend-Fehlermeldungen zur Sprache des
// Dashboards passen (Key wie in lib/i18n.tsx; ohne Auswahl gilt Englisch,
// wie im SpracheProvider).
function spracheHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const sprache = localStorage.getItem("tl.sprache");
  return { "X-Sprache": sprache === "de" ? "de" : "en" };
}

function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string>),
      ...passwortHeader(),
      ...spracheHeader(),
    },
  });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d.detail as string)
      .catch(() => res.statusText);
    throw new ApiError(detail || `HTTP ${res.status}`, res.status);
  }
  return res.json();
}

export async function fetchStelle(): Promise<string> {
  const data = await json<{ text: string }>(await api("/api/stelle"));
  return data.text;
}

export async function fetchLabels(): Promise<AlleLabels> {
  return json(await api("/api/labels"));
}

export async function fetchKonfiguration(): Promise<Konfiguration> {
  return json(await api("/api/konfiguration"));
}

export async function fetchHealth(): Promise<{
  ok: boolean;
  api_key_geladen: boolean;
  passwort_erforderlich: boolean;
  modell: string;
}> {
  return json(await api("/api/health", { cache: "no-store" }));
}

export async function fetchErgebnisse(): Promise<VerlaufEintrag[]> {
  return json(await api("/api/ergebnisse", { cache: "no-store" }));
}

export async function loescheVerlauf(): Promise<void> {
  await json(await api("/api/ergebnisse", { method: "DELETE" }));
}

// --- Entwuerfe (persistente Uploads) ---------------------------------------

export async function fetchEntwuerfe(): Promise<Entwurf[]> {
  return json(await api("/api/entwuerfe", { cache: "no-store" }));
}

export async function erstelleEntwurf(kandidat: string): Promise<Entwurf> {
  return json(
    await api("/api/entwuerfe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kandidat }),
    }),
  );
}

export async function benenneEntwurfUm(
  id: number,
  kandidat: string,
): Promise<void> {
  await json(
    await api(`/api/entwuerfe/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kandidat }),
    }),
  );
}

export async function loescheEntwurf(id: number): Promise<void> {
  await json(await api(`/api/entwuerfe/${id}`, { method: "DELETE" }));
}

export async function ladeDateienHoch(
  id: number,
  dateien: File[],
): Promise<Entwurf> {
  const form = new FormData();
  for (const datei of dateien) form.append("dateien", datei);
  return json(
    await api(`/api/entwuerfe/${id}/dateien`, { method: "POST", body: form }),
  );
}

export async function loescheDatei(
  id: number,
  name: string,
): Promise<Entwurf> {
  return json(
    await api(`/api/entwuerfe/${id}/dateien/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  );
}

export interface EingangErgebnis {
  entwuerfe: Entwurf[];
  verarbeitet: { datei: string; kandidat: string; dokumente: string[] }[];
  fehler: { datei: string; meldung: string }[];
}

export async function bulkUpload(dateien: File[]): Promise<EingangErgebnis> {
  const form = new FormData();
  for (const datei of dateien) form.append("dateien", datei);
  return json(await api("/api/eingang", { method: "POST", body: form }));
}

export async function frageAssistent(
  frage: string,
  verlauf: { rolle: "nutzer" | "assistent"; text: string }[],
  stelle: string,
  sprache: Sprache,
): Promise<AssistentAntwort> {
  return json(
    await api("/api/assistent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frage, verlauf, stelle, sprache }),
    }),
  );
}

export interface AnalyseOptionen {
  kandidat: string;
  stelle: string;
  lebenslaufErforderlich: boolean;
  motivationsschreibenErforderlich: boolean;
  sprache: Sprache; // Ausgabesprache der LLM-Bewertung
}

function analyseForm(opts: AnalyseOptionen): FormData {
  const form = new FormData();
  form.set("kandidat", opts.kandidat);
  form.set("stelle", opts.stelle);
  form.set("lebenslauf_erforderlich", String(opts.lebenslaufErforderlich));
  form.set(
    "motivationsschreiben_erforderlich",
    String(opts.motivationsschreibenErforderlich),
  );
  form.set("sprache", opts.sprache);
  return form;
}

export async function analysiereEntwurf(
  id: number,
  opts: AnalyseOptionen,
): Promise<ScreeningErgebnis> {
  return json(
    await api(`/api/entwuerfe/${id}/analysieren`, {
      method: "POST",
      body: analyseForm(opts),
    }),
  );
}

/** Analyse mit Live-Fortschritt: Der Endpoint streamt eine NDJSON-Zeile pro
 *  abgeschlossenem Pipeline-Schritt (fuers Diagramm), am Ende das Ergebnis.
 *  EventSource kann weder POST noch den Passwort-Header, deshalb fetch +
 *  manuelles Zeilen-Parsen des Response-Streams. */
export async function analysiereEntwurfLive(
  id: number,
  opts: AnalyseOptionen,
  onSchritt: (ereignis: Extract<LiveEreignis, { typ: "schritt" }>) => void,
): Promise<ScreeningErgebnis> {
  const res = await api(`/api/entwuerfe/${id}/analysieren/live`, {
    method: "POST",
    body: analyseForm(opts),
  });
  if (!res.ok || !res.body) {
    const detail = await res
      .json()
      .then((d) => d.detail as string)
      .catch(() => res.statusText);
    throw new ApiError(detail || `HTTP ${res.status}`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let puffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    puffer += decoder.decode(value, { stream: true });
    const zeilen = puffer.split("\n");
    puffer = zeilen.pop() ?? ""; // letzte (evtl. unvollstaendige) Zeile behalten
    for (const roh of zeilen) {
      if (!roh.trim()) continue;
      const ereignis = JSON.parse(roh) as LiveEreignis;
      if (ereignis.typ === "schritt") onSchritt(ereignis);
      else if (ereignis.typ === "fehler")
        throw new ApiError(ereignis.detail, ereignis.status);
      else if (ereignis.typ === "ergebnis") return ereignis;
    }
  }
  // Stream endete ohne Ergebnis-Zeile (Verbindungsabbruch) - der Aufrufer
  // versucht dann, das Ergebnis aus dem Verlauf nachzuladen.
  throw new ApiError(
    opts.sprache === "de"
      ? "Verbindung während der Analyse abgebrochen."
      : "Connection lost during analysis.",
    0,
  );
}
