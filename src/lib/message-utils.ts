import { renderMessagesSignal } from "./ui-signals";
import { messagesByServer } from "../state";

type MessageKeyInput = { thread_id?: string; channel: string };

const MAX_MESSAGES_PER_CHANNEL = 100;

function trimMessages(messages: any[]): any[] {
  if (messages.length <= MAX_MESSAGES_PER_CHANNEL) return messages;
  return messages.slice(-MAX_MESSAGES_PER_CHANNEL);
}

export function getMessageKey(msg: MessageKeyInput): string {
  return msg.thread_id || msg.channel;
}

export function truncateForNotification(
  content: string,
  maxLength = 100,
): string {
  const clean = (content || "").replace(/<[^>]*>/g, "");
  return clean.length > maxLength
    ? clean.substring(0, maxLength) + "..."
    : clean;
}

function ensureServerState(sUrl: string): void {
  if (!messagesByServer.value[sUrl]) {
    messagesByServer.value = { ...messagesByServer.value, [sUrl]: {} };
  }
}

function appendMessage(serverUrl: string, key: string, message: any): void {
  ensureServerState(serverUrl);
  const existing = messagesByServer.value[serverUrl][key] || [];
  if (existing.some((m) => m.id === message.id)) return;
  messagesByServer.value = {
    ...messagesByServer.value,
    [serverUrl]: {
      ...messagesByServer.value[serverUrl],
      [key]: trimMessages([...existing, message]),
    },
  };
  renderMessagesSignal.value++;
}

function prependMessages(
  serverUrl: string,
  key: string,
  messages: any[],
): void {
  ensureServerState(serverUrl);
  const existing = messagesByServer.value[serverUrl][key] || [];
  const existingIds = new Set(existing.map((m) => m.id));
  const newOnes = messages.filter((m) => !existingIds.has(m.id));
  messagesByServer.value = {
    ...messagesByServer.value,
    [serverUrl]: {
      ...messagesByServer.value[serverUrl],
      [key]: trimMessages([...newOnes, ...existing]),
    },
  };
  renderMessagesSignal.value++;
}

export function updateMessage(
  serverUrl: string,
  key: string,
  messageId: string,
  update: any,
): void {
  const messages = messagesByServer.value[serverUrl]?.[key];
  if (!messages) return;
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return;
  const updated = [...messages];
  updated[idx] = { ...updated[idx], ...update };
  messagesByServer.value = {
    ...messagesByServer.value,
    [serverUrl]: { ...messagesByServer.value[serverUrl], [key]: updated },
  };
  renderMessagesSignal.value++;
}

export function removeMessage(
  serverUrl: string,
  key: string,
  messageId: string,
): void {
  const messages = messagesByServer.value[serverUrl]?.[key];
  if (!messages) return;
  messagesByServer.value = {
    ...messagesByServer.value,
    [serverUrl]: {
      ...messagesByServer.value[serverUrl],
      [key]: messages.filter((m) => m.id !== messageId),
    },
  };
  renderMessagesSignal.value++;
}

export function setMessages(
  serverUrl: string,
  key: string,
  messages: any[],
): void {
  ensureServerState(serverUrl);
  const trimmed = trimMessages(messages);
  messagesByServer.value = {
    ...messagesByServer.value,
    [serverUrl]: { ...messagesByServer.value[serverUrl], [key]: trimmed },
  };
  renderMessagesSignal.value++;
}

export function insertMessage(
  serverUrl: string,
  key: string,
  message: any,
): void {
  ensureServerState(serverUrl);
  const messages = messagesByServer.value[serverUrl][key] || [];
  if (messages.some((m) => m.id === message.id)) return;
  const insertIdx = messages.findIndex((m) => m.timestamp > message.timestamp);
  const newMessages =
    insertIdx === -1
      ? [...messages, message]
      : [
          ...messages.slice(0, insertIdx),
          message,
          ...messages.slice(insertIdx),
        ];
  const trimmed = trimMessages(newMessages);
  messagesByServer.value = {
    ...messagesByServer.value,
    [serverUrl]: { ...messagesByServer.value[serverUrl], [key]: trimmed },
  };
  renderMessagesSignal.value++;
}

export function mergeAndSortMessages(existing: any[], incoming: any[]): any[] {
  const all = [...existing, ...incoming];
  const uniqueMap = new Map(all.map((m) => [m.id, m]));
  return Array.from(uniqueMap.values()).sort(
    (a, b) => a.timestamp - b.timestamp,
  );
}
