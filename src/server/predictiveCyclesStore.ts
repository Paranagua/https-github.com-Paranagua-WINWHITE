import { type PersistedCycleRecord } from "@/lib/cyclePersistence";

// Buffer em memória para ciclos preditivos no servidor (garante fallback imediato mesmo sem conexão de banco)
class PredictiveCyclesStore {
  private cyclesMap = new Map<string, PersistedCycleRecord>();

  public upsertBatch(records: PersistedCycleRecord[]): number {
    let count = 0;
    for (const rec of records) {
      if (!rec || !rec.cycle_key) continue;
      const existing = this.cyclesMap.get(rec.cycle_key);
      if (!existing || rec.gaps.length >= existing.gaps.length) {
        this.cyclesMap.set(rec.cycle_key, {
          ...rec,
          updated_at: new Date().toISOString(),
        });
        count++;
      }
    }
    return count;
  }

  public getCycles(options?: {
    analysis?: number;
    value?: number;
    limit?: number;
  }): PersistedCycleRecord[] {
    const list: PersistedCycleRecord[] = [];
    const limit = options?.limit ?? 300;

    this.cyclesMap.forEach((rec) => {
      if (options?.analysis !== undefined && rec.analysis !== options.analysis) return;
      if (options?.value !== undefined && rec.value !== options.value) return;
      list.push(rec);
    });

    return list
      .sort((a, b) => new Date(b.trigger_at).getTime() - new Date(a.trigger_at).getTime())
      .slice(0, limit);
  }

  public count(): number {
    return this.cyclesMap.size;
  }
}

export const predictiveCyclesStore = new PredictiveCyclesStore();
