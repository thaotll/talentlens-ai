"use client";

import { useEffect, useState } from "react";
import DokuTab from "@/components/DokuTab";
import GenehmigtTab from "@/components/GenehmigtTab";
import ScreeningTab from "@/components/ScreeningTab";
import VerlaufTab from "@/components/VerlaufTab";
import { fetchHealth, fetchLabels, fetchStelle } from "@/lib/api";
import type { Labels } from "@/lib/types";

type Tab = "screening" | "genehmigt" | "verlauf" | "doku";

const TABS: { id: Tab; label: string }[] = [
  { id: "screening", label: "Screening" },
  { id: "genehmigt", label: "Genehmigt" },
  { id: "verlauf", label: "Verlauf" },
  { id: "doku", label: "So funktioniert's" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("screening");
  const [labels, setLabels] = useState<Labels | null>(null);
  const [stelle, setStelle] = useState("");
  const [apiFehler, setApiFehler] = useState(false);
  const [keyFehlt, setKeyFehlt] = useState(false);

  useEffect(() => {
    Promise.all([fetchLabels(), fetchStelle(), fetchHealth()])
      .then(([l, s, health]) => {
        setLabels(l);
        // lokal bearbeitete Ausschreibung ueberlebt den Reload
        setStelle(localStorage.getItem("tl.stelle") ?? s);
        setKeyFehlt(!health.api_key_geladen);
      })
      .catch(() => setApiFehler(true));
  }, []);

  const stelleAendern = (s: string) => {
    setStelle(s);
    localStorage.setItem("tl.stelle", s);
  };

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 border-b border-line pt-10 pb-0">
        <div className="pb-4">
          <h1 className="font-serif text-3xl italic">TalentLens</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            CV-Screening mit LangChain — bewertet, begründet, sortiert.
          </p>
        </div>
        <nav className="flex gap-6" aria-label="Bereiche">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 pb-3 text-sm transition-colors ${
                tab === t.id
                  ? "border-tanne font-medium text-ink"
                  : "border-transparent text-ink-soft hover:text-ink"
              }`}
              aria-current={tab === t.id ? "page" : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="py-10">
        {apiFehler && (
          <div className="mb-8 rounded-lg bg-rot-soft px-4 py-3 text-sm text-rot">
            API nicht erreichbar. Läuft das Backend?{" "}
            <code className="text-xs">
              uvicorn api.main:app --reload --port 8000
            </code>
          </div>
        )}
        {keyFehlt && !apiFehler && (
          <div className="mb-8 rounded-lg bg-gold-soft px-4 py-3 text-sm text-gold">
            <strong className="font-medium">GOOGLE_API_KEY fehlt.</strong> Das
            Backend läuft, hat aber keinen Key — Analysen schlagen fehl. Lege
            im Projekt-Root eine <code className="text-xs">.env</code> an
            (Vorlage: <code className="text-xs">.env.example</code>) mit{" "}
            <code className="text-xs">GOOGLE_API_KEY=…</code> und starte das
            Backend neu. Die <code className="text-xs">.env</code> ist nicht im
            Git, muss nach dem Klonen also neu erstellt werden.
          </div>
        )}
        {labels && (
          <>
            {tab === "screening" && (
              <ScreeningTab
                stelle={stelle}
                setStelle={stelleAendern}
                labels={labels}
              />
            )}
            {tab === "genehmigt" && <GenehmigtTab labels={labels} />}
            {tab === "verlauf" && <VerlaufTab labels={labels} />}
            {tab === "doku" && <DokuTab labels={labels} />}
          </>
        )}
        {!labels && !apiFehler && (
          <p className="text-sm text-ink-faint">Lade…</p>
        )}
      </main>

      <footer className="border-t border-line py-6 text-xs text-ink-faint">
        Uni-Projekt · LangChain + Gemini · Nur fiktive Testdaten — keine echten
        Bewerberdaten hochladen.
      </footer>
    </div>
  );
}
