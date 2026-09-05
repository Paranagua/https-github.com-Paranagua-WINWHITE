import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import { parseUtcDate } from "../lib/utils";
import {
  buildA2,
  buildA3,
  buildA4,
  buildA5,
  buildA8_11,
  buildA11_11,
  buildA4_11,
  buildA4_14,
  buildASoma17,
  buildASoma19,
  buildASoma21,
  buildA1Minuto5,
  buildA2Minuto5,
  buildA1Minuto1,
  buildA2Minuto1,
  buildA1Minuto2,
  buildA2Minuto2,
  buildA1Minuto3,
  buildA2Minuto3,
  buildA1Minuto4,
  buildA2Minuto4,
  buildA1Minuto6,
  buildA2Minuto6,
  buildA1Minuto7,
  buildA2Minuto7,
  buildA1Minuto8,
  buildA2Minuto8,
  buildA1Minuto9,
  buildASandwichPontas,
  buildASandwichMeio,
  buildA7_11,
  buildSecondary,
  buildRecAlerts,
  checkHighTendency,
  computeTop,
  isValidCycle,
  MAX_ZEROS,
  type Cycle,
  type Row,
} from "../lib/predictive";
import { computeAllSumTriggerProjections } from "../lib/sum19Strategies";
import { computeConfirmationProjections } from "../lib/confirmationStrategies";
import {
  buildStrategyTriggeredSignals,
  mergeSignalsLifecycle,
  getCanonicalSignalKey,
  type RawCandidate,
} from "../lib/signalHierarchy";
import { auditSignalWithRounds, type AuditResultItem } from "../lib/signalAuditEngine";
import {
  detectAllColorPatternBreaks,
  colorBreaksToCycles,
  COLOR_PATTERNS,
} from "../lib/colorPatternBreaks";
import type { PredictiveSignal } from "../lib/signalsStore";
import type { SignalHistoryEntry, AnalysisStat } from "../lib/signalStatsStore";

const BLAZE_SUPABASE_URL = "https://fprjzaawmhadvwdlyfun.supabase.co";
const BLAZE_SUPABASE_ANON_KEY = "sb_publishable_6_SYqk2nwh4IyEgwLGtiuQ_JI_Zf9Ov";

const STORAGE_FILE = path.join(process.cwd(), "data", "autonomous_audit_store.json");

const CANDIDATE_DEPTH = 3;
const TOP3_DEPTH = 3;
const MIN_ASSERTIVIDADE_TOP1 = 65;
const MIN_ASSERTIVIDADE_TOP3 = 55;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export interface AutonomousAuditState {
  status: "running" | "idle" | "error";
  lastRunAt: string | null;
  lastRoundId: number | null;
  totalAudited: number;
  activeSignals: PredictiveSignal[];
  recentSignals: SignalHistoryEntry[];
  stats: Record<string, AnalysisStat>;
  error?: string | null;
  debugInfo?: any;
}

class AutonomousAuditEngine {
  private supabaseClient = createClient(BLAZE_SUPABASE_URL, BLAZE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", BLAZE_SUPABASE_ANON_KEY);
        if (headers.get("Authorization") === `Bearer ${BLAZE_SUPABASE_ANON_KEY}`) {
          headers.delete("Authorization");
        }
        return fetch(input, { ...init, headers });
      },
    },
  });

  private isRunning = false;
  private isProcessing = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private realtimeChannel: any = null;

  private state: AutonomousAuditState = {
    status: "idle",
    lastRunAt: null,
    lastRoundId: null,
    totalAudited: 0,
    activeSignals: [],
    recentSignals: [],
    stats: {},
    error: null,
  };

  constructor() {
    this.loadPersistedState().catch((err) => {
      console.warn("[AutonomousEngine] Could not load persisted state:", err.message);
    });
  }

  public async clearData(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.state.recentSignals = [];
    this.state.stats = {};
    this.state.totalAudited = 0;
    this.state.activeSignals = [];
    this.activeCandidateSignals = [];
    try {
      await fs.mkdir(path.dirname(STORAGE_FILE), { recursive: true });
      const payload = {
        savedAt: new Date().toISOString(),
        totalAudited: 0,
        lastRoundId: this.state.lastRoundId,
        recentSignals: [],
        stats: {},
      };
      await fs.writeFile(STORAGE_FILE, JSON.stringify(payload, null, 2), "utf-8");
      console.log("[AutonomousEngine] Storage cleared successfully upon user request.");
    } catch (err) {
      console.warn("[AutonomousEngine] Error writing cleared state:", err);
    }
  }

  public getState(): AutonomousAuditState {
    return {
      ...this.state,
      activeSignals: this.state.activeSignals.map((s) => ({
        ...s,
        entryDate: s.entryDate instanceof Date ? s.entryDate.toISOString() : s.entryDate,
      })),
    };
  }

  public async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.state.status = "running";
    console.log("[AutonomousEngine] Starting autonomous signal & audit worker...");

    // Execute first cycle immediately
    await this.runCycle().catch((err) => {
      console.error("[AutonomousEngine] Initial cycle error:", err);
    });

    // Start high-frequency poll every 3.5s
    this.pollTimer = setInterval(() => {
      this.runCycle().catch((err) => {
        console.error("[AutonomousEngine] Cycle error:", err);
      });
    }, 3500);

    // Setup Supabase Realtime subscription
    try {
      this.realtimeChannel = this.supabaseClient
        .channel("server_autonomous_blaze_results")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "blaze_results" },
          () => {
            this.runCycle().catch((err) => {
              console.error("[AutonomousEngine] Realtime cycle error:", err);
            });
          },
        )
        .subscribe();
    } catch (err) {
      console.warn("[AutonomousEngine] Realtime subscribe warning:", err);
    }
  }

  public stop() {
    this.isRunning = false;
    this.state.status = "idle";
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.realtimeChannel) {
      try {
        this.supabaseClient.removeChannel(this.realtimeChannel);
      } catch {
        // ignore unsubscribe errors
      }
      this.realtimeChannel = null;
    }
    console.log("[AutonomousEngine] Autonomous worker stopped.");
  }

  public async runCycle(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Carrega os últimos 600 resultados da Blaze (ordem cronológica: mais antigo -> mais recente)
      const { data, error } = await this.supabaseClient
        .from("blaze_results")
        .select("id, roll, color, created_at")
        .order("id", { ascending: false })
        .limit(600);

      if (error) {
        throw new Error(`blaze_results query failed: ${error.message}`);
      }
      if (!data || data.length === 0) {
        return;
      }

      const rows: Row[] = data.slice().sort((a, b) => a.id - b.id);
      const latestRow = rows[rows.length - 1];
      const highestId = latestRow ? latestRow.id : null;

      const now = new Date();

      // Converte para formato de auditoria
      const auditRounds: AuditResultItem[] = rows.map((r) => {
        const colorVal =
          String(r.color) === "0" ? "white" : String(r.color) === "1" ? "red" : "black";
        return {
          id: r.id,
          roll: Number(r.roll),
          color: colorVal,
          createdAt: r.created_at,
        };
      });

      // 2. Extrai candidatos brutos e projeções das estratégias
      const rawCandidates = this.extractRawCandidates(rows, now);
      const sumProjections = computeAllSumTriggerProjections(rows);
      const confProjections = computeConfirmationProjections(rows);
      const recAlerts = buildRecAlerts(rows);

      const alertWindow = recAlerts.map((a) => ({
        type: a.type,
        start: a.triggerAt.getTime(),
        end: a.triggerAt.getTime() + a.duration * 60000,
      }));

      // 3. Constrói sinais disparados por estratégias de soma (com confluências obrigatórias)
      // Permite captura autônoma de sinais históricos recentes para auditoria contínua 24/7
      const triggeredSignals = buildStrategyTriggeredSignals(
        sumProjections,
        rawCandidates,
        confProjections,
        alertWindow,
        now.getTime(),
        {
          allowHistorical: true,
          minTargetTime: now.getTime() - 5 * 3600_000,
          maxTargetTime: undefined, // Sem limite de 60 minutos
        },
      );

      console.log(
        `[AutonomousEngine] Cycle stats: rows=${rows.length}, sumProjections=${sumProjections.length}, rawCandidates=${rawCandidates.length}, confProjections=${confProjections.length}, triggeredSignals=${triggeredSignals.length}`,
      );

      // 4. Mescla o ciclo de vida dos sinais (sem perder estados e respeitando transições)
      const mergedSignals = mergeSignalsLifecycle(
        this.state.activeSignals,
        triggeredSignals,
        rows,
        now.getTime(),
        {
          allowHistorical: true,
          maxPastWindowMs: 5 * 3600_000,
        },
      );

      let hasStateChanges = false;
      const nowMs = now.getTime();

      // 5. Auditoria rigorosa e captura autônoma de resultados (WIN / LOSS)
      const updatedActiveSignals: PredictiveSignal[] = [];

      for (const sig of mergedSignals) {
        if (!sig || !sig.entryDate) continue;

        const sigTime =
          sig.entryDate instanceof Date
            ? sig.entryDate.getTime()
            : parseUtcDate(sig.entryDate as any).getTime();

        // Se o sinal já foi auditado como WIN ou LOSS
        if (sig.outcome === "green" || sig.outcome === "red") {
          this.recordCompletedSignal({
            key: sig.key || getCanonicalSignalKey(sig.entryDate),
            time: sig.time,
            outcome: sig.outcome,
            label: sig.outcome === "green" ? "WIN" : "LOSS",
            confluence: sig.confluence,
            resultTime: sig.resultTime,
            strategyKey: sig.strategyKey,
            confirmedStrategies: sig.confirmedStrategies,
            targetTime: sig.time,
            windowLabel: sig.windowLabel || sig.audit?.windowLabel,
            checkedResults: sig.checkedResults || sig.audit?.checkedResults || 6,
            winningResultId: sig.winningResultId,
            winningResultCreatedAt: sig.winningResultCreatedAt,
            audit: sig.audit,
            sources: sig.sources,
            category: (sig as any).category,
            isSupreme: sig.isSupreme,
            isRare: sig.isRare,
            isAlavancagem: sig.isAlavancagem,
            isTop1: sig.isTop1,
          });
          hasStateChanges = true;

          // Mantém no activeSignals por 3 minutos para exibição em tempo real se recente
          if (sig.completedAt && nowMs - sig.completedAt <= 3 * 60_000) {
            updatedActiveSignals.push(sig);
          }
          continue;
        }

        // Executa a conferência estrita de 6 rodadas nas janelas M-1, M, M+1
        const auditRes = auditSignalWithRounds(sig, auditRounds);
        const cat =
          (sig as any).category ||
          (sig.isAlavancagem
            ? "alavancagem"
            : sig.isSupreme
              ? "supreme"
              : sig.isRare
                ? "rare"
                : sig.isTop1
                  ? "top1_isolated"
                  : undefined);

        if (auditRes.outcome === "green") {
          // CAPTURADO: WIN (Branco confirmado)
          sig.outcome = "green";
          sig.label = "WIN";
          sig.resultTime = auditRes.resultTime || sig.resultTime;
          sig.winningResultId = auditRes.winningResultId || sig.winningResultId;
          sig.completedAt = sig.completedAt || auditRes.completedAt || nowMs;
          sig.audit = auditRes.audit || sig.audit;

          this.recordCompletedSignal({
            key: sig.key || getCanonicalSignalKey(sig.entryDate),
            time: sig.time,
            outcome: "green",
            label: "WIN",
            confluence: sig.confluence,
            resultTime: sig.resultTime,
            strategyKey: sig.strategyKey,
            confirmedStrategies: sig.confirmedStrategies,
            targetTime: sig.time,
            windowLabel: auditRes.audit?.windowLabel,
            checkedResults: auditRes.audit?.checkedResults,
            winningResultId: auditRes.winningResultId,
            winningResultCreatedAt: auditRes.audit?.winningResultCreatedAt,
            audit: auditRes.audit,
            sources: sig.sources,
            category: cat,
            isSupreme: sig.isSupreme,
            isRare: sig.isRare,
            isAlavancagem: sig.isAlavancagem,
            isTop1: sig.isTop1,
          });

          hasStateChanges = true;
          updatedActiveSignals.push(sig);
        } else if (auditRes.outcome === "red") {
          // CAPTURADO: LOSS (6 rodadas concluídas sem branco)
          sig.outcome = "red";
          sig.label = "LOSS";
          sig.resultTime = auditRes.resultTime || sig.resultTime;
          sig.completedAt = sig.completedAt || auditRes.completedAt || nowMs;
          sig.audit = auditRes.audit || sig.audit;

          this.recordCompletedSignal({
            key: sig.key || getCanonicalSignalKey(sig.entryDate),
            time: sig.time,
            outcome: "red",
            label: "LOSS",
            confluence: sig.confluence,
            resultTime: sig.resultTime,
            strategyKey: sig.strategyKey,
            confirmedStrategies: sig.confirmedStrategies,
            targetTime: sig.time,
            windowLabel: auditRes.audit?.windowLabel,
            checkedResults: auditRes.audit?.checkedResults,
            winningResultId: null,
            winningResultCreatedAt: null,
            audit: auditRes.audit,
            sources: sig.sources,
            category: cat,
            isSupreme: sig.isSupreme,
            isRare: sig.isRare,
            isAlavancagem: sig.isAlavancagem,
            isTop1: sig.isTop1,
          });

          hasStateChanges = true;
          updatedActiveSignals.push(sig);
        } else {
          // PENDING: Ainda dentro da janela de espera
          // Se já passou mais de 10 minutos após o alvo e não houve branco, encerra como LOSS
          if (!Number.isNaN(sigTime) && nowMs - sigTime > 10 * 60_000) {
            sig.outcome = "red";
            sig.label = "LOSS";
            sig.completedAt = nowMs;
            this.recordCompletedSignal({
              key: sig.key || getCanonicalSignalKey(sig.entryDate),
              time: sig.time,
              outcome: "red",
              label: "LOSS",
              confluence: sig.confluence,
              strategyKey: sig.strategyKey,
              confirmedStrategies: sig.confirmedStrategies,
              targetTime: sig.time,
              windowLabel: auditRes.audit?.windowLabel || "--",
              checkedResults: auditRes.audit?.checkedResults || 6,
              winningResultId: null,
              winningResultCreatedAt: null,
              audit: auditRes.audit,
              sources: sig.sources,
              category: cat,
              isSupreme: sig.isSupreme,
              isRare: sig.isRare,
              isAlavancagem: sig.isAlavancagem,
              isTop1: sig.isTop1,
            });
            hasStateChanges = true;
          } else {
            sig.outcome = "pending";
            sig.audit = auditRes.audit;
            updatedActiveSignals.push(sig);
          }
        }
      }

      this.state.activeSignals = updatedActiveSignals;
      this.state.lastRoundId = highestId;
      this.state.lastRunAt = now.toISOString();
      this.state.error = null;
      this.state.debugInfo = {
        rowsCount: rows.length,
        sumProjectionsCount: sumProjections.length,
        rawCandidatesCount: rawCandidates.length,
        confProjectionsCount: confProjections.length,
        triggeredSignalsCount: triggeredSignals.length,
        mergedSignalsCount: mergedSignals.length,
        updatedActiveCount: updatedActiveSignals.length,
        sampleSumProjections: sumProjections.slice(-3).map((p) => ({
          code: p.code,
          target: p.targetDate,
          sumType: p.sumType,
        })),
      };

      if (hasStateChanges) {
        this.schedulePersistence();
      }
    } catch (err: any) {
      this.state.error = err?.message || String(err);
      console.error("[AutonomousEngine] Error in audit cycle:", err);
    } finally {
      this.isProcessing = false;
    }
  }

  private recordCompletedSignal(signal: {
    key: string;
    time: string;
    outcome: "green" | "red";
    label?: string;
    confluence?: string;
    resultTime?: string;
    strategyKey?: string;
    confirmedStrategies?: Array<{ code: string; name?: string; id?: number }>;
    targetTime?: string;
    windowLabel?: string;
    checkedResults?: number;
    winningResultId?: string | null;
    winningResultCreatedAt?: string | null;
    audit?: any;
    sources?: Array<{ analysis: number; value: number }>;
    category?: string;
    isSupreme?: boolean;
    isRare?: boolean;
    isAlavancagem?: boolean;
    isTop1?: boolean;
  }) {
    // Sinais sem confluência (E1-E15 isoladas) NUNCA são contabilizados no painel auditor
    if (
      (signal as any).isNoConfluence ||
      signal.category === "no_confluence" ||
      (signal.confluence && signal.confluence.includes("Sem Confluência"))
    ) {
      return;
    }

    const existingIndex = this.state.recentSignals.findIndex((s) => s.key === signal.key);
    const alreadyExists = existingIndex >= 0;
    const prevEntry = alreadyExists ? this.state.recentSignals[existingIndex] : null;

    const isCorrectionFromRedToGreen =
      alreadyExists && prevEntry && prevEntry.outcome === "red" && signal.outcome === "green";

    // Imutabilidade WIN / LOSS (WIN nunca vira LOSS; LOSS só corrige se comprovou WIN)
    if (
      alreadyExists &&
      prevEntry &&
      (prevEntry.outcome === "green" ||
        (prevEntry.outcome === "red" && !isCorrectionFromRedToGreen))
    ) {
      return;
    }

    const newEntry: SignalHistoryEntry = {
      key: signal.key,
      time: signal.time,
      outcome: signal.outcome,
      label: signal.label,
      confluence: signal.confluence,
      resultTime: signal.resultTime,
      timestamp: Date.now(),
      targetTime: signal.targetTime || signal.time,
      strategyKey: signal.strategyKey,
      confirmedStrategies: signal.confirmedStrategies,
      windowLabel: signal.windowLabel,
      checkedResults: signal.checkedResults,
      winningResultId: signal.winningResultId,
      winningResultCreatedAt: signal.winningResultCreatedAt,
      audit: signal.audit,
      sources: signal.sources,
      category: signal.category,
      isSupreme: signal.isSupreme,
      isRare: signal.isRare,
      isAlavancagem: signal.isAlavancagem,
      isTop1: signal.isTop1,
    };

    if (isCorrectionFromRedToGreen && existingIndex >= 0) {
      this.state.recentSignals = this.state.recentSignals.map((s, idx) =>
        idx === existingIndex ? newEntry : s,
      );
    } else {
      this.state.recentSignals = [newEntry, ...this.state.recentSignals].slice(0, 150);
      this.state.totalAudited += 1;
    }

    // Atualiza estatísticas autônomas por estratégia e confluência
    const newStats = { ...this.state.stats };
    const keysToUpdate = new Set<string>();

    if (signal.strategyKey) {
      keysToUpdate.add(signal.strategyKey);
      const clean = signal.strategyKey.replace(/^(S19_|S17_)/, "");
      keysToUpdate.add(clean);
      if (clean === "9-10" || clean === "10-9") keysToUpdate.add("S19_10-9");
      if (clean === "7-12" || clean === "12-7") keysToUpdate.add("S19_12-7");
      if (clean === "13-6" || clean === "6-13") keysToUpdate.add("S19_6-13");
      if (clean === "5-14" || clean === "14-5") keysToUpdate.add("S19_14-5");
      if (clean === "11-8") keysToUpdate.add("S19_11-8");
      if (clean === "8-11") keysToUpdate.add("S19_8-11");
      if (clean === "10-7") keysToUpdate.add("S17_10-7");
      if (clean === "7-10") keysToUpdate.add("S17_7-10");
      if (clean === "9-8" || clean === "8-9") keysToUpdate.add("S17_8-9");
      if (clean === "6-11" || clean === "11-6") keysToUpdate.add("S17_11-6");
      if (clean === "5-12") keysToUpdate.add("S17_5-12");
      if (clean === "12-5") keysToUpdate.add("S17_12-5");
      if (clean === "13-4") keysToUpdate.add("S17_13-4");
      if (clean === "4-13") keysToUpdate.add("S17_4-13");
      if (clean === "3-14" || clean === "14-3") keysToUpdate.add("S17_14-3");
    }

    if (Array.isArray(signal.confirmedStrategies)) {
      signal.confirmedStrategies.forEach((cs) => {
        if (cs && cs.code) keysToUpdate.add(cs.code);
      });
    }

    if (Array.isArray(signal.sources)) {
      signal.sources.forEach((src) => {
        if (src && src.analysis) {
          keysToUpdate.add(`A${src.analysis}`);
          if (src.analysis >= 50 && src.analysis <= 56) {
            keysToUpdate.add(`Q${src.analysis - 49}`);
          }
        }
      });
    }
    if (signal.strategyKey && /^[AQ]\d+/i.test(signal.strategyKey)) {
      keysToUpdate.add(signal.strategyKey.toUpperCase());
    }

    keysToUpdate.forEach((k) => {
      const cur = newStats[k] || { green: 0, red: 0, lastUpdated: Date.now() };
      if (isCorrectionFromRedToGreen) {
        newStats[k] = {
          ...cur,
          green: cur.green + 1,
          red: Math.max(0, cur.red - 1),
          lastUpdated: Date.now(),
        };
      } else {
        newStats[k] = {
          ...cur,
          green: signal.outcome === "green" ? cur.green + 1 : cur.green,
          red: signal.outcome === "red" ? cur.red + 1 : cur.red,
          lastUpdated: Date.now(),
        };
      }
    });

    this.state.stats = newStats;
  }

  private extractRawCandidates(rows: Row[], now: Date): RawCandidate[] {
    const rawCandidates: RawCandidate[] = [];

    const engine: Record<number, Cycle[]> = {
      2: buildA2(rows),
      3: buildA3(rows),
      4: buildA4(rows),
      5: buildA5(rows),
      10: buildA8_11(rows),
      11: buildA11_11(rows),
      12: buildA4_11(rows),
      13: buildA4_14(rows),
      14: buildASoma17(rows),
      15: buildASoma19(rows),
      16: buildASoma21(rows),
      17: buildA1Minuto5(rows),
      18: buildA2Minuto5(rows),
      19: buildASandwichPontas(rows),
      20: buildASandwichMeio(rows),
      21: buildA7_11(rows),
      22: buildA1Minuto1(rows),
      23: buildA2Minuto1(rows),
      24: buildA1Minuto2(rows),
      25: buildA2Minuto2(rows),
      26: buildA1Minuto3(rows),
      27: buildA2Minuto3(rows),
      28: buildA1Minuto4(rows),
      29: buildA2Minuto4(rows),
      30: buildA1Minuto6(rows),
      31: buildA2Minuto6(rows),
      32: buildA1Minuto7(rows),
      33: buildA2Minuto7(rows),
      34: buildA1Minuto8(rows),
      35: buildA2Minuto8(rows),
      36: buildA1Minuto9(rows),
    };

    for (let i = 1; i <= 9; i++) {
      engine[100 + i] = buildSecondary(rows, i);
    }

    const colorBreakCyclesMap = detectAllColorPatternBreaks(rows);
    COLOR_PATTERNS.forEach((p) => {
      const brks = colorBreakCyclesMap[p.id] || [];
      engine[p.analysisId] = colorBreaksToCycles(brks, rows);
    });

    const recAlerts = buildRecAlerts(rows);

    const activeList: Array<{ analysis: number; value: number; open: Cycle }> = [];
    const mainIds = [
      2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
      30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56,
    ];

    mainIds.forEach((a) => {
      const cycles = engine[a] || [];
      const openByValue = new Map<number, Cycle>();
      cycles.forEach((cycle) => {
        if (cycle.gaps.length < MAX_ZEROS) {
          const existing = openByValue.get(cycle.value);
          if (!existing || cycle.triggerAt.getTime() > existing.triggerAt.getTime()) {
            openByValue.set(cycle.value, cycle);
          }
        }
      });
      openByValue.forEach((open, value) => {
        activeList.push({ analysis: a, value, open });
      });
    });

    for (const item of activeList) {
      const allCycles = (engine[item.analysis] || []).filter((c) => c.value === item.value);
      const pastValid = allCycles.filter(
        (c) =>
          c !== item.open &&
          c.triggerAt.getTime() <= item.open.triggerAt.getTime() &&
          isValidCycle(c),
      );

      if (pastValid.length < 4) continue;
      const hist = pastValid.slice(-5);
      const candidates = computeTop(hist, CANDIDATE_DEPTH);
      if (!candidates.length) continue;

      const cycleKey = `A${item.analysis}_V${item.value}_T${item.open.triggerAt.getTime()}`;

      // Top 1 (assertividade >= 65%)
      const top1Candidate = candidates[0];
      if (top1Candidate && top1Candidate.pct >= MIN_ASSERTIVIDADE_TOP1) {
        let targetMinutes = top1Candidate.m;
        if ([17, 18].includes(item.analysis)) targetMinutes += 1;
        const at = addMinutes(item.open.triggerAt, targetMinutes);
        const t = at.getTime();

        // Sem limite superior de 60 minutos
        if (t >= now.getTime() - 5 * 3600_000) {
          const isTendency = checkHighTendency(engine[item.analysis] || [], item.value);
          const isPossibleRec = recAlerts.some((alert) => {
            const sigTime = at.getTime();
            const alertStart = alert.triggerAt.getTime();
            const alertEnd = alertStart + alert.duration * 60000;
            return sigTime >= alertStart && sigTime <= alertEnd;
          });

          const stratKey =
            item.analysis >= 50 && item.analysis <= 56
              ? `Q${item.analysis - 49}`
              : `A${item.analysis}`;

          rawCandidates.push({
            analysis: item.analysis,
            value: item.value,
            pct: top1Candidate.pct,
            targetDate: at,
            isTop1: true,
            rank: 1,
            isHighTendency: isTendency,
            isRecAlert: isPossibleRec,
            strategyKey: stratKey,
            cycleKey,
          });
        }
      }

      // Top 2 / 3 (assertividade >= 55%)
      candidates.slice(1, TOP3_DEPTH).forEach((cand, idx) => {
        if (cand.pct < MIN_ASSERTIVIDADE_TOP3) return;
        let m = cand.m;
        if ([17, 18].includes(item.analysis)) m += 1;
        const at = addMinutes(item.open.triggerAt, m);
        const t = at.getTime();

        // Sem limite superior de 60 minutos
        if (t >= now.getTime() - 5 * 3600_000) {
          const isTendency = checkHighTendency(engine[item.analysis] || [], item.value);
          const isPossibleRec = recAlerts.some((alert) => {
            const sigTime = at.getTime();
            const alertStart = alert.triggerAt.getTime();
            const alertEnd = alertStart + alert.duration * 60000;
            return sigTime >= alertStart && sigTime <= alertEnd;
          });

          const candStratKey =
            item.analysis >= 50 && item.analysis <= 56
              ? `Q${item.analysis - 49}`
              : `A${item.analysis}`;

          rawCandidates.push({
            analysis: item.analysis,
            value: item.value,
            pct: cand.pct,
            targetDate: at,
            isTop1: false,
            rank: idx + 2,
            isHighTendency: isTendency,
            isRecAlert: isPossibleRec,
            strategyKey: candStratKey,
            cycleKey,
          });
        }
      });
    }

    return rawCandidates;
  }

  private schedulePersistence() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.persistState().catch((err) => {
        console.error("[AutonomousEngine] Error persisting state:", err);
      });
    }, 1500);
  }

  private async persistState(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(STORAGE_FILE), { recursive: true });
      const payload = {
        savedAt: new Date().toISOString(),
        totalAudited: this.state.totalAudited,
        lastRoundId: this.state.lastRoundId,
        recentSignals: this.state.recentSignals,
        stats: this.state.stats,
      };
      await fs.writeFile(STORAGE_FILE, JSON.stringify(payload, null, 2), "utf-8");
    } catch (err) {
      console.warn("[AutonomousEngine] Failed to write storage file:", err);
    }
  }

  private async loadPersistedState(): Promise<void> {
    try {
      const exists = await fs
        .stat(STORAGE_FILE)
        .then(() => true)
        .catch(() => false);
      if (!exists) return;

      const raw = await fs.readFile(STORAGE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.recentSignals)) {
        this.state.recentSignals = parsed.recentSignals;
        this.state.stats = parsed.stats || {};
        this.state.totalAudited = parsed.totalAudited || parsed.recentSignals.length;
        this.state.lastRoundId = parsed.lastRoundId || null;
        console.log(
          `[AutonomousEngine] Loaded ${parsed.recentSignals.length} audited signals from disk.`,
        );
      }
    } catch (err) {
      console.warn("[AutonomousEngine] Could not read storage file:", err);
    }
  }
}

// Global singleton instance so it survives HMR and is shared across server requests
const globalInstanceKey = "__blaze_autonomous_audit_engine__";
const g = globalThis as any;

if (!g[globalInstanceKey]) {
  g[globalInstanceKey] = new AutonomousAuditEngine();
  // Automatically start background processing in Node
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    g[globalInstanceKey].start();
  }
}

export const autonomousEngine: AutonomousAuditEngine = g[globalInstanceKey];
