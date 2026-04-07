import { signal, computed } from "@preact/signals";
import type { Message } from "../../types";

type ServerUrl = string;
type ChannelName = string;
type MessageKey = string;
type MessagesMap = Record<ServerUrl, Record<MessageKey, Message[]>>;

const MAX_MESSAGES_PER_CHANNEL = 150;

function trimMessages(messages: Message[]): Message[] {
  if (messages.length <= MAX_MESSAGES_PER_CHANNEL) return messages;
  return messages.slice(-MAX_MESSAGES_PER_CHANNEL);
}

class MessageState {
  readonly byServer = signal<MessagesMap>({});
  readonly loaded = new Map<ServerUrl, Set<MessageKey>>();
  readonly reachedOldest = new Map<ServerUrl, Set<MessageKey>>();

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
    this.ensureServerMessages(serverUrl);
    this.byServer.value = {
      ...this.byServer.value,
      [serverUrl]: {
        ...this.byServer.value[serverUrl],
        [key]: messages,
      },
    };
  }

  appendMessage(serverUrl: ServerUrl, key: MessageKey, message: Message): void {
    const existing = this.getMessages(serverUrl, key);
    if (existing.some((m) => m.id === message.id)) return;
    this.setMessages(serverUrl, key, trimMessages([...existing, message]));
  }

  prependMessages(
    serverUrl: ServerUrl,
    key: MessageKey,
    messages: Message[],
  ): void {
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
    const messages = this.getMessages(serverUrl, key);
    this.setMessages(
      serverUrl,
      key,
      messages.filter((m) => m.id !== messageId),
    );
  }

  insertMessage(serverUrl: ServerUrl, key: MessageKey, message: Message): void {
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
