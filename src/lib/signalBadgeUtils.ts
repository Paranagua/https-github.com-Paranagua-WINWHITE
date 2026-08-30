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
      groupKey: "top1_top3",
      name: "Top 1 & Top 3",
      short: "Top 1 & 3",
      icon: "⚡",
      badgeClass:
        "bg-yellow-400 text-black border border-yellow-200 shadow-[0_2px_8px_rgba(234,179,8,0.4)] font-black",
      cardBadgeClass: "bg-yellow-400 text-black border-yellow-200",
    };
  }

  const cat = (sig.category || "").toLowerCase();
  const label = (sig.label || "").toUpperCase();
  const conf = (sig.confluence || "").toUpperCase();

  const top1Sources = (sig.sources || []).filter((s: any) => !s.top3 && !s.top5);
  const top3Sources = (sig.sources || []).filter((s: any) => s.top3 || s.top5);
  const distinctTop1 = new Set(top1Sources.map((s: any) => s.analysis));
  const distinctTop3 = new Set(top3Sources.map((s: any) => s.analysis));

  // Quando fontes estruturadas estão presentes, calcula estritamente pelas regras dos grupos:
  if (distinctTop1.size > 0 || distinctTop3.size > 0) {
    // 1. 🚀 Alavancagem (>= 4x Top 1)
    if (distinctTop1.size >= 4) {
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

    // 2. 👑 Supremo (2x ou 3x Top 1 + 2+ Top 2/3)
    if ((distinctTop1.size === 2 || distinctTop1.size === 3) && distinctTop3.size >= 2) {
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

    // 3. 💎 Raro (2x ou 3x Top 1 com 0 ou 1 Top 2/3)
    if ((distinctTop1.size === 2 || distinctTop1.size === 3) && distinctTop3.size < 2) {
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

    // 4. ⚡ Top 1 & Top 3 (1x Top 1 + 1+ Top 2/3)
    if (distinctTop1.size === 1 && distinctTop3.size >= 1) {
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
  }

  // Fallback por categoria/flags se não houver sources detalhados
  if (
    sig.isAlavancagem ||
    cat.includes("alavanc") ||
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

  if (
    sig.isSupreme ||
    cat.includes("suprem") ||
    cat.includes("winn") ||
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

  if (
    sig.isRare ||
    cat.includes("rare") ||
    cat.includes("raro") ||
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
