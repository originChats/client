import { effect } from "@preact/signals";
import { settings as dbSettings } from "./db";

let _settingsLoaded = false;

export function markSettingsLoaded(): void {
  _settingsLoaded = true;
}

function persistSignal<T>(
  key: string,
  getValue: () => T,
  serialize: (v: T) => string | undefined = (v) => String(v),
  apply?: (v: T) => void
): void {
  effect(() => {
    const v = getValue();
    if (_settingsLoaded) {
      const serialized = serialize(v);
      if (serialized !== undefined) {
        dbSettings.set(key, serialized);
      } else {
        dbSettings.del(key);
      }
    }
    apply?.(v);
  });
}

export function persistSimpleSignal<T>(
  key: string,
  getValue: () => T,
  apply?: (v: T) => void
): void {
  persistSignal(key, getValue, (v) => String(v), apply);
}

export function persistJsonSignal<T>(key: string, getValue: () => T, apply?: (v: T) => void): void {
  persistSignal(key, getValue, (v) => JSON.stringify(v) as string, apply);
}

export function persistNullableSignal<T>(
  key: string,
  getValue: () => T | null | undefined,
  serialize: (v: T) => string = (v) => String(v),
  apply?: (v: T | null | undefined) => void
): void {
  effect(() => {
    const v = getValue();
    if (_settingsLoaded) {
      if (v == null) {
        dbSettings.del(key);
      } else {
        dbSettings.set(key, serialize(v));
      }
    }
    apply?.(v);
  });
}
