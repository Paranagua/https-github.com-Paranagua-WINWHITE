export type Color = "red" | "black" | "white";

export type Spin = {
  id: string;
  n: number;
  color: Color;
  time: string;
  createdAt: string;
};

export type BlazeRound = {
  id: string;
  color: number;
  roll: number;
  created_at: string;
};

export function mapColor(c: number): Color {
  if (c === 0) return "white";
  if (c === 1) return "red";
  return "black";
}

export function colorOf(n: number): Color {
  if (n === 0) return "white";
  if (n >= 1 && n <= 7) return "red";
  return "black";
}

export function fmtTime(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return "--:--";
  let d: Date;
  if (iso instanceof Date) {
    d = iso;
  } else if (typeof iso === "number") {
    d = new Date(iso);
  } else {
    const raw = String(iso).trim();
    if (!raw) return "--:--";
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
    const normalized = hasTz ? raw : `${raw.replace(" ", "T")}Z`;
    d = new Date(normalized);
  }
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function toSpin(r: BlazeRound): Spin {
  return {
    id: r.id,
    n: r.roll,
    color: mapColor(r.color),
    time: fmtTime(r.created_at),
    createdAt: r.created_at,
  };
}
