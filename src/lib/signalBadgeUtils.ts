export type SignalLike = {
  id?: string;
  key?: string;
  category?: string;
  groupName?: string;
  isSupreme?: boolean;
  isRare?: boolean;
  isAlavancagem?: boolean;
  isTop1?: boolean;
  confluence?: string;
  label?: string;
  outcome?: "pending" | "green" | "red";
  sources?: Array<{
    analysis: number;
    value: number;
    pct?: number;
    top3?: boolean;
    top5?: boolean;
  }>;
};

export type SignalTypeInfo = {
  groupKey: "alavancagem" | "supreme" | "rare" | "top1_top3" | "top3" | "top1";
  name: string;
  short: string;
  icon: string;
  badgeClass: string;
  cardBadgeClass: string;
};

export function getSignalTypeBadge(sig?: SignalLike | null): SignalTypeInfo {
  if (!sig) {
    return {
      groupKey: "top1",
      name: "Top 1",
      short: "Top 1",
      icon: "🥇",
      badgeClass:
        "bg-emerald-500 text-black border border-emerald-300 shadow-[0_2px_8px_rgba(16,185,129,0.35)]",
      cardBadgeClass: "bg-emerald-500 text-black border-emerald-300",
    };
  }

  const cat = (sig.category || "").toLowerCase();
  const label = (sig.label || "").toUpperCase();
  const conf = (sig.confluence || "").toUpperCase();

  const top1Sources = (sig.sources || []).filter((s: any) => !s.top3 && !s.top5);
  const top3Sources = (sig.sources || []).filter((s: any) => s.top3 || s.top5);
  const distinctTop1 = new Set(top1Sources.map((s: any) => s.analysis));

  // 1. 🚀 Alavancagem (4+ Top 1 confluentes)
  if (
    sig.isAlavancagem ||
    cat.includes("alavanc") ||
    distinctTop1.size >= 4 ||
    label.includes("ALAVANC") ||
    conf.includes("ALAVANC")
  ) {
    return {
      groupKey: "alavancagem",
      name: "Alavancagem",
      short: "Alavanc.",
      icon: "🚀",
      badgeClass:
        "bg-amber-500 text-black border border-amber-300 shadow-[0_2px_8px_rgba(245,158,11,0.4)] font-black",
      cardBadgeClass: "bg-amber-500 text-black border-amber-300",
    };
  }

  // 2. 👑 Supremo (2+ Top 1 E 1+ Top 3)
  if (
    sig.isSupreme ||
    cat.includes("suprem") ||
    cat.includes("winn") ||
    (distinctTop1.size >= 2 && top3Sources.length >= 1) ||
    label.includes("SUPREM") ||
    conf.includes("SUPREM") ||
    label.includes("WINN")
  ) {
    return {
      groupKey: "supreme",
      name: "Supremo",
      short: "Supremo",
      icon: "👑",
      badgeClass:
        "bg-purple-600 text-white border border-purple-300 shadow-[0_2px_8px_rgba(168,85,247,0.4)] font-black",
      cardBadgeClass: "bg-purple-600 text-white border-purple-300",
    };
  }

  // 3. 💎 Raro (2+ Top 1)
  if (
    sig.isRare ||
    cat.includes("rare") ||
    cat.includes("raro") ||
    distinctTop1.size >= 2 ||
    label.includes("RARO") ||
    conf.includes("RARO")
  ) {
    return {
      groupKey: "rare",
      name: "Raro",
      short: "Raro",
      icon: "💎",
      badgeClass:
        "bg-cyan-500 text-black border border-cyan-300 shadow-[0_2px_8px_rgba(6,182,212,0.4)] font-black",
      cardBadgeClass: "bg-cyan-500 text-black border-cyan-300",
    };
  }

  // 4. ⚡ Top 1 & Top 3 (1 Top 1 E 1+ Top 3)
  if (
    cat.includes("top1_top3") ||
    (distinctTop1.size === 1 && top3Sources.length >= 1) ||
    label.includes("TOP 1 & TOP 3") ||
    label.includes("TOP 1 & 3")
  ) {
    return {
      groupKey: "top1_top3",
      name: "Top 1 & Top 3",
      short: "Top 1 & 3",
      icon: "⚡",
      badgeClass:
        "bg-yellow-400 text-black border border-yellow-200 shadow-[0_2px_8px_rgba(234,179,8,0.4)] font-black",
      cardBadgeClass: "bg-yellow-400 text-black border-yellow-200",
    };
  }

  // 5. 🥉 Top 3 (Apenas Top 3)
  if (
    cat.includes("top3") ||
    (sig.key && sig.key.startsWith("m2")) ||
    sig.isTop1 === false ||
    (distinctTop1.size === 0 && top3Sources.length > 0) ||
    label.includes("TOP 3") ||
    conf.includes("TOP 3")
  ) {
    return {
      groupKey: "top3",
      name: "Top 3",
      short: "Top 3",
      icon: "🥉",
      badgeClass:
        "bg-blue-500 text-white border border-blue-300 shadow-[0_2px_8px_rgba(59,130,246,0.4)] font-black",
      cardBadgeClass: "bg-blue-500 text-white border-blue-300",
    };
  }

  // 6. 🥇 Top 1 (Padrão)
  return {
    groupKey: "top1",
    name: "Top 1",
    short: "Top 1",
    icon: "🥇",
    badgeClass:
      "bg-emerald-500 text-black border border-emerald-300 shadow-[0_2px_8px_rgba(16,185,129,0.4)] font-black",
    cardBadgeClass: "bg-emerald-500 text-black border-emerald-300",
  };
}
