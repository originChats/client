import { signal } from "@preact/signals";
import type { Message } from "../../types";

type ServerUrl = string;
type ChannelKey = string;
type PendingKey = string;

interface PendingMessage extends Message {
  _pending: boolean;
  _pendingKey: string;
}

const _pendingByServer = signal<Record<ServerUrl, Record<ChannelKey, PendingMessage[]>>>({});
const _version = signal(0);

let pendingNonce = 0;

function generatePendingKey(content: string, user: string): string {
  return `${user}:${Date.now()}:${++pendingNonce}:${content.length}`;
}

const PENDING_TIMEOUT_MS = 30000;

class PendingMessageStore {
  private timeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  private getServerMessages(url: ServerUrl): Record<ChannelKey, PendingMessage[]> {
    return _pendingByServer.value[url] || {};
  }

  private getChannelMessages(url: ServerUrl, channel: ChannelKey): PendingMessage[] {
    return this.getServerMessages(url)[channel] || [];
  }

  private sync() {
    _version.value++;
  }

  add(url: ServerUrl, channel: ChannelKey, msg: Message): string {
    const pendingKey = generatePendingKey(msg.content, msg.user);
    const pendingMsg: PendingMessage = {
      ...msg,
      _pending: true,
      _pendingKey: pendingKey,
    };

    const serverMsgs = this.getServerMessages(url);
    const existing = serverMsgs[channel] || [];

    _pendingByServer.value = {
      ..._pendingByServer.value,
      [url]: {
        ...serverMsgs,
        [channel]: [...existing, pendingMsg],
      },
    };

    const timeoutKey = `${url}:${channel}:${pendingKey}`;
    const timeoutId = setTimeout(() => {
      this.removeByPendingKey(url, channel, pendingKey);
      this.timeouts.delete(timeoutKey);
    }, PENDING_TIMEOUT_MS);
    this.timeouts.set(timeoutKey, timeoutId);

    this.sync();
    return pendingKey;
  }

  removeByPendingKey(url: ServerUrl, channel: ChannelKey, pendingKey: string): boolean {
    const serverMsgs = this.getServerMessages(url);
    const arr = serverMsgs[channel];
    if (!arr) return false;

    const msgToRemove = arr.find((m) => m._pendingKey === pendingKey);
    if (!msgToRemove) return false;

    const timeoutKey = `${url}:${channel}:${pendingKey}`;
    const timeoutId = this.timeouts.get(timeoutKey);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeouts.delete(timeoutKey);
    }

    const filtered = arr.filter((m) => m._pendingKey !== pendingKey);
    if (filtered.length === arr.length) return false;

    _pendingByServer.value = {
      ..._pendingByServer.value,
      [url]: {
        ...serverMsgs,
        [channel]: filtered,
      },
    };

    this.sync();
    return true;
  }

  removeByKey(url: ServerUrl, channel: ChannelKey, content: string, user: string): boolean {
    const serverMsgs = this.getServerMessages(url);
    const arr = serverMsgs[channel];
    if (!arr) return false;

    const msgToRemove = arr.find((m) => m.user === user && m.content === content);
    if (!msgToRemove) return false;

    return this.removeByPendingKey(url, channel, msgToRemove._pendingKey);
  }

  confirmByKey(
    url: ServerUrl,
    channel: ChannelKey,
    content: string,
    user: string,
    _realId?: string
  ): boolean {
    return this.removeByKey(url, channel, content, user);
  }

  get(url: ServerUrl, channel: ChannelKey): PendingMessage[] {
    return this.getChannelMessages(url, channel);
  }

  clear(url: ServerUrl, channel?: ChannelKey): void {
    if (channel) {
      const serverMsgs = this.getServerMessages(url);
      const { [channel]: _, ...rest } = serverMsgs;
      _pendingByServer.value = { ..._pendingByServer.value, [url]: rest };
    } else {
      const { [url]: _, ...rest } = _pendingByServer.value;
      _pendingByServer.value = rest;
    }
    this.sync();
  }

  get version() {
    return _version.value;
  }

  readonly versionSignal = _version;
}

export const pendingMessages = new PendingMessageStore();
