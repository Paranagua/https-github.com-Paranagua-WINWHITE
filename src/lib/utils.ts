import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converte um timestamp do banco em Date. Valores sem indicação de fuso
 * (ex: "2026-08-01T06:13:41.356") são UTC — sem forçar "Z" o navegador os
 * interpreta como horário local, o que deslocava os gatilhos em 3 horas.
 */
export function parseUtcDate(value: string | null | undefined): Date {
  const raw = (value ?? "").trim();
  if (!raw) return new Date(NaN);
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
  return new Date(hasTz ? raw : `${raw.replace(" ", "T")}Z`);
}
