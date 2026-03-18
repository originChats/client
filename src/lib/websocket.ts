import {
  serverUrl,
  currentChannel,
  currentThread,
  channelsByServer,
  threadsByServer,
  threadMessagesByServer,
  messagesByServer,
  loadedChannelsByServer,
  reachedOldestByServer,
  usersByServer,
  currentUserByServer,
  typingUsersByServer,
  wsConnections,
  wsStatus,
  serverValidatorKeys,
  reconnectAttempts,
  reconnectTimeouts,
  serversAttempted,
  unreadByChannel,
  unreadPings,
  rolesByServer,
  slashCommandsByServer,
  dmServers,
  pingSound,
  pingVolume,
  customPingSound,
  dmMessageSound,
  servers,
  pingsInboxMessages,
  pingsInboxTotal,
  pingsInboxLoading,
  pingsInboxOffset,
  readTimesByServer,
  pendingDMAddUsername,
  setPendingDMAddUsername,
  getChannelNotifLevel,
  offlinePushServers,
  pushSubscriptionsByServer,
  serverCapabilitiesByServer,
  lastChannelByServer,
  SPECIAL_CHANNELS,
  addThreadToChannel,
  removeThreadFromChannel,
  updateThreadInChannel,
  setThreadMessagesForServer,
} from "../state";

import { Channel, VoiceUser, Message, DMServer, Role, Thread } from "../types";

const DM_SERVER_URL = "dms.mistium.com";
import {
  renderGuildSidebarSignal,
  renderChannelsSignal,
  renderMessagesSignal,
  renderMembersSignal,
  showBanner,
  dismissBanner,
  upsertBanner,
} from "./ui-signals";

import { reloadServerIcon } from "../utils";

import { readTimes as dbReadTimes } from "./db";

// ── Reconnect config ──────────────────────────────────────────────────────────
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
const RECONNECT_MAX_ATTEMPTS = 10;

/** Debounce timers for persisting read times to IDB when the user is
 *  actively viewing a channel and new messages arrive. Keyed by
 *  "serverUrl:channelName". Flushed at most once per second per channel. */
const _readTimeFlushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/** Stable banner IDs keyed by server URL so we can upsert them. */
const reconnectBannerIds: Record<string, string> = {};

import { generateValidator as generateValidatorApi } from "./rotur-api";
import {
  MessageDelete,
  MessageEdit,
  MessageGet,
  MessageNew,
  MessagePin,
  MessagesGet,
  Typing,
  UserConnect,
  UserDisconnect,
} from "@/msgTypes";

let audioCtx: AudioContext | null = null;

// Helper: get the message key (thread_id or channel) for storing/finding messages
function getMessageKey(msg: { thread_id?: string; channel: string }): string {
  return msg.thread_id || msg.channel;
}

// Helper: immutably update voice_state for a channel in channelsByServer
function _vcUpdateChannelState(
  sUrl: string,
  channelName: string,
  updater: (prev: VoiceUser[]) => VoiceUser[],
): void {
  const chList = channelsByServer.value[sUrl];
  if (!chList) return;
  const idx = chList.findIndex((c: Channel) => c.name === channelName);
  if (idx === -1) return;
  const prev: VoiceUser[] = (chList[idx] as Channel).voice_state || [];
  const next = updater(prev);
  const updatedList = [...chList];
  updatedList[idx] = { ...updatedList[idx], voice_state: next };
  channelsByServer.value = { ...channelsByServer.value, [sUrl]: updatedList };
}
function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
  }
  return audioCtx;
}

export function playPingSound(): void {
  if (document.hidden) return;
  const type = pingSound.value;
  if (type === "none") return;
  const volume = pingVolume.value;

  // Play custom MP3 if selected and one is uploaded
  if (type === "custom") {
    const dataUri = customPingSound.value;
    if (!dataUri) return;
    try {
      const audio = new Audio(dataUri);
      audio.volume = volume;
      audio.play().catch(() => {});
    } catch (e) {
      console.warn("[Notification] Failed to play custom ping:", e);
    }
    return;
  }

  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);

    if (type === "default") {
      osc.frequency.value = 800;
      osc.type = "sine";
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "soft") {
      osc.frequency.value = 520;
      osc.type = "sine";
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === "bell") {
      osc.frequency.value = 1200;
      osc.type = "triangle";
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } else if (type === "pop") {
      osc.frequency.value = 600;
      osc.type = "square";
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch (e) {
    console.warn("[Notification] Failed to play ping sound:", e);
  }
}

function showNotification(title: string, body: string, channel: string): void {
  if ("Notification" in window && Notification.permission === "granted") {
    const notification = new Notification(title, { body, tag: channel });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
}

let notifPermissionRequested = false;
export function requestNotificationPermission(): void {
  if (notifPermissionRequested) return;
  notifPermissionRequested = true;
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// ── Web Push subscription management ─────────────────────────────────────────

/**
 * Enable offline push notifications for a server.
 * Flow:
 *   1. Request notification permission if needed.
 *   2. Ask the server for its VAPID public key via `push_get_vapid`.
 *   3. The server responds with `push_vapid` → `subscribeToPushForServer` is called.
 */
export async function enablePushForServer(sUrl: string): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("[Push] Web Push not supported in this browser.");
    return;
  }

  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      console.warn("[Push] Notification permission denied.");
      return;
    }
  }

  if (Notification.permission !== "granted") {
    console.warn("[Push] Notification permission not granted.");
    return;
  }

  const caps = serverCapabilitiesByServer.value[sUrl] ?? [];
  if (!caps.includes("push_get_vapid")) {
    console.warn(`[Push] ${sUrl} does not support push notifications.`);
    return;
  }

  // Ask the server for its VAPID public key.
  // The server will respond with a `push_vapid` message handled below.
  wsSend({ cmd: "push_get_vapid" }, sUrl);
}

/**
 * Called when the server responds with its VAPID public key.
 * Subscribes via PushManager and sends the subscription back to the server.
 */
export async function subscribeToPushForServer(
  sUrl: string,
  vapidPublicKey: string,
): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;

    // Unsubscribe any previous subscription first so we always get a fresh one
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    // Convert VAPID key from base64url to Uint8Array
    const keyBytes = urlBase64ToUint8Array(vapidPublicKey);

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes as unknown as ArrayBuffer,
    });

    const subJson = subscription.toJSON();
    pushSubscriptionsByServer[sUrl] = subJson;

    // Send subscription to the server
    wsSend(
      {
        cmd: "push_subscribe",
        subscription: subJson,
        vapid_public_key: vapidPublicKey,
      },
      sUrl,
    );

    // Persist the opt-in flag
    offlinePushServers.value = { ...offlinePushServers.value, [sUrl]: true };
    console.log(`[Push] Subscribed to push notifications for ${sUrl}`);
  } catch (err) {
    console.error(`[Push] Failed to subscribe for ${sUrl}:`, err);
  }
}

/**
 * Disable offline push notifications for a server.
 * Unsubscribes locally and notifies the server to remove the subscription.
 */
export async function disablePushForServer(sUrl: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      // Tell the server to remove this endpoint
      wsSend(
        {
          cmd: "push_unsubscribe",
          endpoint: subscription.endpoint,
        },
        sUrl,
      );
      await subscription.unsubscribe();
    }

    delete pushSubscriptionsByServer[sUrl];
    const next = { ...offlinePushServers.value };
    delete next[sUrl];
    offlinePushServers.value = next;
    console.log(`[Push] Unsubscribed from push notifications for ${sUrl}`);
  } catch (err) {
    console.error(`[Push] Failed to unsubscribe for ${sUrl}:`, err);
  }
}

/** Convert a base64url-encoded VAPID public key to a Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    arr[i] = rawData.charCodeAt(i);
  }
  return arr;
}

const CONNECTION_TIMEOUT = 5000;
const pendingMessageFetchesByServer: Record<
  string,
  Record<string, boolean>
> = {};

export function startMessageFetch(sUrl: string, channelName: string): void {
  if (!pendingMessageFetchesByServer[sUrl]) {
    pendingMessageFetchesByServer[sUrl] = {};
  }
  pendingMessageFetchesByServer[sUrl][channelName] = true;
}

export function finishMessageFetch(sUrl: string, channelName: string): void {
  if (pendingMessageFetchesByServer[sUrl]) {
    delete pendingMessageFetchesByServer[sUrl][channelName];
  }
}

const pendingReplyFetchesByServer: Record<string, Set<string>> = {};

export function fetchMissingReplyMessage(
  sUrl: string,
  channelName: string,
  replyToId: string,
): void {
  if (!pendingReplyFetchesByServer[sUrl]) {
    pendingReplyFetchesByServer[sUrl] = new Set();
  }
  if (pendingReplyFetchesByServer[sUrl].has(replyToId)) return;
  pendingReplyFetchesByServer[sUrl].add(replyToId);
  wsSend({ cmd: "message_get", channel: channelName, id: replyToId }, sUrl);
}

export function wsSend(data: any, sUrl?: string): boolean {
  const url = sUrl || serverUrl.value;
  const conn = wsConnections[url];
  if (conn && conn.socket && conn.socket.readyState === WebSocket.OPEN) {
    conn.socket.send(JSON.stringify(data));
    return true;
  }
  return false;
}

async function generateValidator(validatorKey: string): Promise<string> {
  return generateValidatorApi(validatorKey);
}

async function authenticateServer(sUrl: string): Promise<void> {
  const validatorKey = serverValidatorKeys[sUrl];
  if (!validatorKey) return;
  try {
    const validator = await generateValidator(validatorKey);
    wsSend({ cmd: "auth", validator }, sUrl);
  } catch (error) {
    console.error(`Authentication failed for ${sUrl}:`, error);
  }
}

export function closeWebSocket(url: string): void {
  clearServerState(url);

  if (reconnectTimeouts[url]) {
    clearTimeout(reconnectTimeouts[url]);
    delete reconnectTimeouts[url];
  }
  reconnectAttempts[url] = 0;
  const bannerId = reconnectBannerIds[url] || `reconnect-${url}`;
  dismissBanner(bannerId);
  delete reconnectBannerIds[url];

  const conn = wsConnections[url];
  if (!conn) return;
  if (conn.socket) {
    if (conn.closeHandler)
      conn.socket.removeEventListener("close", conn.closeHandler);
    if (conn.errorHandler)
      conn.socket.removeEventListener("error", conn.errorHandler);
    if (conn.socket.readyState !== WebSocket.CLOSED) conn.socket.close();
  }
  delete wsConnections[url];
  delete wsStatus[url];
}

export function clearServerState(sUrl: string): void {
  channelsByServer.value = Object.fromEntries(
    Object.entries(channelsByServer.value).filter(([key]) => key !== sUrl),
  );

  messagesByServer.value = Object.fromEntries(
    Object.entries(messagesByServer.value).filter(([key]) => key !== sUrl),
  );

  threadsByServer.value = Object.fromEntries(
    Object.entries(threadsByServer.value).filter(([key]) => key !== sUrl),
  );

  threadMessagesByServer.value = Object.fromEntries(
    Object.entries(threadMessagesByServer.value).filter(
      ([key]) => key !== sUrl,
    ),
  );

  usersByServer.value = Object.fromEntries(
    Object.entries(usersByServer.value).filter(([key]) => key !== sUrl),
  );

  currentUserByServer.value = Object.fromEntries(
    Object.entries(currentUserByServer.value).filter(([key]) => key !== sUrl),
  );

  rolesByServer.value = Object.fromEntries(
    Object.entries(rolesByServer.value).filter(([key]) => key !== sUrl),
  );

  slashCommandsByServer.value = Object.fromEntries(
    Object.entries(slashCommandsByServer.value).filter(([key]) => key !== sUrl),
  );

  typingUsersByServer.value = Object.fromEntries(
    Object.entries(typingUsersByServer.value).filter(([key]) => key !== sUrl),
  );

  serverCapabilitiesByServer.value = Object.fromEntries(
    Object.entries(serverCapabilitiesByServer.value).filter(
      ([key]) => key !== sUrl,
    ),
  );

  delete loadedChannelsByServer[sUrl];
  delete reachedOldestByServer[sUrl];
  delete pendingMessageFetchesByServer[sUrl];
  delete pendingReplyFetchesByServer[sUrl];

  readTimesByServer.value = Object.fromEntries(
    Object.entries(readTimesByServer.value).filter(([key]) => key !== sUrl),
  );

  renderChannelsSignal.value++;
  renderMessagesSignal.value++;
  renderMembersSignal.value++;
}

export { authenticateServer };

export async function reconnectServer(sUrl: string): Promise<boolean> {
  if (reconnectTimeouts[sUrl]) {
    clearTimeout(reconnectTimeouts[sUrl]);
    delete reconnectTimeouts[sUrl];
  }
  const bannerId = reconnectBannerIds[sUrl] || `reconnect-${sUrl}`;
  dismissBanner(bannerId);
  delete reconnectBannerIds[sUrl];
  reconnectAttempts[sUrl] = 0;

  clearServerState(sUrl);

  if (wsConnections[sUrl]) {
    const existing = wsConnections[sUrl];
    if (existing.socket) {
      if (existing.socket.readyState !== WebSocket.CLOSED) {
        existing.socket.close();
      }
      if (existing.closeHandler)
        existing.socket.removeEventListener("close", existing.closeHandler);
      if (existing.errorHandler)
        existing.socket.removeEventListener("error", existing.errorHandler);
    }
  }

  wsStatus[sUrl] = "connecting";
  renderGuildSidebarSignal.value++;

  return new Promise((resolve) => {
    const ws = new WebSocket(`wss://${sUrl}`);

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        wsConnections[sUrl] = { socket: ws, status: "error" };
        wsStatus[sUrl] = "error";
        renderGuildSidebarSignal.value++;
        resolve(false);
      }
    }, CONNECTION_TIMEOUT);

    const closeHandler = () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        wsConnections[sUrl] =
          wsConnections[sUrl]?.status === "connected"
            ? wsConnections[sUrl]
            : { socket: ws, status: "error" };
        wsStatus[sUrl] = "error";
        renderGuildSidebarSignal.value++;
        resolve(false);
      }
    };

    const errorHandler = () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        wsConnections[sUrl] = { socket: ws, status: "error" };
        wsStatus[sUrl] = "error";
        renderGuildSidebarSignal.value++;
        resolve(false);
      }
    };

    const openHandler = () => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        // Remove the pre-open listeners so we don't end up with duplicates.
        ws.removeEventListener("error", errorHandler);
        ws.removeEventListener("close", closeHandler);
        wsConnections[sUrl] = {
          socket: ws,
          status: "connected",
          closeHandler,
          errorHandler,
        };
        wsStatus[sUrl] = "connected";
        renderGuildSidebarSignal.value++;
        ws.addEventListener("message", (event) =>
          handleMessage(JSON.parse(event.data), sUrl),
        );
        ws.addEventListener("error", errorHandler);
        ws.addEventListener("close", closeHandler);
        resolve(true);
      }
    };

    ws.addEventListener("open", openHandler);
    ws.addEventListener("error", errorHandler);
    ws.addEventListener("close", closeHandler);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function serverLabel(sUrl: string): string {
  const server = servers.value.find((s) => s.url === sUrl);
  return server?.name || sUrl;
}

function scheduleReconnect(sUrl: string): void {
  // Only auto-reconnect the server the user is currently viewing.
  // Background servers just show the disconnected icon; the user can
  // switch to them to trigger a reconnect via switchServer().
  if (serverUrl.value !== sUrl) return;

  if (reconnectTimeouts[sUrl]) {
    clearTimeout(reconnectTimeouts[sUrl]);
    delete reconnectTimeouts[sUrl];
  }

  const attempt = (reconnectAttempts[sUrl] || 0) + 1;
  if (attempt > RECONNECT_MAX_ATTEMPTS) {
    upsertBanner(reconnectBannerIds[sUrl] || `reconnect-${sUrl}`, {
      kind: "error",
      serverUrl: sUrl,
      message: `Lost connection to ${serverLabel(sUrl)}. Click to reconnect manually.`,
      action: {
        label: "Reconnect",
        fn: () => {
          reconnectAttempts[sUrl] = 0;
          connectToServer(sUrl, true);
        },
      },
    });
    return;
  }

  reconnectAttempts[sUrl] = attempt;

  const delay =
    Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1),
      RECONNECT_MAX_DELAY_MS,
    ) / 2;

  const label = serverLabel(sUrl);
  const bannerId = `reconnect-${sUrl}`;
  reconnectBannerIds[sUrl] = bannerId;

  upsertBanner(bannerId, {
    kind: "warning",
    serverUrl: sUrl,
    message: `Connection to ${label} lost. Reconnecting in ${Math.round(delay / 1000)}s… (attempt ${attempt}/${RECONNECT_MAX_ATTEMPTS})`,
    action: {
      label: "Reconnect now",
      fn: () => {
        clearTimeout(reconnectTimeouts[sUrl]);
        delete reconnectTimeouts[sUrl];
        reconnectAttempts[sUrl] = 0;
        dismissBanner(bannerId);
        delete reconnectBannerIds[sUrl];
        connectToServer(sUrl, true);
      },
    },
  });

  wsStatus[sUrl] = "connecting";
  renderGuildSidebarSignal.value++;

  reconnectTimeouts[sUrl] = window.setTimeout(() => {
    delete reconnectTimeouts[sUrl];
    connectToServer(sUrl, true);
  }, delay);
}

export function connectToServer(sUrl: string, _manual = false): void {
  if (reconnectTimeouts[sUrl]) {
    clearTimeout(reconnectTimeouts[sUrl]);
    reconnectTimeouts[sUrl] = 0;
  }

  clearServerState(sUrl);

  if (wsConnections[sUrl]) {
    const existing = wsConnections[sUrl];
    if (existing.socket) {
      // Detach handlers BEFORE closing so the close event doesn't re-trigger
      // scheduleReconnect on a socket we are intentionally replacing.
      if (existing.closeHandler)
        existing.socket.removeEventListener("close", existing.closeHandler);
      if (existing.errorHandler)
        existing.socket.removeEventListener("error", existing.errorHandler);
      if (existing.socket.readyState !== WebSocket.CLOSED)
        existing.socket.close();
    }
  }

  wsStatus[sUrl] = "connecting";
  const ws = new WebSocket(`wss://${sUrl}`);

  const closeHandler = () => {
    clearServerState(sUrl);
    const conn = wsConnections[sUrl];
    if (conn) {
      conn.status = "disconnected";
      wsStatus[sUrl] = "disconnected";
    }
    serversAttempted.add(sUrl);
    renderGuildSidebarSignal.value++;
    scheduleReconnect(sUrl);
  };

  const errorHandler = () => {
    console.error(`WebSocket error for ${sUrl}`);
    clearServerState(sUrl);
    const conn = wsConnections[sUrl];
    if (conn) conn.status = "error";
    wsStatus[sUrl] = "error";
    serversAttempted.add(sUrl);
    renderGuildSidebarSignal.value++;
  };

  const openHandler = () => {
    console.log(`WebSocket connected to ${sUrl}`);
    const conn = wsConnections[sUrl];
    if (conn) {
      conn.status = "connected";
      conn.closeHandler = closeHandler;
      conn.errorHandler = errorHandler;
    }
    wsStatus[sUrl] = "connected";
    serversAttempted.add(sUrl);
    renderGuildSidebarSignal.value++;

    // Clear any reconnect attempt counter and dismiss the reconnect banner
    if (reconnectAttempts[sUrl] && reconnectAttempts[sUrl] > 0) {
      const bannerId = reconnectBannerIds[sUrl] || `reconnect-${sUrl}`;
      dismissBanner(bannerId);
      delete reconnectBannerIds[sUrl];
      const label = serverLabel(sUrl);
      showBanner({
        kind: "info",
        serverUrl: sUrl,
        message: `Reconnected to ${label}.`,
        autoDismissMs: 4000,
      });
    }
    reconnectAttempts[sUrl] = 0;
  };

  wsConnections[sUrl] = {
    socket: ws,
    status: "connecting",
    closeHandler,
    errorHandler,
  };
  ws.addEventListener("open", openHandler);
  ws.addEventListener("message", (event) =>
    handleMessage(JSON.parse(event.data), sUrl),
  );
  ws.addEventListener("error", errorHandler);
  ws.addEventListener("close", closeHandler);
}

async function handleMessage(msg: any, sUrl: string): Promise<void> {
  const { selectChannel } = await import("./actions");

  switch (msg.cmd || msg.type) {
    case "handshake": {
      if (!channelsByServer.value[sUrl])
        channelsByServer.value = { ...channelsByServer.value, [sUrl]: [] };
      if (!messagesByServer.value[sUrl])
        messagesByServer.value = { ...messagesByServer.value, [sUrl]: {} };
      if (!usersByServer.value[sUrl])
        usersByServer.value = { ...usersByServer.value, [sUrl]: {} };
      serverValidatorKeys[sUrl] = msg.val.validator_key;
      // Store the server's advertised capabilities.
      // If the server sends no capabilities array, fall back to a baseline set
      // that all legacy servers are assumed to support.
      const DEFAULT_CAPABILITIES = [
        "auth",
        "channels_get",
        "message_delete",
        "message_edit",
        "message_get",
        "message_new",
        "message_react_add",
        "message_react_remove",
        "messages_get",
        "typing",
        "user_leave",
        "users_list",
        "users_online",
        "voice_join",
        "voice_leave",
        "voice_mute",
        "voice_state",
      ];
      serverCapabilitiesByServer.value = {
        ...serverCapabilitiesByServer.value,
        [sUrl]: Array.isArray(msg.val.capabilities)
          ? msg.val.capabilities
          : DEFAULT_CAPABILITIES,
      };
      // Always apply the authoritative icon and name from the handshake so
      // the local cache never gets out of sync with what the server reports.
      if (msg.val.server) {
        const { icon, name } = msg.val.server;
        const existing = servers.value.find((s) => s.url === sUrl);
        if (existing) {
          const iconChanged = icon && existing.icon !== icon;
          const nameChanged = name && existing.name !== name;
          if (iconChanged || nameChanged) {
            servers.value = servers.value.map((s) =>
              s.url === sUrl
                ? { ...s, ...(icon ? { icon } : {}), ...(name ? { name } : {}) }
                : s,
            );
            const { saveServers } = await import("./persistence");
            saveServers().catch(() => {});
          }
          // Always bust the icon cache on handshake so the <img> re-fetches
          // the latest version even if the URL string hasn't changed.
          if (icon) reloadServerIcon(sUrl);
        }
      }
      renderGuildSidebarSignal.value++;
      await authenticateServer(sUrl);

      if (Notification.permission === "granted") {
        const { enablePushForServer } = await import("../lib/websocket");
        if (!offlinePushServers.value[sUrl]) {
          enablePushForServer(sUrl);
        }
      }
      break;
    }
    case "ready":
      currentUserByServer.value = {
        ...currentUserByServer.value,
        [sUrl]: msg.user,
      };
      if (!usersByServer.value[sUrl])
        usersByServer.value = { ...usersByServer.value, [sUrl]: {} };
      usersByServer.value = {
        ...usersByServer.value,
        [sUrl]: {
          ...usersByServer.value[sUrl],
          [msg.user.username?.toLowerCase()]: msg.user,
        },
      };
      renderMembersSignal.value++;
      break;
    case "auth_success": {
      const caps = serverCapabilitiesByServer.value[sUrl] ?? [];
      const serverHas = (cap: string) => caps.includes(cap);
      wsSend({ cmd: "channels_get" }, sUrl);
      wsSend({ cmd: "users_list" }, sUrl);
      wsSend({ cmd: "users_online" }, sUrl);
      if (serverHas("roles_list")) wsSend({ cmd: "roles_list" }, sUrl);
      if (serverHas("slash_list")) wsSend({ cmd: "slash_list" }, sUrl);
      if (sUrl !== DM_SERVER_URL && serverHas("pings_get")) {
        let channelReadTimes = readTimesByServer.value[sUrl];
        if (!channelReadTimes || Object.keys(channelReadTimes).length === 0) {
          channelReadTimes = await dbReadTimes.get(sUrl);
          if (channelReadTimes && Object.keys(channelReadTimes).length > 0) {
            readTimesByServer.value = {
              ...readTimesByServer.value,
              [sUrl]: channelReadTimes,
            };
          }
        }
        const readValues = Object.values(channelReadTimes || {});
        const since =
          readValues.length > 0 ? Math.min(...(readValues as number[])) : 0;
        wsSend({ cmd: "list_pings", since }, sUrl);
      }
      break;
    }
    case "channels_get": {
      channelsByServer.value = { ...channelsByServer.value, [sUrl]: msg.val };
      // Extract threads from forum channels
      const forumThreads: Record<string, any[]> = {};
      for (const channel of msg.val) {
        if (channel.type === "forum" && channel.threads) {
          forumThreads[channel.name] = channel.threads;
        }
      }
      if (Object.keys(forumThreads).length > 0) {
        threadsByServer.value = {
          ...threadsByServer.value,
          [sUrl]: forumThreads,
        };
      }
      renderChannelsSignal.value++;
      // If a "dm add" was pending and this is the DMS responding with the
      // updated channel list, the command succeeded — clear the pending state.
      if (sUrl === DM_SERVER_URL && pendingDMAddUsername) {
        setPendingDMAddUsername(null);
      }
      if (
        serverUrl.value === sUrl &&
        !currentChannel.value &&
        channelsByServer.value[sUrl]?.length > 0 &&
        sUrl !== DM_SERVER_URL
      ) {
        selectChannel(channelsByServer.value[sUrl][0]);
      }
      // After reconnect, if we're on this server and have a last channel saved,
      // switch to it to refetch messages
      if (serverUrl.value === sUrl && lastChannelByServer.value[sUrl]) {
        const lastChannelName = lastChannelByServer.value[sUrl];
        const channelList = channelsByServer.value[sUrl] || [];
        const targetChannel = channelList.find(
          (c) => c.name === lastChannelName,
        );
        if (targetChannel) {
          selectChannel(targetChannel);
        } else if (channelList.length > 0) {
          const textChannels = channelList.filter(
            (c) => c.type === "text" || c.type === "voice",
          );
          if (textChannels.length > 0) {
            selectChannel(textChannels[0]);
          }
        }
      }
      break;
    }
    case "thread_create": {
      const threadCreate = msg as any;
      if (threadCreate.thread && threadCreate.channel) {
        addThreadToChannel(sUrl, threadCreate.channel, threadCreate.thread);
        renderChannelsSignal.value++;
      }
      break;
    }
    case "thread_delete": {
      const threadDelete = msg as any;
      if (threadDelete.thread_id && threadDelete.channel) {
        removeThreadFromChannel(
          sUrl,
          threadDelete.channel,
          threadDelete.thread_id,
        );
        if (currentThread.value?.id === threadDelete.thread_id) {
          currentThread.value = null;
        }
        renderChannelsSignal.value++;
      }
      break;
    }
    case "thread_get": {
      const threadGet = msg as any;
      if (threadGet.thread) {
        currentThread.value = threadGet.thread;
      }
      break;
    }
    case "thread_join": {
      const threadJoin = msg as any;
      if (threadJoin.thread && threadJoin.thread_id) {
        updateThreadInChannel(
          sUrl,
          threadJoin.thread.parent_channel,
          threadJoin.thread_id,
          { participants: threadJoin.thread.participants },
        );
        if (currentThread.value?.id === threadJoin.thread_id) {
          currentThread.value = {
            ...currentThread.value,
            participants: threadJoin.thread.participants,
          };
        }
        renderChannelsSignal.value++;
      }
      break;
    }
    case "thread_leave": {
      const threadLeave = msg as any;
      if (threadLeave.thread && threadLeave.thread_id) {
        updateThreadInChannel(
          sUrl,
          threadLeave.thread.parent_channel,
          threadLeave.thread_id,
          { participants: threadLeave.thread.participants },
        );
        if (currentThread.value?.id === threadLeave.thread_id) {
          currentThread.value = {
            ...currentThread.value,
            participants: threadLeave.thread.participants,
          };
        }
        renderChannelsSignal.value++;
      }
      break;
    }
    case "thread_messages": {
      const threadMsgs = msg as any;
      if (threadMsgs.thread_id && threadMsgs.messages) {
        setThreadMessagesForServer(
          sUrl,
          threadMsgs.thread_id,
          threadMsgs.messages,
        );
        // Also store in messagesByServer so MessageArea can display them
        if (!messagesByServer.value[sUrl]) {
          messagesByServer.value = {
            ...messagesByServer.value,
            [sUrl]: {},
          };
        }
        messagesByServer.value = {
          ...messagesByServer.value,
          [sUrl]: {
            ...messagesByServer.value[sUrl],
            [threadMsgs.thread_id]: threadMsgs.messages,
          },
        };
        // Mark thread as loaded
        if (!loadedChannelsByServer[sUrl]) {
          loadedChannelsByServer[sUrl] = new Set();
        }
        loadedChannelsByServer[sUrl].add(threadMsgs.thread_id);
        renderMessagesSignal.value++;
      }
      break;
    }
    case "users_list": {
      const existing = usersByServer.value[sUrl] || {};
      const next: Record<string, (typeof existing)[string]> = {};
      for (const user of msg.users) {
        const key = user.username?.toLowerCase();
        if (!key) continue;
        // Merge: incoming fields win, but preserve any client-side fields
        // (e.g. status set by users_online) that the server didn't send.
        next[key] = { ...existing[key], ...user };
      }
      usersByServer.value = { ...usersByServer.value, [sUrl]: next };
      renderMembersSignal.value++;
      break;
    }
    case "users_online":
      if (!usersByServer.value[sUrl])
        usersByServer.value = { ...usersByServer.value, [sUrl]: {} };
      for (const user of msg.users) {
        if (usersByServer.value[sUrl]?.[user.username?.toLowerCase()]) {
          usersByServer.value[sUrl][user.username?.toLowerCase()].status =
            "online";
        }
      }
      renderMembersSignal.value++;
      break;
    case "message_new": {
      // Only append to the message store if this channel has already been
      // loaded via messages_get. If not, the user hasn't opened it yet and
      // the channel list unread indicators are sufficient; we don't want to
      // pre-populate the cache because selectChannel() uses the loaded state
      // to decide whether to fetch — if we wrote here, opening the channel
      // would not load the history that precedes these new messages.

      const msgNew = msg as MessageNew;

      const isThreadMessage = !!msgNew.thread_id;
      const messageKey = isThreadMessage ? msgNew.thread_id! : msgNew.channel;

      const channelIsLoaded =
        loadedChannelsByServer[sUrl]?.has(messageKey) ?? false;
      if (channelIsLoaded) {
        if (!messagesByServer.value[sUrl])
          messagesByServer.value = { ...messagesByServer.value, [sUrl]: {} };
        if (!messagesByServer.value[sUrl][messageKey]) {
          messagesByServer.value = {
            ...messagesByServer.value,
            [sUrl]: { ...messagesByServer.value[sUrl], [messageKey]: [] },
          };
        }
        const channelMsgs = messagesByServer.value[sUrl][messageKey];
        const alreadyExists = channelMsgs.some(
          (m: Message) => m.id === msgNew.message.id,
        );
        if (!alreadyExists) {
          messagesByServer.value = {
            ...messagesByServer.value,
            [sUrl]: {
              ...messagesByServer.value[sUrl],
              [messageKey]: [...channelMsgs, msgNew.message],
            },
          };
        }
      }

      const chList = channelsByServer.value[sUrl];
      const targetChannel = msgNew.channel;
      if (chList) {
        const idx = chList.findIndex((c: Channel) => c.name === targetChannel);
        if (idx !== -1 && msgNew.message.timestamp) {
          const updatedList = [...chList];
          updatedList[idx] = {
            ...updatedList[idx],
            last_message: msgNew.message.timestamp,
          };
          channelsByServer.value = {
            ...channelsByServer.value,
            [sUrl]: updatedList,
          };
          if (sUrl === DM_SERVER_URL) {
            renderChannelsSignal.value++;
          }
        }
      }

      const isThreadView =
        isThreadMessage && currentThread.value?.id === msgNew.thread_id;
      const isCurrentView =
        isThreadView ||
        (!isThreadMessage &&
          serverUrl.value === sUrl &&
          currentChannel.value?.name === messageKey);

      const notifLevel = getChannelNotifLevel(sUrl, targetChannel);
      const isMuted = notifLevel === "none";
      const channelKey = `${sUrl}:${targetChannel}`;
      const threadKey = isThreadMessage
        ? `${sUrl}:thread:${msgNew.thread_id}`
        : null;

      let myUsername = currentUserByServer.value[sUrl]?.username;
      const isOwnMessage = msgNew.message.user === myUsername;

      if (!isCurrentView && !isMuted && !isOwnMessage) {
        const keyToIncrement = isThreadMessage ? threadKey! : channelKey;
        unreadByChannel.value = {
          ...unreadByChannel.value,
          [keyToIncrement]: (unreadByChannel.value[keyToIncrement] || 0) + 1,
        };

        if (sUrl === DM_SERVER_URL && !isOwnMessage && dmMessageSound.value) {
          playPingSound();
        }

        // "all" mode: treat every incoming message as a ping
        if (notifLevel === "all") {
          myUsername = currentUserByServer.value[sUrl]?.username;
          if (msgNew.message.user !== myUsername) {
            const pingKeyToIncrement = isThreadMessage
              ? threadKey!
              : channelKey;
            unreadPings.value = {
              ...unreadPings.value,
              [pingKeyToIncrement]:
                (unreadPings.value[pingKeyToIncrement] || 0) + 1,
            };
            playPingSound();
            const cleanContent = (msgNew.message.content || "").replace(
              /<[^>]*>/g,
              "",
            );
            const notifBody =
              cleanContent.length > 100
                ? cleanContent.substring(0, 100) + "..."
                : cleanContent;
            showNotification(
              `${msgNew.message.user} in #${msgNew.channel}`,
              notifBody,
              msgNew.channel,
            );
            if (serverUrl.value === sUrl) renderChannelsSignal.value++;
            renderGuildSidebarSignal.value++;
          }
        }

        // If this DM channel isn't in the sidebar list yet, add it so the
        // sender appears with an unread badge without needing a dm_list event.
        if (sUrl === DM_SERVER_URL) {
          const alreadyListed = dmServers.value.some(
            (d: DMServer) => d.channel === msgNew.channel,
          );
          if (!alreadyListed) {
            const senderUsername = msgNew.message.user as string;
            dmServers.value = [
              ...dmServers.value,
              {
                channel: msgNew.channel,
                name: senderUsername,
                username: senderUsername,
                last_message: msgNew.message.timestamp,
              },
            ];
          }
        }

        if (serverUrl.value === sUrl) renderChannelsSignal.value++;
        renderGuildSidebarSignal.value++;
      } else if (isOwnMessage && !isCurrentView) {
        const keyToClear = isThreadMessage ? threadKey! : channelKey;
        if (unreadByChannel.value[keyToClear]) {
          const newUnreads = { ...unreadByChannel.value };
          delete newUnreads[keyToClear];
          unreadByChannel.value = newUnreads;
        }
        if (unreadPings.value[keyToClear]) {
          const newPings = { ...unreadPings.value };
          delete newPings[keyToClear];
          unreadPings.value = newPings;
        }
      } else if (isCurrentView) {
        const msgTimestamp = msgNew.message.timestamp;

        readTimesByServer.value = {
          ...readTimesByServer.value,
          [sUrl]: {
            ...(readTimesByServer.value[sUrl] ?? {}),
            [msgNew.channel]: msgTimestamp,
          },
        };

        const keyToClear = isThreadMessage ? threadKey! : channelKey;
        if (unreadByChannel.value[keyToClear]) {
          const newUnreads = { ...unreadByChannel.value };
          delete newUnreads[keyToClear];
          unreadByChannel.value = newUnreads;
        }

        if (_readTimeFlushTimers[channelKey]) {
          clearTimeout(_readTimeFlushTimers[channelKey]);
        }
        _readTimeFlushTimers[channelKey] = setTimeout(() => {
          delete _readTimeFlushTimers[channelKey];
          dbReadTimes
            .set(sUrl, readTimesByServer.value[sUrl] ?? {})
            .catch((e) =>
              console.warn("[message_new] Failed to persist read time:", e),
            );
        }, 1000);
      } else if (!isCurrentView && isMuted) {
        // Still update DM sidebar presence even when muted, but no badge.
        if (sUrl === DM_SERVER_URL) {
          const alreadyListed = dmServers.value.some(
            (d: DMServer) => d.channel === msgNew.channel,
          );
          if (!alreadyListed) {
            const senderUsername = msgNew.message.user;
            dmServers.value = [
              ...dmServers.value,
              {
                channel: msg.channel,
                name: senderUsername,
                username: senderUsername,
                last_message: msg.message.timestamp,
              },
            ];
          }
        }
      }

      myUsername = currentUserByServer.value[sUrl]?.username;
      const myRoles =
        usersByServer.value[sUrl]?.[myUsername?.toLowerCase() || ""]?.roles ||
        [];
      const myRolesLower = myRoles.map((r) => r.toLowerCase());
      const serverRoles = rolesByServer.value[sUrl] || {};
      const mentionedRoles = msgNew.message.pings?.roles || [];
      const isRolePinged = mentionedRoles.some((r) =>
        myRolesLower.includes(r.toLowerCase()),
      );

      const isUserPinged =
        msgNew.message.pings?.users?.some(
          (u) => u.toLowerCase() === myUsername?.toLowerCase(),
        ) || false;
      const isReplyPinged =
        msgNew.message.pings?.replies?.some(
          (r) => r.toLowerCase() === myUsername?.toLowerCase(),
        ) || false;

      // Only process mention/reply pings when not muted and not already in "all" mode
      // ("all" already counted every message as a ping above).
      if (
        myUsername &&
        msgNew.message.user !== myUsername &&
        !isMuted &&
        !isCurrentView &&
        notifLevel !== "all"
      ) {
        const pingKeyToUse = isThreadMessage ? threadKey! : channelKey;

        // Auto-join thread when pinged
        if (
          isThreadMessage &&
          msgNew.thread_id &&
          (isUserPinged || isRolePinged || isReplyPinged)
        ) {
          const caps = serverCapabilitiesByServer.value[sUrl] ?? [];
          if (caps.includes("thread_join")) {
            wsSend({ cmd: "thread_join", thread_id: msgNew.thread_id }, sUrl);
          }
        }

        if (isUserPinged) {
          if (!isCurrentView) {
            unreadPings.value = {
              ...unreadPings.value,
              [pingKeyToUse]: (unreadPings.value[pingKeyToUse] || 0) + 1,
            };
            if (serverUrl.value === sUrl) renderChannelsSignal.value++;
          }
          playPingSound();
          const cleanContent = (msgNew.message.content || "").replace(
            /<[^>]*>/g,
            "",
          );
          const notifBody =
            cleanContent.length > 100
              ? cleanContent.substring(0, 100) + "..."
              : cleanContent;
          showNotification(
            `${msgNew.message.user} mentioned you in #${msg.channel}`,
            notifBody,
            msg.channel,
          );
          renderGuildSidebarSignal.value++;
        } else if (isRolePinged) {
          if (!isCurrentView) {
            unreadPings.value = {
              ...unreadPings.value,
              [pingKeyToUse]: (unreadPings.value[pingKeyToUse] || 0) + 1,
            };
            if (serverUrl.value === sUrl) renderChannelsSignal.value++;
          }
          playPingSound();
          const cleanContent = (msgNew.message.content || "").replace(
            /<[^>]*>/g,
            "",
          );
          const notifBody =
            cleanContent.length > 100
              ? cleanContent.substring(0, 100) + "..."
              : cleanContent;
          const pingedRole = mentionedRoles.find((r) =>
            myRolesLower.includes(r.toLowerCase()),
          );
          showNotification(
            `${msgNew.message.user} mentioned ${pingedRole} in #${msg.channel}`,
            notifBody,
            msg.channel,
          );
          renderGuildSidebarSignal.value++;
        } else if (isReplyPinged) {
          if (!isCurrentView) {
            unreadPings.value = {
              ...unreadPings.value,
              [pingKeyToUse]: (unreadPings.value[pingKeyToUse] || 0) + 1,
            };
            if (serverUrl.value === sUrl) renderChannelsSignal.value++;
          }
          playPingSound();
          const cleanContent = (msgNew.message.content || "").replace(
            /<[^>]*>/g,
            "",
          );
          const notifBody =
            cleanContent.length > 100
              ? cleanContent.substring(0, 100) + "..."
              : cleanContent;
          showNotification(
            `${msgNew.message.user} replied to your message in #${msgNew.channel}`,
            notifBody,
            msgNew.channel,
          );
        }
      }

      const typingServer = typingUsersByServer.value[sUrl];
      if (typingServer && typingServer[msgNew.channel]) {
        const typing = typingServer[msgNew.channel] as Map<string, number>;
        if (typing.has(msgNew.message.user)) {
          typing.delete(msgNew.message.user);
        }
      }

      renderMessagesSignal.value++;
      break;
    }
    case "messages_get": {
      const msgGet = msg as MessagesGet;

      if (!messagesByServer.value[sUrl])
        messagesByServer.value = { ...messagesByServer.value, [sUrl]: {} };

      const channel = msgGet.channel;
      const messageKey = getMessageKey(msgGet);

      finishMessageFetch(sUrl, messageKey);

      // Mark this channel as loaded so future message_new events are stored
      if (!loadedChannelsByServer[sUrl])
        loadedChannelsByServer[sUrl] = new Set();
      loadedChannelsByServer[sUrl].add(messageKey);

      const existingMsgs = messagesByServer.value[sUrl][messageKey] || [];

      const newMessages = (msgGet.messages || []).map((m) => {
        const normalised: Record<string, string[]> = {};
        if (m.reactions && typeof m.reactions === "object")
          for (const [emoji, reactors] of Object.entries(m.reactions)) {
            normalised[emoji] = reactors;
          }
        return { ...m, reactions: normalised };
      });

      const existingIds = new Set(existingMsgs.map((m) => m.id));
      const deduplicatedNew = newMessages.filter((m) => !existingIds.has(m.id));
      const mergedMsgs = [...deduplicatedNew, ...existingMsgs];

      // If this was a pagination (scroll-up) fetch and the server returned fewer
      // messages than the requested limit, we've reached the beginning of history.
      const SCROLL_UP_LIMIT = 20;
      if (existingMsgs.length > 0 && newMessages.length < SCROLL_UP_LIMIT) {
        if (!reachedOldestByServer[sUrl])
          reachedOldestByServer[sUrl] = new Set();
        reachedOldestByServer[sUrl].add(messageKey);
      }

      messagesByServer.value = {
        ...messagesByServer.value,
        [sUrl]: {
          ...messagesByServer.value[sUrl],
          [messageKey]: mergedMsgs,
        },
      };

      renderMessagesSignal.value++;

      console.log(
        `[messages_get] Received ${newMessages.length} messages for ${msgGet.thread_id ? `thread ${msgGet.thread_id}` : `channel ${channel}`}. Total: ${mergedMsgs.length}`,
      );

      if (
        serverUrl.value === sUrl &&
        !currentChannel.value &&
        mergedMsgs.length > 0 &&
        sUrl !== DM_SERVER_URL
      ) {
        const { selectChannel } = await import("./actions");
        const channels = channelsByServer.value[sUrl] || [];
        if (channels.length > 0) selectChannel(channels[0]);
      }
      break;
    }
    case "message_get": {
      if (!messagesByServer.value[sUrl]) break;
      const msgGet = msg as MessageGet;
      const channel = msgGet.channel;
      const message = msgGet.message;
      const messageKey = getMessageKey(msgGet);
      if (!channel || !message) break;
      pendingReplyFetchesByServer[sUrl]?.delete(message.id);
      if (!messagesByServer.value[sUrl][messageKey]) {
        messagesByServer.value = {
          ...messagesByServer.value,
          [sUrl]: { ...messagesByServer.value[sUrl], [messageKey]: [] },
        };
      }
      const existingMsgs = messagesByServer.value[sUrl][messageKey];
      const alreadyExists = existingMsgs.some((m) => m.id === message.id);
      if (!alreadyExists) {
        const insertIdx = existingMsgs.findIndex(
          (m) => m.timestamp > message.timestamp,
        );
        const newMsgs =
          insertIdx === -1
            ? [...existingMsgs, message]
            : [
                ...existingMsgs.slice(0, insertIdx),
                message,
                ...existingMsgs.slice(insertIdx),
              ];
        messagesByServer.value = {
          ...messagesByServer.value,
          [sUrl]: { ...messagesByServer.value[sUrl], [messageKey]: newMsgs },
        };
        renderMessagesSignal.value++;
      }
      break;
    }
    case "message_edit": {
      const msgEdit = msg as MessageEdit;
      const messageKey = getMessageKey(msgEdit);
      if (!messagesByServer.value[sUrl]?.[messageKey]) break;
      const editedMsgs = messagesByServer.value[sUrl][messageKey].map((m) =>
        m.id === msg.id ? { ...m, content: msgEdit.content, edited: true } : m,
      );
      messagesByServer.value = {
        ...messagesByServer.value,
        [sUrl]: {
          ...messagesByServer.value[sUrl],
          [messageKey]: editedMsgs,
        },
      };
      renderMessagesSignal.value++;
      break;
    }
    case "message_delete": {
      const msgDel = msg as MessageDelete;
      const messageKey = getMessageKey(msgDel);
      if (!messagesByServer.value[sUrl]?.[messageKey]) break;
      const filteredMsgs = messagesByServer.value[sUrl][messageKey].filter(
        (m) => m.id !== msgDel.id,
      );
      messagesByServer.value = {
        ...messagesByServer.value,
        [sUrl]: {
          ...messagesByServer.value[sUrl],
          [messageKey]: filteredMsgs,
        },
      };
      renderMessagesSignal.value++;
      break;
    }
    case "typing": {
      const msgTyping = msg as Typing;
      const { channel, user } = msgTyping;
      if (!typingUsersByServer.value[sUrl])
        typingUsersByServer.value = {
          ...typingUsersByServer.value,
          [sUrl]: {},
        };
      if (!typingUsersByServer.value[sUrl][channel])
        typingUsersByServer.value[sUrl][channel] = new Map() as any;
      (typingUsersByServer.value[sUrl][channel] as Map<string, number>).set(
        user,
        Date.now() + 10000,
      );
      break;
    }
    case "roles_list": {
      // msg.roles is an object keyed by role name e.g. { owner: { color, description, ... }, ... }
      const roles: Record<string, Role> = msg.roles || {};
      rolesByServer.value = { ...rolesByServer.value, [sUrl]: roles };
      break;
    }
    case "message_react_add":
    case "message_react_remove": {
      const reactMessageKey = getMessageKey(msg as any);
      if (!messagesByServer.value[sUrl]?.[reactMessageKey]) break;
      const reactMsg = messagesByServer.value[sUrl][reactMessageKey].find(
        (m: any) => m.id === msg.id,
      );
      if (reactMsg) {
        // server may send the reactor as msg.user or msg.from, either as a string or object
        const reactUser: string = (() => {
          const raw = msg.user ?? msg.from;
          if (raw == null) return "";
          return typeof raw === "object"
            ? (raw.username ?? String(raw))
            : String(raw);
        })();
        if (!reactMsg.reactions) reactMsg.reactions = {};
        if (
          msg.cmd === "message_react_add" ||
          msg.type === "message_react_add"
        ) {
          if (!reactMsg.reactions[msg.emoji])
            reactMsg.reactions[msg.emoji] = [];
          if (!reactMsg.reactions[msg.emoji].includes(reactUser)) {
            reactMsg.reactions[msg.emoji].push(reactUser);
          }
        } else {
          if (reactMsg.reactions[msg.emoji]) {
            reactMsg.reactions[msg.emoji] = reactMsg.reactions[
              msg.emoji
            ].filter((u: string) => u !== reactUser);
            if (reactMsg.reactions[msg.emoji].length === 0) {
              delete reactMsg.reactions[msg.emoji];
            }
          }
        }
      }
      renderMessagesSignal.value++;
      break;
    }
    case "message_pin": {
      const msgPin = msg as MessagePin;
      const messageKey = getMessageKey(msgPin);
      if (!messagesByServer.value[sUrl]?.[messageKey]) break;
      const pinMsg = messagesByServer.value[sUrl][messageKey].find(
        (m) => m.id === msgPin.id,
      );
      if (pinMsg) {
        pinMsg.pinned = pinMsg.pinned === true;
      }
      renderMessagesSignal.value++;
      break;
    }
    case "messages_search": {
      const { searchResults, searchLoading } = await import("./ui-signals");
      searchResults.value = msg.results || [];
      searchLoading.value = false;
      break;
    }
    case "pings_get": {
      const incoming = msg.messages || [];
      const offset = msg.offset ?? 0;
      if (offset === 0) {
        pingsInboxMessages.value = incoming;
      } else {
        pingsInboxMessages.value = [...pingsInboxMessages.value, ...incoming];
      }
      pingsInboxTotal.value = msg.total ?? incoming.length;
      pingsInboxOffset.value = offset;
      pingsInboxLoading.value = false;
      break;
    }
    case "list_pings": {
      // Server response to our on-connect list_pings request.
      // Shape: { cmd: "list_pings", messages: PingMessage[] }
      // Each message is a ping (mention or reply-to-me) that occurred after
      // the `since` timestamp we sent. We count them per-channel, but only
      // if the message's timestamp is newer than that channel's last read time.
      const pingMessages: Array<{ channel: string; timestamp: number }> =
        msg.messages || [];
      if (!pingMessages.length) break;

      const channelReadTimes = readTimesByServer.value[sUrl] || {};

      // Count pings per channel (only those newer than the channel read time).
      const newPingsByChannel: Record<string, number> = {};
      for (const pm of pingMessages) {
        const channelReadTime = channelReadTimes[pm.channel] ?? 0;
        if (pm.timestamp > channelReadTime) {
          newPingsByChannel[pm.channel] =
            (newPingsByChannel[pm.channel] || 0) + 1;
        }
      }

      if (!Object.keys(newPingsByChannel).length) break;

      // Merge into unreadPings (additive with any already-counted live pings).
      const mergedPings = { ...unreadPings.value };
      let totalNew = 0;
      for (const [channel, count] of Object.entries(newPingsByChannel)) {
        // Skip muted channels.
        if (getChannelNotifLevel(sUrl, channel) === "none") continue;
        // Only add if we don't already have a live ping count for this channel
        // (a live ping arrived via message_new and is already counted).
        const pingKey = `${sUrl}:${channel}`;
        if (!mergedPings[pingKey]) {
          mergedPings[pingKey] = count;
          totalNew += count;
        }
      }
      if (totalNew > 0) {
        unreadPings.value = mergedPings;
        renderChannelsSignal.value++;
        renderGuildSidebarSignal.value++;
      }
      break;
    }
    case "messages_pinned": {
      const { pinnedMessages, pinnedLoading } = await import("./ui-signals");
      pinnedMessages.value = msg.messages || [];
      pinnedLoading.value = false;
      break;
    }
    case "user_connect": {
      const userConnect = msg as UserConnect;
      if (!usersByServer.value[sUrl]) {
        usersByServer.value = { ...usersByServer.value, [sUrl]: {} };
      }
      const key = userConnect.user.username?.toLowerCase();
      if (key) {
        usersByServer.value = {
          ...usersByServer.value,
          [sUrl]: {
            ...usersByServer.value[sUrl],
            [key]: {
              ...usersByServer.value[sUrl][key],
              ...userConnect.user,
              status: "online",
            },
          },
        };
        renderMembersSignal.value++;
      }
      break;
    }
    case "user_join": {
      if (!usersByServer.value[sUrl]) {
        usersByServer.value = { ...usersByServer.value, [sUrl]: {} };
      }
      usersByServer.value = {
        ...usersByServer.value,
        [sUrl]: {
          ...usersByServer.value[sUrl],
          [msg.user.username?.toLowerCase()]: msg.user,
        },
      };
      renderMembersSignal.value++;
      break;
    }
    case "user_disconnect": {
      const userDisconnect = msg as UserDisconnect;
      const uKey = userDisconnect.username.toLowerCase();
      if (usersByServer.value[sUrl]?.[uKey]) {
        usersByServer.value = {
          ...usersByServer.value,
          [sUrl]: {
            ...usersByServer.value[sUrl],
            [uKey]: {
              ...usersByServer.value[sUrl][uKey],
              status: "offline",
            },
          },
        };
        renderMembersSignal.value++;
      }
      break;
    }
    case "user_leave": {
      if (usersByServer.value[sUrl]?.[msg.username?.toLowerCase()]) {
        const updated = { ...usersByServer.value[sUrl] };
        delete updated[msg.username.toLowerCase()];
        usersByServer.value = { ...usersByServer.value, [sUrl]: updated };
        renderMembersSignal.value++;
      }
      break;
    }
    case "user_status": {
      const uKey = msg.username?.toLowerCase();
      if (usersByServer.value[sUrl]?.[uKey]) {
        usersByServer.value[sUrl][uKey] = {
          ...usersByServer.value[sUrl][uKey],
          status: msg.status,
        };
        renderMembersSignal.value++;
      }
      break;
    }
    case "nickname_update": {
      const uKey = msg.username?.toLowerCase();
      if (usersByServer.value[sUrl]?.[uKey]) {
        usersByServer.value[sUrl][uKey] = {
          ...usersByServer.value[sUrl][uKey],
          nickname: msg.nickname,
        };
        renderMembersSignal.value++;
        renderMessagesSignal.value++;
      }
      break;
    }
    case "nickname_remove": {
      const uKey = msg.username?.toLowerCase();
      if (usersByServer.value[sUrl]?.[uKey]) {
        usersByServer.value[sUrl][uKey] = {
          ...usersByServer.value[sUrl][uKey],
        };
        delete usersByServer.value[sUrl][uKey].nickname;
        renderMembersSignal.value++;
        renderMessagesSignal.value++;
      }
      break;
    }

    case "voice_join": {
      const { voiceManager } = await import("../voice");
      voiceManager.onJoined(msg.channel, msg.participants || []);
      // Seed voice_state for the channel: server participant list + self at front
      const selfUsername = currentUserByServer.value[sUrl]?.username;
      _vcUpdateChannelState(sUrl, msg.channel, () => {
        const serverList = (msg.participants || []) as VoiceUser[];
        if (
          selfUsername &&
          !serverList.find((u) => u.username === selfUsername)
        ) {
          return [
            { username: selfUsername, muted: voiceManager.isMuted },
            ...serverList,
          ];
        }
        return serverList;
      });
      renderChannelsSignal.value++;
      break;
    }
    case "voice_user_joined": {
      const { voiceManager } = await import("../voice");
      voiceManager.onUserJoined(msg.channel, msg.user);
      _vcUpdateChannelState(sUrl, msg.channel, (prev) => {
        if (prev.find((u) => u.username === msg.user?.username)) return prev;
        return [
          ...prev,
          {
            username: msg.user.username,
            muted: msg.user.muted ?? false,
            pfp: msg.user.pfp,
          },
        ];
      });
      renderChannelsSignal.value++;
      break;
    }
    case "voice_user_left": {
      const { voiceManager } = await import("../voice");
      voiceManager.onUserLeft(msg.channel, msg.username);
      _vcUpdateChannelState(sUrl, msg.channel, (prev) =>
        prev.filter((u) => u.username !== msg.username),
      );
      renderChannelsSignal.value++;
      break;
    }
    case "voice_user_updated": {
      const { voiceManager } = await import("../voice");
      voiceManager.onUserUpdated(msg.channel, msg.user);
      _vcUpdateChannelState(sUrl, msg.channel, (prev) =>
        prev.map((u) =>
          u.username === msg.user?.username
            ? { ...u, muted: msg.user.muted }
            : u,
        ),
      );
      renderChannelsSignal.value++;
      break;
    }
    case "voice_leave": {
      // Server confirmed our leave — remove self from the channel sidebar.
      // voiceManager._cleanup() was already called locally in leaveChannel(),
      // but the sidebar voice_state needs updating here.
      const myUsername = currentUserByServer.value[sUrl]?.username;
      if (myUsername && msg.channel) {
        _vcUpdateChannelState(sUrl, msg.channel, (prev) =>
          prev.filter((u) => u.username !== myUsername),
        );
        renderChannelsSignal.value++;
      }
      break;
    }

    case "slash_list": {
      // Full command list for this server — replace the entire set.
      slashCommandsByServer.value = {
        ...slashCommandsByServer.value,
        [sUrl]: msg.commands || [],
      };
      break;
    }
    case "slash_add": {
      // One or more commands were registered — merge into the existing list.
      const incoming: any[] =
        msg.commands || (msg.command ? [msg.command] : []);
      if (incoming.length === 0) break;
      const existing = slashCommandsByServer.value[sUrl] || [];
      const merged = [...existing];
      for (const cmd of incoming) {
        const idx = merged.findIndex((c) => c.name === cmd.name);
        if (idx !== -1) {
          merged[idx] = cmd;
        } else {
          merged.push(cmd);
        }
      }
      slashCommandsByServer.value = {
        ...slashCommandsByServer.value,
        [sUrl]: merged,
      };
      break;
    }
    case "slash_remove": {
      // One or more commands were unregistered — remove them by name.
      const toRemove: string[] =
        msg.commands || (msg.command ? [msg.command] : []);
      if (toRemove.length === 0) break;
      const existing = slashCommandsByServer.value[sUrl] || [];
      slashCommandsByServer.value = {
        ...slashCommandsByServer.value,
        [sUrl]: existing.filter((c) => !toRemove.includes(c.name)),
      };
      break;
    }

    // ── Web Push responses ──────────────────────────────────────────────────
    case "push_vapid": {
      // Server sent its VAPID public key in response to push_get_vapid.
      // Complete the subscription flow.
      const vapidKey: string = msg.key || msg.vapid_key || msg.val;
      if (vapidKey) {
        subscribeToPushForServer(sUrl, vapidKey);
      } else {
        console.warn(`[Push] push_vapid from ${sUrl} had no key:`, msg);
      }
      break;
    }
    case "push_subscribed": {
      if (msg.success === false) {
        console.warn(`[Push] Server ${sUrl} rejected subscription.`);
        // Roll back the opt-in flag
        const next = { ...offlinePushServers.value };
        delete next[sUrl];
        offlinePushServers.value = next;
      }
      break;
    }

    case "error":
    case "err": {
      // Server-sent error — surface as a dismissible error banner.
      // Suppress "Unknown command: …" errors — these are expected when we
      // send opportunistic commands (e.g. list_pings, slash_list) to servers
      // that don't implement them yet.
      const errText: string =
        msg.val || msg.message || msg.error || "The server reported an error.";
      if (/^unknown command/i.test(errText)) {
        console.debug(`[${sUrl}] Unsupported command (ignored):`, errText);
        // If the server doesn't know push_get_vapid it doesn't support offline
        // push notifications. Roll back the opt-in and tell the user.
        if (/push_get_vapid/i.test(errText)) {
          const next = { ...offlinePushServers.value };
          delete next[sUrl];
          offlinePushServers.value = next;
          showBanner({
            kind: "error",
            serverUrl: sUrl,
            message: "This server does not support offline push notifications.",
            autoDismissMs: 8000,
          });
        }
        break;
      }
      // If a "dm add" is in flight and the DMS server says the user doesn't
      // exist, show a clear, friendly message instead of the raw server error.
      if (
        sUrl === DM_SERVER_URL &&
        pendingDMAddUsername &&
        /does not exist/i.test(errText)
      ) {
        const attempted = pendingDMAddUsername;
        setPendingDMAddUsername(null);
        showBanner({
          kind: "error",
          serverUrl: sUrl,
          message: `"${attempted}" is not on OriginChats. Make sure you have the right username.`,
          autoDismissMs: 8000,
        });
        console.error(`[${sUrl}] DM add failed — user not found:`, attempted);
        break;
      }
      // Clear pending DM state on any DMS error so it doesn't linger.
      if (sUrl === DM_SERVER_URL && pendingDMAddUsername) {
        setPendingDMAddUsername(null);
      }
      showBanner({
        kind: "error",
        serverUrl: sUrl,
        message: errText,
        autoDismissMs: 8000,
      });
      console.error(`[${sUrl}] Server error:`, errText);
      break;
    }
    case "ping":
      break;

    default:
      console.debug(`[${sUrl}] Unhandled message type:`, msg.cmd || msg.type);
  }
}

export function refreshCurrentChannel(): void {
  const sUrl = serverUrl.value;
  const channel = currentChannel.value;
  if (!sUrl || !channel || SPECIAL_CHANNELS.has(channel.name)) return;

  const conn = wsConnections[sUrl];
  if (conn?.status !== "connected") return;

  loadedChannelsByServer[sUrl]?.delete(channel.name);
  reachedOldestByServer[sUrl]?.delete(channel.name);
  startMessageFetch(sUrl, channel.name);
  wsSend({ cmd: "messages_get", channel: channel.name, limit: 30 }, sUrl);
}

let visibilityHandlerAdded = false;
export function setupVisibilityHandler(): void {
  if (visibilityHandlerAdded) return;
  visibilityHandlerAdded = true;

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshCurrentChannel();
    }
  });
}
