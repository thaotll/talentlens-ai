"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Sprache = "de" | "en";

const SPRACHE_KEY = "tl.sprache";
const SPRACHE_EVENT = "tl-sprache";

/** Zahlenformat passend zur UI-Sprache (Komma vs. Punkt als Dezimaltrenner). */
export const LOCALES: Record<Sprache, string> = {
  de: "de-DE",
  en: "en-US",
};

// localStorage als externe Quelle via useSyncExternalStore: hydration-sicher
// (Server rendert "en", der Client uebernimmt danach die gespeicherte Wahl)
// und Aenderungen aus anderen Tabs kommen ueber das storage-Event mit.
function abonniere(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SPRACHE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SPRACHE_EVENT, callback);
  };
}

function leseSprache(): Sprache {
  return localStorage.getItem(SPRACHE_KEY) === "de" ? "de" : "en";
}

// Standard Englisch: Kurs und Vortrag laufen auf Englisch
function serverSprache(): Sprache {
  return "en";
}

function setSprache(s: Sprache) {
  localStorage.setItem(SPRACHE_KEY, s);
  window.dispatchEvent(new Event(SPRACHE_EVENT));
}

const SpracheContext = createContext<{
  sprache: Sprache;
  setSprache: (s: Sprache) => void;
}>({ sprache: "en", setSprache: () => {} });

/** Stellt die UI-Sprache bereit; die Auswahl ueberlebt im localStorage. */
export function SpracheProvider({ children }: { children: ReactNode }) {
  const sprache = useSyncExternalStore(abonniere, leseSprache, serverSprache);

  useEffect(() => {
    document.documentElement.lang = sprache;
  }, [sprache]);

  return (
    <SpracheContext.Provider value={{ sprache, setSprache }}>
      {children}
    </SpracheContext.Provider>
  );
}

export function useSprache() {
  return useContext(SpracheContext);
}
