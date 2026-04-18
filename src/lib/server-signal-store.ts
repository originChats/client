import { signal, type Signal } from "@preact/signals";

export class ServerSignalStore<T> {
  private _signals = new Map<string, Signal<T>>();
  private _defaults: () => T;
  private _onCreate?: (sUrl: string, sig: Signal<T>) => void;

  constructor(defaults: () => T, onCreate?: (sUrl: string, sig: Signal<T>) => void) {
    this._defaults = defaults;
    this._onCreate = onCreate;
  }

  get(sUrl: string): Signal<T> {
    let _signal = this._signals.get(sUrl);
    if (!_signal) {
      _signal = signal(this._defaults());
      this._signals.set(sUrl, _signal);
      this._onCreate?.(sUrl, _signal);
    }
    return _signal;
  }

  read(sUrl: string): T {
    return this.get(sUrl).value;
  }

  set(sUrl: string, value: T): void {
    const sig = this.get(sUrl);
    sig.value = value;
  }

  update(sUrl: string, fn: (current: T) => T): void {
    const sig = this.get(sUrl);
    sig.value = fn(sig.value);
  }

  delete(sUrl: string): void {
    this._signals.delete(sUrl);
  }

  keys(): string[] {
    return [...this._signals.keys()];
  }

  has(sUrl: string): boolean {
    return this._signals.has(sUrl);
  }

  subscribe(sUrl: string, callback: (value: T) => void): () => void {
    const sig = this.get(sUrl);
    return sig.subscribe(callback);
  }

  entries(): IterableIterator<[string, Signal<T>]> {
    return this._signals.entries();
  }

  get size(): number {
    return this._signals.size;
  }
}
