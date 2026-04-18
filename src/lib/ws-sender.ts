import { serverUrl, wsConnections, serverCapabilitiesByServer } from "../state";

const pendingMessageFetchesByServer: Record<string, Record<string, boolean>> = {};

export function wsSend(data: any, sUrl?: string): boolean {
  const url = sUrl || serverUrl.value;
  const conn = wsConnections[url];
  if (conn && conn.socket && conn.socket.readyState === WebSocket.OPEN) {
    conn.socket.send(JSON.stringify(data));
    return true;
  }
  return false;
}

export function finishMessageFetch(sUrl: string, channelName: string): void {
  if (pendingMessageFetchesByServer[sUrl]) {
    delete pendingMessageFetchesByServer[sUrl][channelName];
  }
}

export function startMessageFetch(sUrl: string, channelName: string): void {
  if (!pendingMessageFetchesByServer[sUrl]) {
    pendingMessageFetchesByServer[sUrl] = {};
  }
  pendingMessageFetchesByServer[sUrl][channelName] = true;
}

let audioCtx: AudioContext | null = null;

export function cleanupWsSenderAudio(): void {
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close();
    audioCtx = null;
  }
}

function markChannelOrThreadAsRead(
  channelName?: string,
  threadId?: string,
  messageId?: string,
  sUrl?: string
): boolean {
  const url = sUrl || serverUrl.value;
  const caps = serverCapabilitiesByServer.read(url) || [];

  // Only send unreads_ack if server supports it
  if (!caps.includes("unreads_ack")) {
    return false;
  }

  const payload: any = {
    cmd: "unreads_ack",
    channel: channelName,
    thread_id: threadId,
  };
  if (messageId) {
    payload.message_id = messageId;
  }
  return wsSend(payload, sUrl);
}

export function markChannelAsRead(channelName: string, messageId?: string, sUrl?: string): boolean {
  return markChannelOrThreadAsRead(channelName, undefined, messageId, sUrl);
}

export function markThreadAsRead(threadId: string, messageId?: string, sUrl?: string): boolean {
  return markChannelOrThreadAsRead(undefined, threadId, messageId, sUrl);
}

function getUnreadCount(channelName: string, sUrl?: string): boolean {
  const url = sUrl || serverUrl.value;
  const caps = serverCapabilitiesByServer.read(url) || [];

  if (!caps.includes("unreads_count")) {
    return false;
  }

  return wsSend({ cmd: "unreads_count", channel: channelName }, sUrl);
}

function getThreadUnreadCount(threadId: string, sUrl?: string): boolean {
  const url = sUrl || serverUrl.value;
  const caps = serverCapabilitiesByServer.read(url) || [];

  if (!caps.includes("unreads_count")) {
    return false;
  }

  return wsSend({ cmd: "unreads_count", thread_id: threadId }, sUrl);
}

function getAllUnreads(sUrl?: string): boolean {
  const url = sUrl || serverUrl.value;
  const caps = serverCapabilitiesByServer.read(url) || [];

  if (!caps.includes("unreads_get")) {
    return false;
  }

  return wsSend({ cmd: "unreads_get" }, sUrl);
}
