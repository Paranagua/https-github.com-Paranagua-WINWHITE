import type { SignalAuditInfo } from "./signalAuditEngine";

// Store leve para compartilhar sinais entre /sinais e /historico via localStorage.
export type StoredSignal = {
  id: string;
  color: "red" | "black" | "white";
  entry: number;
  targetIso: string; // ISO UTC do horário do sinal
  outcome: "pending" | "green" | "red";
  matchedIso?: string; // ISO UTC do resultado que bateu (se green)
  winningResultId?: string | null;
  audit?: SignalAuditInfo;
  category?: string;
  groupName?: string;
  isSupreme?: boolean;
  isRare?: boolean;
  isAlavancagem?: boolean;
  isTop1?: boolean;
  label?: string;
  confluence?: string;
  sources?: Array<{
    analysis: number;
    value: number;
    pct?: number;
    top3?: boolean;
    top5?: boolean;
  }>;
};

const KEY = "freitas.signals.v1";
const ROBOT_KEY = "freitas.robot.enabled";
const PREDICTIVE_KEY = "freitas.predictive.signals";
const EVENT = "freitas:signals";
const ROBOT_EVENT = "freitas:robot";
const PREDICTIVE_EVENT = "freitas:predictive";

const EMPTY_SIGNALS: StoredSignal[] = [];
const EMPTY_PREDICTIVE: PredictiveSignal[] = [];

function read(): StoredSignal[] {
  if (typeof window === "undefined") return EMPTY_SIGNALS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredSignal[]) : EMPTY_SIGNALS;
  } catch {
    return EMPTY_SIGNALS;
  }
}

let cache: StoredSignal[] = EMPTY_SIGNALS;
let hydrated = false;

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  cache = read();
}

export function setSignals(next: StoredSignal[]) {
  if (typeof window === "undefined") return;
  hydrated = true;
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT));
}

export function getSignals(): StoredSignal[] {
  ensureHydrated();
  return cache;
}

export function getSignalsServerSnapshot(): StoredSignal[] {
  return EMPTY_SIGNALS;
}

export function subscribeSignals(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = () => {
    cache = read();
    listener();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) onChange();
  });
  return () => {
    window.removeEventListener(EVENT, onChange);
  };
}

export function setRobotEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROBOT_KEY, enabled ? "true" : "false");
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(ROBOT_EVENT));
}

export function getRobotEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ROBOT_KEY) === "true";
  } catch {
    return false;
  }
}

export function subscribeRobot(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ROBOT_EVENT, listener);
  window.addEventListener("storage", (e) => {
    if (e.key === ROBOT_KEY) listener();
  });
  return () => {
    window.removeEventListener(ROBOT_EVENT, listener);
  };
}

export type PredictiveSignal = {
  key: string;
  time: string;
  pct: number;
  label: string;
  confluence: string;
  medal?: string;
  outcome?: "pending" | "green" | "red";
  resultTime?: string;
  entryDate?: Date;
  isHighTendency?: boolean;
  isVerified?: boolean;
  isRare?: boolean;
  isSupreme?: boolean;
  isAlavancagem?: boolean;
  isTop1?: boolean;
  category?: string;
  groupName?: string;
  completedAt?: number;
  strategyKey?: string;
  winningResultId?: string | null;
  audit?: SignalAuditInfo;
  sources?: Array<{
    analysis: number;
    value: number;
    pct?: number;
    top3?: boolean;
    top5?: boolean;
  }>;
};

let lastPredictiveSerialized = "";
let predictiveCache: PredictiveSignal[] = EMPTY_PREDICTIVE;
let predictiveHydrated = false;

function readPredictive(): PredictiveSignal[] {
  if (typeof window === "undefined") return EMPTY_PREDICTIVE;
  try {
    const raw = window.localStorage.getItem(PREDICTIVE_KEY);
    return raw ? (JSON.parse(raw) as PredictiveSignal[]) : EMPTY_PREDICTIVE;
  } catch {
    return EMPTY_PREDICTIVE;
  }
}

function ensurePredictiveHydrated() {
  if (predictiveHydrated) return;
  predictiveHydrated = true;
  predictiveCache = readPredictive();
}

export function setPredictiveSignals(signals: PredictiveSignal[]) {
  if (typeof window === "undefined") return;
  try {
    // Normaliza para comparação estável (evitando loops infinitos de datas com milissegundos)
    const normalized = signals.map((s) => ({
      key: s.key,
      time: s.time,
      pct: s.pct,
      label: s.label,
      confluence: s.confluence,
      outcome: s.outcome,
      resultTime: s.resultTime,
      strategyKey: s.strategyKey,
      isAlavancagem: s.isAlavancagem,
      isSupreme: s.isSupreme,
      isRare: s.isRare,
      isTop1: s.isTop1,
      category: s.category,
      groupName: s.groupName,
      isVerified: s.isVerified,
    }));
    const nextStr = JSON.stringify(normalized);
    if (nextStr === lastPredictiveSerialized) return;
    lastPredictiveSerialized = nextStr;
    predictiveHydrated = true;
    predictiveCache = signals;
    window.localStorage.setItem(PREDICTIVE_KEY, JSON.stringify(signals));
    window.dispatchEvent(new Event(PREDICTIVE_EVENT));
  } catch {
    // ignore
  }
}

export function getPredictiveSignals(): PredictiveSignal[] {
  ensurePredictiveHydrated();
  return predictiveCache;
}

export function getPredictiveServerSnapshot(): PredictiveSignal[] {
  return EMPTY_PREDICTIVE;
}

export function subscribePredictive(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onChange = () => {
    predictiveCache = readPredictive();
    listener();
  };
  window.addEventListener(PREDICTIVE_EVENT, onChange);
  window.addEventListener("storage", (e) => {
    if (e.key === PREDICTIVE_KEY) onChange();
  });
  return () => {
    window.removeEventListener(PREDICTIVE_EVENT, onChange);
  };
}
