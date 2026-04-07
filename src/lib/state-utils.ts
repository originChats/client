import type { Signal } from "@preact/signals";

type ByServerSignal<T> = Signal<Record<string, T>>;

function updateByServer<T>(
  signal: ByServerSignal<T>,
  sUrl: string,
  value: T,
): void {
  signal.value = { ...signal.value, [sUrl]: value };
}

function updateByServerNested<T, K extends keyof T>(
  signal: ByServerSignal<Record<string, T>>,
  sUrl: string,
  key: string,
  updates: Partial<T[K]>,
): void {
  const existing = signal.value[sUrl]?.[key];
  if (!existing) return;
  signal.value = {
    ...signal.value,
    [sUrl]: {
      ...signal.value[sUrl],
      [key]: { ...existing, ...updates },
    },
  };
}

function ensureServerState<T>(
  signal: ByServerSignal<T>,
  sUrl: string,
  defaultValue: T,
): void {
  if (!signal.value[sUrl]) {
    signal.value = { ...signal.value, [sUrl]: defaultValue };
  }
}

export function normalizeUsername(username: string | undefined): string {
  return (username || "").toLowerCase();
}
