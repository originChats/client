import { signal, computed } from "@preact/signals";

type ChannelKey = `${string}:${string}`;

class UnreadState {
  private readonly _pings = signal<Record<ChannelKey, number>>({});
  private readonly _unreads = signal<Record<ChannelKey, number>>({});

  readonly pings = this._pings;
  readonly unreads = this._unreads;

  private key(serverUrl: string, channel: string): ChannelKey {
    return `${serverUrl}:${channel}`;
  }

  private threadKey(serverUrl: string, threadId: string): ChannelKey {
    return `${serverUrl}:thread:${threadId}`;
  }

  private matchesPrefix(key: ChannelKey, prefix: string): boolean {
    return key.startsWith(prefix);
  }

  getChannel(
    serverUrl: string,
    channel: string,
  ): { pings: number; unreads: number } {
    const k = this.key(serverUrl, channel);
    return {
      pings: this._pings.value[k] || 0,
      unreads: this._unreads.value[k] || 0,
    };
  }

  getChannelPing(serverUrl: string, channel: string): number {
    return this._pings.value[this.key(serverUrl, channel)] || 0;
  }

  getChannelUnread(serverUrl: string, channel: string): number {
    return this._unreads.value[this.key(serverUrl, channel)] || 0;
  }

  getServerPing(serverUrl: string): number {
    const prefix = `${serverUrl}:`;
    return Object.entries(this._pings.value)
      .filter(([key]) => this.matchesPrefix(key as ChannelKey, prefix))
      .reduce((sum, [, count]) => sum + count, 0);
  }

  getServerUnread(serverUrl: string): number {
    const prefix = `${serverUrl}:`;
    return Object.entries(this._unreads.value)
      .filter(([key]) => this.matchesPrefix(key as ChannelKey, prefix))
      .reduce((sum, [, count]) => sum + count, 0);
  }

  getServerTotals(serverUrl: string): { pings: number; unreads: number } {
    return {
      pings: this.getServerPing(serverUrl),
      unreads: this.getServerUnread(serverUrl),
    };
  }

  getTotalPings(): number {
    return Object.values(this._pings.value).reduce((sum, n) => sum + n, 0);
  }

  getTotalUnreads(): number {
    return Object.values(this._unreads.value).reduce((sum, n) => sum + n, 0);
  }

  hasUnreads(serverUrl: string, channel: string): boolean {
    const k = this.key(serverUrl, channel);
    return (this._pings.value[k] || 0) > 0 || (this._unreads.value[k] || 0) > 0;
  }

  hasServerUnreads(serverUrl: string): boolean {
    const prefix = `${serverUrl}:`;
    for (const key of Object.keys(this._pings.value)) {
      if (
        this.matchesPrefix(key as ChannelKey, prefix) &&
        this._pings.value[key as ChannelKey] > 0
      )
        return true;
    }
    for (const key of Object.keys(this._unreads.value)) {
      if (
        this.matchesPrefix(key as ChannelKey, prefix) &&
        this._unreads.value[key as ChannelKey] > 0
      )
        return true;
    }
    return false;
  }

  increment(serverUrl: string, channel: string, isPing: boolean): void {
    const k = this.key(serverUrl, channel);
    const target = isPing ? this._pings : this._unreads;
    target.value = { ...target.value, [k]: (target.value[k] || 0) + 1 };
  }

  incrementPing(serverUrl: string, channel: string): void {
    this.increment(serverUrl, channel, true);
  }

  incrementUnread(serverUrl: string, channel: string): void {
    this.increment(serverUrl, channel, false);
  }

  setPing(serverUrl: string, channel: string, count: number): void {
    const k = this.key(serverUrl, channel);
    if (count > 0) {
      this._pings.value = { ...this._pings.value, [k]: count };
    } else {
      this._clearKeyValue(k);
    }
  }

  setUnread(serverUrl: string, channel: string, count: number): void {
    const k = this.key(serverUrl, channel);
    if (count > 0) {
      this._unreads.value = { ...this._unreads.value, [k]: count };
    } else {
      this._clearKeyValue(k);
    }
  }

  addPing(serverUrl: string, channel: string, delta: number): void {
    const k = this.key(serverUrl, channel);
    const current = this._pings.value[k] || 0;
    const newCount = current + delta;
    if (newCount > 0) {
      this._pings.value = { ...this._pings.value, [k]: newCount };
    } else {
      this._clearKeyValue(k);
    }
  }

  clearChannel(serverUrl: string, channel: string): void {
    const k = this.key(serverUrl, channel);
    this._clearKeyValue(k);
  }

  clearThread(serverUrl: string, threadId: string): void {
    const k = this.threadKey(serverUrl, threadId);
    this._clearKeyValue(k);
  }

  clearServer(serverUrl: string): void {
    const prefix = `${serverUrl}:`;
    this._pings.value = this._filterByPrefix(this._pings.value, prefix, true);
    this._unreads.value = this._filterByPrefix(
      this._unreads.value,
      prefix,
      true,
    );
  }

  clearAll(): void {
    this._pings.value = {};
    this._unreads.value = {};
  }

  private _clearKeyValue(k: ChannelKey): void {
    if (this._pings.value[k] !== undefined) {
      const next = { ...this._pings.value };
      delete next[k];
      this._pings.value = next;
    }
    if (this._unreads.value[k] !== undefined) {
      const next = { ...this._unreads.value };
      delete next[k];
      this._unreads.value = next;
    }
  }

  private _filterByPrefix(
    obj: Record<ChannelKey, number>,
    prefix: string,
    exclude: boolean,
  ): Record<ChannelKey, number> {
    return Object.fromEntries(
      Object.entries(obj).filter(([key]) =>
        exclude
          ? !this.matchesPrefix(key as ChannelKey, prefix)
          : this.matchesPrefix(key as ChannelKey, prefix),
      ),
    ) as Record<ChannelKey, number>;
  }
}

const unreadState = new UnreadState();

const totalPings = computed(() => unreadState.getTotalPings());
const totalUnreads = computed(() => unreadState.getTotalUnreads());

export { unreadState };
