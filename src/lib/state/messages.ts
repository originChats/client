import { signal } from "@preact/signals";
import type { Message } from "../../types";

type ServerUrl = string;
type ChannelKey = string;

const MAX_MESSAGES = 100;

const _byServer = signal<Record<ServerUrl, Record<ChannelKey, Message[]>>>({});
const _version = signal(0);

function trim(arr: Message[]): Message[] {
  return arr.length > MAX_MESSAGES ? arr.slice(-MAX_MESSAGES) : arr;
}

class MessageStore {
  private key(url: ServerUrl, channel: ChannelKey): string {
    return `${url}::${channel}`;
  }

  private getServerMessages(url: ServerUrl): Record<ChannelKey, Message[]> {
    return _byServer.value[url] || {};
  }

  private getChannelMessages(url: ServerUrl, channel: ChannelKey): Message[] {
    return this.getServerMessages(url)[channel] || [];
  }

  private sync() {
    _version.value++;
  }

  get(url: ServerUrl, channel: ChannelKey): Message[] {
    return this.getChannelMessages(url, channel);
  }

  getMostRecent(url: ServerUrl, channel: ChannelKey): Message | null {
    const msgs = this.getChannelMessages(url, channel);
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  }

  append(url: ServerUrl, channel: ChannelKey, msg: Message): void {
    const serverMsgs = this.getServerMessages(url);
    const existing = serverMsgs[channel] || [];
    if (existing.some((m) => m.id === msg.id)) return;

    _byServer.value = {
      ..._byServer.value,
      [url]: {
        ...serverMsgs,
        [channel]: trim([...existing, msg]),
      },
    };
  }

  prepend(url: ServerUrl, channel: ChannelKey, msgs: Message[]): void {
    const serverMsgs = this.getServerMessages(url);
    const existing = serverMsgs[channel] || [];
    const existingIds = new Set(existing.map((m) => m.id));
    const newOnes = msgs.filter((m) => !existingIds.has(m.id));

    _byServer.value = {
      ..._byServer.value,
      [url]: {
        ...serverMsgs,
        [channel]: trim([...newOnes, ...existing]),
      },
    };
  }

  set(url: ServerUrl, channel: ChannelKey, msgs: Message[]): void {
    const serverMsgs = this.getServerMessages(url);
    _byServer.value = {
      ..._byServer.value,
      [url]: {
        ...serverMsgs,
        [channel]: trim(msgs),
      },
    };
  }

  update(
    url: ServerUrl,
    channel: ChannelKey,
    id: string,
    patch: Partial<Message>,
  ): boolean {
    const serverMsgs = this.getServerMessages(url);
    const arr = serverMsgs[channel];
    if (!arr) return false;
    const idx = arr.findIndex((m) => m.id === id);
    if (idx === -1) return false;

    const updated = [...arr];
    updated[idx] = { ...updated[idx], ...patch };
    _byServer.value = {
      ..._byServer.value,
      [url]: { ...serverMsgs, [channel]: updated },
    };
    return true;
  }

  delete(url: ServerUrl, channel: ChannelKey, id: string): boolean {
    const serverMsgs = this.getServerMessages(url);
    const arr = serverMsgs[channel];
    if (!arr) return false;
    const filtered = arr.filter((m) => m.id !== id);
    if (filtered.length === arr.length) return false;

    _byServer.value = {
      ..._byServer.value,
      [url]: { ...serverMsgs, [channel]: filtered },
    };
    return true;
  }

  clear(url: ServerUrl, channel?: ChannelKey): void {
    if (channel) {
      const serverMsgs = this.getServerMessages(url);
      const { [channel]: _, ...rest } = serverMsgs;
      _byServer.value = { ..._byServer.value, [url]: rest };
    } else {
      const { [url]: _, ...rest } = _byServer.value;
      _byServer.value = rest;
    }
  }

  clearAll(): void {
    _byServer.value = {};
  }

  setCurrentChannel(_url: ServerUrl | null, _channel: ChannelKey | null): void {
    // No-op - memory managed by MAX_MESSAGES limit
  }

  get byServer() {
    return _byServer;
  }
  get version() {
    return _version.value;
  }
  readonly versionSignal = _version;
}

export const messages = new MessageStore();

function useMessages(url: ServerUrl, channel: ChannelKey) {
  const v = messages.versionSignal.value;
  return { messages: messages.get(url, channel), version: v };
}

export { _byServer as messagesByServer };
