import { useSyncExternalStore } from "react";
import defaultAvatar from "@/assets/avatar-blaze.png.asset.json";

const STORAGE_KEY = "freitas_white_avatar";

export const DEFAULT_AVATAR = defaultAvatar.url;

let avatar: string =
  (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) || DEFAULT_AVATAR;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return avatar;
}

export function setAvatar(dataUrl: string) {
  avatar = dataUrl;
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, dataUrl);
  listeners.forEach((l) => l());
}

export function resetAvatar() {
  avatar = DEFAULT_AVATAR;
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((l) => l());
}

export function useAvatar() {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_AVATAR);
}
