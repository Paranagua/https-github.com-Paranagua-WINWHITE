import { useSyncExternalStore } from "react";

const STORAGE_KEY = "freitas_white_vip_status";

let isVip =
  typeof window !== "undefined"
    ? localStorage.getItem(STORAGE_KEY) === null || localStorage.getItem(STORAGE_KEY) === "true"
    : true;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return isVip;
}

export function setVipStatus(status: boolean) {
  if (status === isVip) return;
  isVip = status;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, String(status));
  }
  listeners.forEach((l) => l());
}

export function useVipStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
