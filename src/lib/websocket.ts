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
  rolesByServer,
  slashCommandsByServer,
  pingSound,
  pingVolume,
  customPingSound,
  servers,
  readTimesByServer,
  offlinePushServers,
  pushSubscriptionsByServer,
  serverCapabilitiesByServer,
  SPECIAL_CHANNELS,
  myStatus,
  autoIdleOnUnfocus,
  savedStatusText,
} from "../state";
import {
  renderGuildSidebarSignal,
  renderChannelsSignal,
  renderMessagesSignal,
  renderMembersSignal,
  showBanner,
  dismissBanner,
  upsertBanner,
} from "./ui-signals";

// ── Reconnect config ──────────────────────────────────────────────────────────
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
const RECONNECT_MAX_ATTEMPTS = 5;

/** Stable banner IDs keyed by server URL so we can upsert them. */
const reconnectBannerIds: Record<string, string> = {};

import { generateValidator as generateValidatorApi } from "./rotur-api";
import {
  handleHandshake,
  handleReady,
  handleAuthSuccess,
  handleChannelsGet,
  handleThreadCreate,
  handleThreadDelete,
  handleThreadUpdate,
  handleThreadGet,
  handleThreadJoin,
  handleThreadLeave,
  handleUsersList,
  handleUsersOnline,
  handleStatusGet,
  handleMessagesGet,
  handleMessagesAround,
  setPendingJump,
  handleMessageGet,
  handleMessageEdit,
  handleMessageDelete,
  handleAttachmentDeleted,
  handleTyping,
  handleRolesList,
  handleRoleReorder,
  handleUserRolesSet,
  handleUserRolesGet,
  handleUsersBannedList,
  handleMessageReact,
  handleMessagesSearch,
  handlePingsGet,
  handleMessagesPinned,
  handleUserConnect,
  handleUserJoin,
  handleUserDisconnect,
  handleUserLeave,
  handleUserStatus,
  handleNicknameUpdate,
  handleNicknameRemove,
  handleUserUpdate,
  handleVoiceJoin,
  handleVoiceUserJoined,
  handleVoiceUserLeft,
  handleVoiceUserUpdated,
  handleVoiceLeave,
  handleSlashList,
  handleSlashAdd,
  handleSlashRemove,
  handleEmojiGetAll,
  handleEmojiAdd,
  handleEmojiDelete,
  handleEmojiUpdate,
  handlePushVapid,
  handlePushSubscribed,
  handleChannelUpdate,
  handleWebhookCreate,
  handleWebhookList,
  handleWebhookGet,
  handleWebhookUpdate,
  handleWebhookRegenerate,
  handleWebhookDelete,
  handleError,
  handleMessageNew,
  handlePollCreate,
  handlePollVote,
  handlePollVoteUpdate,
  handlePollEnd,
  handlePollResults,
  handlePollGet,
} from "./commands";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new window.AudioContext();
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

export function jumpToMessageAround(
  sUrl: string,
  channelName: string,
  messageId: string,
  threadId?: string,
): boolean {
  const caps = serverCapabilitiesByServer.value[sUrl] || [];
  const hasAround = caps.includes("messages_around");
  if (!hasAround) return false;

  const messageKey = threadId || channelName;
  if (messagesByServer.value[sUrl]?.[messageKey]) {
    messagesByServer.value = {
      ...messagesByServer.value,
      [sUrl]: {
        ...messagesByServer.value[sUrl],
        [messageKey]: [],
      },
    };
  }

  if (reachedOldestByServer[sUrl]?.has(messageKey)) {
    reachedOldestByServer[sUrl].delete(messageKey);
  }

  setPendingJump(sUrl, messageId, messageKey);

  const payload: any = {
    cmd: "messages_around",
    around: messageId,
    bounds: { above: 50, below: 50 },
  };

  if (threadId) {
    payload.thread_id = threadId;
  } else {
    payload.channel = channelName;
  }

  return wsSend(payload, sUrl);
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
  if (reconnectTimeouts[sUrl]) {
    clearTimeout(reconnectTimeouts[sUrl]);
    delete reconnectTimeouts[sUrl];
  }

  const attempt = (reconnectAttempts[sUrl] || 0) + 1;
  const isCurrentServer = serverUrl.value === sUrl;

  if (attempt > RECONNECT_MAX_ATTEMPTS) {
    if (isCurrentServer) {
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
    } else {
      wsStatus[sUrl] = "disconnected";
      renderGuildSidebarSignal.value++;
    }
    return;
  }

  reconnectAttempts[sUrl] = attempt;

  const delay =
    Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1),
      RECONNECT_MAX_DELAY_MS,
    ) / 2;

  const label = serverLabel(sUrl);

  if (isCurrentServer) {
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
  }

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

function handleMessage(msg: any, sUrl: string): void {
  switch (msg.cmd || msg.type) {
    case "handshake":
      handleHandshake(msg, sUrl);
      break;
    case "ready":
      handleReady(msg, sUrl);
      break;
    case "auth_success":
      handleAuthSuccess(sUrl);
      break;
    case "channels_get":
      handleChannelsGet(msg, sUrl);
      break;
    case "thread_create":
      handleThreadCreate(msg, sUrl);
      break;
    case "thread_delete":
      handleThreadDelete(msg, sUrl);
      break;
    case "thread_update":
      handleThreadUpdate(msg, sUrl);
      break;
    case "thread_get":
      handleThreadGet(msg);
      break;
    case "thread_join":
      handleThreadJoin(msg, sUrl);
      break;
    case "thread_leave":
      handleThreadLeave(msg, sUrl);
      break;
    case "users_list":
      handleUsersList(msg, sUrl);
      break;
    case "users_online":
      handleUsersOnline(msg, sUrl);
      break;
    case "status_get":
      handleStatusGet(msg, sUrl);
      break;
    case "message_new":
      handleMessageNew(msg, sUrl);
      break;
    case "messages_get":
      handleMessagesGet(msg, sUrl);
      break;
    case "messages_around":
      handleMessagesAround(msg, sUrl);
      break;
    case "message_get":
      handleMessageGet(msg, sUrl);
      break;
    case "message_edit":
      handleMessageEdit(msg, sUrl);
      break;
    case "message_delete":
      handleMessageDelete(msg, sUrl);
      break;
    case "attachment_deleted":
      handleAttachmentDeleted(msg);
      break;
    case "typing":
      handleTyping(msg, sUrl);
      break;
    case "roles_list":
      handleRolesList(msg, sUrl);
      break;
    case "role_reorder":
      handleRoleReorder(msg, sUrl);
      break;
    case "user_roles_set":
      handleUserRolesSet(msg, sUrl);
      break;
    case "user_roles_get":
      handleUserRolesGet(msg, sUrl);
      break;
    case "users_banned_list":
      handleUsersBannedList(msg, sUrl);
      break;
    case "message_react_add":
    case "message_react_remove":
      handleMessageReact(msg, sUrl);
      break;
    case "messages_search":
      handleMessagesSearch(msg);
      break;
    case "pings_get":
      handlePingsGet(msg);
      break;
    case "messages_pinned":
      handleMessagesPinned(msg);
      break;
    case "user_connect":
      handleUserConnect(msg, sUrl);
      break;
    case "user_join":
      handleUserJoin(msg, sUrl);
      break;
    case "user_disconnect":
      handleUserDisconnect(msg, sUrl);
      break;
    case "user_leave":
      handleUserLeave(msg, sUrl);
      break;
    case "user_status":
      handleUserStatus(msg, sUrl);
      break;
    case "user_update":
      handleUserUpdate(msg, sUrl);
      break;
    case "nickname_update":
      handleNicknameUpdate(msg, sUrl);
      break;
    case "nickname_remove":
      handleNicknameRemove(msg, sUrl);
      break;
    case "voice_join":
      handleVoiceJoin(msg, sUrl);
      break;
    case "voice_user_joined":
      handleVoiceUserJoined(msg, sUrl);
      break;
    case "voice_user_left":
      handleVoiceUserLeft(msg, sUrl);
      break;
    case "voice_user_updated":
      handleVoiceUserUpdated(msg, sUrl);
      break;
    case "voice_leave":
      handleVoiceLeave(msg, sUrl);
      break;
    case "slash_list":
      handleSlashList(msg, sUrl);
      break;
    case "slash_add":
      handleSlashAdd(msg, sUrl);
      break;
    case "slash_remove":
      handleSlashRemove(msg, sUrl);
      break;
    case "emoji_get_all":
      handleEmojiGetAll(msg, sUrl);
      break;
    case "emoji_add":
      handleEmojiAdd(msg, sUrl);
      break;
    case "emoji_delete":
      handleEmojiDelete(msg, sUrl);
      break;
    case "emoji_update":
      handleEmojiUpdate(msg, sUrl);
      break;
    case "push_vapid":
      handlePushVapid(msg, sUrl);
      break;
    case "push_subscribed":
      handlePushSubscribed(msg, sUrl);
      break;
    case "channel_update":
      handleChannelUpdate(msg, sUrl);
      break;
    case "webhook_create":
      handleWebhookCreate(msg, sUrl);
      break;
    case "webhook_list":
      handleWebhookList(msg, sUrl);
      break;
    case "webhook_get":
      handleWebhookGet(msg, sUrl);
      break;
    case "webhook_update":
      handleWebhookUpdate(msg, sUrl);
      break;
    case "webhook_regenerate":
      handleWebhookRegenerate(msg, sUrl);
      break;
    case "webhook_delete":
      handleWebhookDelete(msg, sUrl);
      break;
    case "error":
    case "err":
      handleError(msg, sUrl);
      break;
    case "poll_create":
      handlePollCreate(msg, sUrl);
      break;
    case "poll_vote":
      handlePollVote(msg, sUrl);
      break;
    case "poll_vote_update":
      handlePollVoteUpdate(msg, sUrl);
      break;
    case "poll_end":
      handlePollEnd(msg, sUrl);
      break;
    case "poll_results":
      handlePollResults(msg, sUrl);
      break;
    case "poll_get":
      handlePollGet(msg, sUrl);
      break;
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

  const threadId = currentThread.value?.id;

  if (threadId) {
    loadedChannelsByServer[sUrl]?.delete(threadId);
    reachedOldestByServer[sUrl]?.delete(threadId);
    startMessageFetch(sUrl, threadId);
    wsSend(
      {
        cmd: "messages_get",
        channel: channel.name,
        thread_id: threadId,
        limit: 30,
      },
      sUrl,
    );
  } else {
    loadedChannelsByServer[sUrl]?.delete(channel.name);
    reachedOldestByServer[sUrl]?.delete(channel.name);
    startMessageFetch(sUrl, channel.name);
    wsSend({ cmd: "messages_get", channel: channel.name, limit: 30 }, sUrl);
  }
}

let visibilityHandlerAdded = false;
let autoIdleActive = false;
let idleDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_DEBOUNCE_MS = 500;

export function setupVisibilityHandler(): void {
  if (visibilityHandlerAdded) return;
  visibilityHandlerAdded = true;

  document.addEventListener("visibilitychange", () => {
    if (autoIdleOnUnfocus.value) {
      if (document.hidden) {
        if (idleDebounceTimer) clearTimeout(idleDebounceTimer);
        idleDebounceTimer = setTimeout(() => {
          if (!autoIdleOnUnfocus.value) return;
          if (!document.hidden) return;
          if (myStatus.value.status === "online") {
            autoIdleActive = true;
            const currentText = myStatus.value.text;
            myStatus.value = { status: "idle", text: currentText };
            for (const sUrl of Object.keys(wsConnections)) {
              const caps = serverCapabilitiesByServer.value[sUrl] || [];
              if (caps.includes("status_set")) {
                wsSend(
                  {
                    cmd: "status_set",
                    status: "idle",
                    text: currentText,
                  },
                  sUrl,
                );
              }
            }
          }
          idleDebounceTimer = null;
        }, IDLE_DEBOUNCE_MS);
      } else {
        if (idleDebounceTimer) {
          clearTimeout(idleDebounceTimer);
          idleDebounceTimer = null;
        }
        if (autoIdleActive && myStatus.value.status === "idle") {
          autoIdleActive = false;
          myStatus.value = { status: "online", text: savedStatusText.value };
          for (const sUrl of Object.keys(wsConnections)) {
            const caps = serverCapabilitiesByServer.value[sUrl] || [];
            if (caps.includes("status_set")) {
              wsSend(
                {
                  cmd: "status_set",
                  status: "online",
                  text: savedStatusText.value,
                },
                sUrl,
              );
            }
          }
        }
      }
    }
    if (!document.hidden) {
      refreshCurrentChannel();
    }
  });
}
