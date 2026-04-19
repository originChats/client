import { signal, computed } from "@preact/signals";
import { pings as db } from "../db";

type Key = string;

let loaded = false;

function persist(pings: Record<Key, number>, unreads: Record<Key, number>) {
  if (!loaded) return;
  db.set({ pings, unreads }).catch((e) => console.error("Persist failed:", e));
}

class UnreadStore {
  private _pings = signal<Record<Key, number>>({});
  private _unreads = signal<Record<Key, number>>({});
  private _lastRead = signal<Record<Key, string>>({});
  private _timer: ReturnType<typeof setTimeout> | null = null;

  readonly pings = this._pings;
  readonly unreads = this._unreads;

  constructor() {
    db.get()
      .then((data) => {
        if (data) {
          this._pings.value = data.pings || {};
          this._unreads.value = data.unreads || {};
        }
        loaded = true;
      })
      .catch((e) => console.error("Load failed:", e));
  }

  private key(url: string, channel: string): Key {
    return `${url}:${channel}`;
  }

  private save() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => persist(this._pings.value, this._unreads.value), 500);
  }

  get(url: string, channel: string) {
    const k = this.key(url, channel);
    return {
      pings: this._pings.value[k] || 0,
      unreads: this._unreads.value[k] || 0,
    };
  }

  getPing(url: string, channel: string) {
    return this._pings.value[this.key(url, channel)] || 0;
  }
  getUnread(url: string, channel: string) {
    return this._unreads.value[this.key(url, channel)] || 0;
  }
  getChannelPing(url: string, channel: string) {
    return this.getPing(url, channel);
  }
  getChannelUnread(url: string, channel: string) {
    return this.getUnread(url, channel);
  }

  getServerPing(url: string) {
    const prefix = `${url}:`;
    return Object.entries(this._pings.value)
      .filter(([k]) => k.startsWith(prefix))
      .reduce((sum, [, n]) => sum + n, 0);
  }

  getServerUnread(url: string) {
    const prefix = `${url}:`;
    return Object.entries(this._unreads.value)
      .filter(([k]) => k.startsWith(prefix))
      .reduce((sum, [, n]) => sum + n, 0);
  }

  getServerTotals(url: string) {
    return {
      pings: this.getServerPing(url),
      unreads: this.getServerUnread(url),
    };
  }
  getTotalPings() {
    return Object.values(this._pings.value).reduce((s, n) => s + n, 0);
  }
  getTotalUnreads() {
    return Object.values(this._unreads.value).reduce((s, n) => s + n, 0);
  }

  has(url: string, channel: string) {
    const k = this.key(url, channel);
    return (this._pings.value[k] || 0) > 0 || (this._unreads.value[k] || 0) > 0;
  }
  hasUnreads(url: string, channel: string) {
    return this.has(url, channel);
  }

  hasServer(url: string) {
    const prefix = `${url}:`;
    return (
      Object.keys(this._pings.value).some(
        (k) => k.startsWith(prefix) && this._pings.value[k] > 0
      ) ||
      Object.keys(this._unreads.value).some(
        (k) => k.startsWith(prefix) && this._unreads.value[k] > 0
      )
    );
  }

  inc(url: string, channel: string, isPing: boolean) {
    const k = this.key(url, channel);
    const target = isPing ? this._pings : this._unreads;
    target.value = { ...target.value, [k]: (target.value[k] || 0) + 1 };
    this.save();
  }
  incPing(url: string, channel: string) {
    this.inc(url, channel, true);
  }
  incUnread(url: string, channel: string) {
    this.inc(url, channel, false);
  }

  set(url: string, channel: string, count: number, isPing: boolean) {
    const k = this.key(url, channel);
    const target = isPing ? this._pings : this._unreads;
    if (count > 0) {
      target.value = { ...target.value, [k]: count };
    } else {
      const next = { ...target.value };
      delete next[k];
      target.value = next;
    }
    this.save();
  }

  clear(url: string, channel: string) {
    const k = this.key(url, channel);
    const pings = { ...this._pings.value };
    const unreads = { ...this._unreads.value };
    delete pings[k];
    delete unreads[k];
    this._pings.value = pings;
    this._unreads.value = unreads;
    this.save();
  }
  clearChannel(url: string, channel: string) {
    this.clear(url, channel);
  }

  clearServer(url: string) {
    const prefix = `${url}:`;
    this._pings.value = Object.fromEntries(
      Object.entries(this._pings.value).filter(([k]) => !k.startsWith(prefix))
    );
    this._unreads.value = Object.fromEntries(
      Object.entries(this._unreads.value).filter(([k]) => !k.startsWith(prefix))
    );
    this.save();
  }

  clearAll() {
    this._pings.value = {};
    this._unreads.value = {};
    this.save();
  }

  clearThread(url: string, threadId: string) {
    const k = `${url}:thread:${threadId}`;
    const pings = { ...this._pings.value };
    const unreads = { ...this._unreads.value };
    delete pings[k];
    delete unreads[k];
    this._pings.value = pings;
    this._unreads.value = unreads;
    this.save();
  }

  setUnread(url: string, channel: string, count: number) {
    this.set(url, channel, count, false);
  }

  incrementPing(url: string, channel: string) {
    this.inc(url, channel, true);
  }
  incrementUnread(url: string, channel: string) {
    this.inc(url, channel, false);
  }

  setLastRead(url: string, channel: string, id: string | null) {
    const k = this.key(url, channel);
    if (id) {
      this._lastRead.value = { ...this._lastRead.value, [k]: id };
    } else {
      const next = { ...this._lastRead.value };
      delete next[k];
      this._lastRead.value = next;
    }
  }

  getLastRead(url: string, channel: string) {
    return this._lastRead.value[this.key(url, channel)] || null;
  }

  isUnreadByLastMessage(url: string, channel: string, lastId?: string) {
    if (!lastId) return false;
    const lastRead = this.getLastRead(url, channel);
    return lastRead ? lastId !== lastRead : false;
  }
}

export const unreadState = new UnreadStore();
