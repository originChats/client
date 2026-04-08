import { signal, computed } from "@preact/signals";
import type { Message } from "../../types";

type ServerUrl = string;
type ChannelName = string;
type MessageKey = string;
type MessagesMap = Record<ServerUrl, Record<MessageKey, Message[]>>;

const MAX_MESSAGES_PER_CHANNEL = 100;

let currentServerUrl: ServerUrl | null = null;
let currentMessageKey: MessageKey | null = null;

function trimMessages(messages: Message[]): Message[] {
  if (messages.length <= MAX_MESSAGES_PER_CHANNEL) return messages;
  return messages.slice(-MAX_MESSAGES_PER_CHANNEL);
}

function shouldStoreMessages(sUrl: ServerUrl, key: MessageKey): boolean {
  return sUrl === currentServerUrl && key === currentMessageKey;
}

class MessageState {
  readonly byServer = signal<MessagesMap>({});
  readonly loaded = new Map<ServerUrl, Set<MessageKey>>();
  readonly reachedOldest = new Map<ServerUrl, Set<MessageKey>>();

  setCurrentChannel(sUrl: ServerUrl | null, key: MessageKey | null): void {
    currentServerUrl = sUrl;
    currentMessageKey = key;
    if (sUrl && key) {
      this.clearOtherChannels(sUrl, key);
    }
  }

  private clearOtherChannels(keepServer: ServerUrl, keepKey: MessageKey): void {
    const current = this.byServer.value;
    const newMap: MessagesMap = {};

    if (current[keepServer]) {
      newMap[keepServer] = {};
      if (current[keepServer][keepKey]) {
        newMap[keepServer][keepKey] = current[keepServer][keepKey];
      }
    }

    if (Object.keys(newMap).length === 0 && Object.keys(current).length === 0) {
      return;
    }

    const hasChanges = Object.keys(current).some((sUrl) => {
      if (sUrl !== keepServer) return true;
      return Object.keys(current[sUrl] || {}).some((k) => k !== keepKey);
    });

    if (hasChanges) {
      this.byServer.value = newMap;
      if (this.loaded.has(keepServer)) {
        const keepSet = new Set<string>();
        if (this.loaded.get(keepServer)?.has(keepKey)) {
          keepSet.add(keepKey);
        }
        this.loaded.set(keepServer, keepSet);
      }
      if (this.reachedOldest.has(keepServer)) {
        const keepSet = new Set<string>();
        if (this.reachedOldest.get(keepServer)?.has(keepKey)) {
          keepSet.add(keepKey);
        }
        this.reachedOldest.set(keepServer, keepSet);
      }
    }
  }

  private ensureServerMessages(
    serverUrl: ServerUrl,
  ): Record<MessageKey, Message[]> {
    if (!this.byServer.value[serverUrl]) {
      this.byServer.value = { ...this.byServer.value, [serverUrl]: {} };
    }
    return this.byServer.value[serverUrl];
  }

  private ensureLoadedSet(serverUrl: ServerUrl): Set<MessageKey> {
    if (!this.loaded.has(serverUrl)) {
      this.loaded.set(serverUrl, new Set());
    }
    return this.loaded.get(serverUrl)!;
  }

  private ensureOldestSet(serverUrl: ServerUrl): Set<MessageKey> {
    if (!this.reachedOldest.has(serverUrl)) {
      this.reachedOldest.set(serverUrl, new Set());
    }
    return this.reachedOldest.get(serverUrl)!;
  }

  isLoaded(serverUrl: ServerUrl, key: MessageKey): boolean {
    return this.loaded.get(serverUrl)?.has(key) ?? false;
  }

  hasReachedOldest(serverUrl: ServerUrl, key: MessageKey): boolean {
    return this.reachedOldest.get(serverUrl)?.has(key) ?? false;
  }

  markLoaded(serverUrl: ServerUrl, key: MessageKey): void {
    this.ensureLoadedSet(serverUrl).add(key);
  }

  markReachedOldest(serverUrl: ServerUrl, key: MessageKey): void {
    this.ensureOldestSet(serverUrl).add(key);
  }

  getMessages(serverUrl: ServerUrl, key: MessageKey): Message[] {
    return this.byServer.value[serverUrl]?.[key] || [];
  }

  setMessages(
    serverUrl: ServerUrl,
    key: MessageKey,
    messages: Message[],
  ): void {
    if (!shouldStoreMessages(serverUrl, key)) return;
    this.ensureServerMessages(serverUrl);
    this.byServer.value = {
      ...this.byServer.value,
      [serverUrl]: {
        ...this.byServer.value[serverUrl],
        [key]: trimMessages(messages),
      },
    };
  }

  appendMessage(serverUrl: ServerUrl, key: MessageKey, message: Message): void {
    if (!shouldStoreMessages(serverUrl, key)) return;
    const existing = this.getMessages(serverUrl, key);
    if (existing.some((m) => m.id === message.id)) return;
    this.setMessages(serverUrl, key, trimMessages([...existing, message]));
  }

  prependMessages(
    serverUrl: ServerUrl,
    key: MessageKey,
    messages: Message[],
  ): void {
    if (!shouldStoreMessages(serverUrl, key)) return;
    const existing = this.getMessages(serverUrl, key);
    const existingIds = new Set(existing.map((m) => m.id));
    const newOnes = messages.filter((m) => !existingIds.has(m.id));
    this.setMessages(serverUrl, key, trimMessages([...newOnes, ...existing]));
  }

  updateMessage(
    serverUrl: ServerUrl,
    key: MessageKey,
    messageId: string,
    update: Partial<Message>,
  ): void {
    if (!shouldStoreMessages(serverUrl, key)) return;
    const messages = this.getMessages(serverUrl, key);
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const updated = [...messages];
    updated[idx] = { ...updated[idx], ...update };
    this.setMessages(serverUrl, key, updated);
  }

  removeMessage(
    serverUrl: ServerUrl,
    key: MessageKey,
    messageId: string,
  ): void {
    if (!shouldStoreMessages(serverUrl, key)) return;
    const messages = this.getMessages(serverUrl, key);
    this.setMessages(
      serverUrl,
      key,
      messages.filter((m) => m.id !== messageId),
    );
  }

  insertMessage(serverUrl: ServerUrl, key: MessageKey, message: Message): void {
    if (!shouldStoreMessages(serverUrl, key)) return;
    const messages = this.getMessages(serverUrl, key);
    if (messages.some((m) => m.id === message.id)) return;
    const insertIdx = messages.findIndex(
      (m) => m.timestamp > message.timestamp,
    );
    const newMessages =
      insertIdx === -1
        ? [...messages, message]
        : [
            ...messages.slice(0, insertIdx),
            message,
            ...messages.slice(insertIdx),
          ];
    this.setMessages(serverUrl, key, trimMessages(newMessages));
  }

  clearServer(serverUrl: ServerUrl): void {
    if (this.byServer.value[serverUrl]) {
      const next = { ...this.byServer.value };
      delete next[serverUrl];
      this.byServer.value = next;
    }
    this.loaded.delete(serverUrl);
    this.reachedOldest.delete(serverUrl);
  }

  clearAll(): void {
    this.byServer.value = {};
    this.loaded.clear();
    this.reachedOldest.clear();
  }
}

export const messageState = new MessageState();
