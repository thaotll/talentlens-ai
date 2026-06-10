import type {
  Entwurf,
  Konfiguration,
  Labels,
  ScreeningErgebnis,
  VerlaufEintrag,
} from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res
      .json()
      .then((d) => d.detail as string)
      .catch(() => res.statusText);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchStelle(): Promise<string> {
  const data = await json<{ text: string }>(await fetch("/api/stelle"));
  return data.text;
}

export async function fetchLabels(): Promise<Labels> {
  return json(await fetch("/api/labels"));
}

export async function fetchKonfiguration(): Promise<Konfiguration> {
  return json(await fetch("/api/konfiguration"));
}

export async function fetchErgebnisse(): Promise<VerlaufEintrag[]> {
  return json(await fetch("/api/ergebnisse", { cache: "no-store" }));
}

export async function loescheVerlauf(): Promise<void> {
  await json(await fetch("/api/ergebnisse", { method: "DELETE" }));
}

// --- Entwuerfe (persistente Uploads) ---------------------------------------

export async function fetchEntwuerfe(): Promise<Entwurf[]> {
  return json(await fetch("/api/entwuerfe", { cache: "no-store" }));
}

export async function erstelleEntwurf(kandidat: string): Promise<Entwurf> {
  return json(
    await fetch("/api/entwuerfe", {
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
    await fetch(`/api/entwuerfe/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kandidat }),
    }),
  );
}

export async function loescheEntwurf(id: number): Promise<void> {
  await json(await fetch(`/api/entwuerfe/${id}`, { method: "DELETE" }));
}

export async function ladeDateienHoch(
  id: number,
  dateien: File[],
): Promise<Entwurf> {
  const form = new FormData();
  for (const datei of dateien) form.append("dateien", datei);
  return json(
    await fetch(`/api/entwuerfe/${id}/dateien`, { method: "POST", body: form }),
  );
}

export async function loescheDatei(
  id: number,
  name: string,
): Promise<Entwurf> {
  return json(
    await fetch(`/api/entwuerfe/${id}/dateien/${encodeURIComponent(name)}`, {
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
  return json(await fetch("/api/eingang", { method: "POST", body: form }));
}

export async function analysiereEntwurf(
  id: number,
  opts: {
    kandidat: string;
    stelle: string;
    lebenslaufErforderlich: boolean;
    motivationsschreibenErforderlich: boolean;
  },
): Promise<ScreeningErgebnis> {
  const form = new FormData();
  form.set("kandidat", opts.kandidat);
  form.set("stelle", opts.stelle);
  form.set("lebenslauf_erforderlich", String(opts.lebenslaufErforderlich));
  form.set(
    "motivationsschreiben_erforderlich",
    String(opts.motivationsschreibenErforderlich),
  );
  return json(
    await fetch(`/api/entwuerfe/${id}/analysieren`, {
      method: "POST",
      body: form,
    }),
  );
}
