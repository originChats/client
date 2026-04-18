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
  servers,
  readTimesByServer,
  serverCapabilitiesByServer,
  serverAuthModeByServer,
  SPECIAL_CHANNELS,
  myStatus,
  autoIdleOnUnfocus,
  savedStatusText,
  isSpecialChannel,
  unreadState,
} from "../state";
import {
  renderGuildSidebarSignal,
  renderChannelsSignal,
  renderMessagesSignal,
  renderMembersSignal,
  showBanner,
  dismissBanner,
  upsertBanner,
  pendingCrackedCredentials,
} from "./ui-signals";
import { wsSend, startMessageFetch } from "./ws-sender";

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
  handleAuthError,
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
  handleUnreadsGet,
  handleUnreadsCount,
  handleUnreadsUpdate,
  handleUnreadsAck,
} from "./commands";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new window.AudioContext();
  }
  return audioCtx;
}

export function cleanupAudioContext(): void {
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close();
    audioCtx = null;
  }
}

const CONNECTION_TIMEOUT = 5000;

const pendingReplyFetchesByServer: Record<string, Set<string>> = {};

export function fetchMissingReplyMessage(
  sUrl: string,
  channelName: string,
  replyToId: string
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
  threadId?: string
): boolean {
  const caps = serverCapabilitiesByServer.read(sUrl) || [];
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

function closeWebSocketInternal(url: string): void {
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
    if (conn.closeHandler) conn.socket.removeEventListener("close", conn.closeHandler);
    if (conn.errorHandler) conn.socket.removeEventListener("error", conn.errorHandler);
    if (conn.socket.readyState !== WebSocket.CLOSED) conn.socket.close();
  }
  delete wsConnections[url];
  delete wsStatus[url];
}

function clearServerState(sUrl: string): void {
  channelsByServer.delete(sUrl);

  messagesByServer.value = Object.fromEntries(
    Object.entries(messagesByServer.value).filter(([key]) => key !== sUrl)
  );

  threadsByServer.delete(sUrl);

  threadMessagesByServer.delete(sUrl);

  usersByServer.delete(sUrl);

  currentUserByServer.delete(sUrl);

  rolesByServer.delete(sUrl);

  slashCommandsByServer.delete(sUrl);

  typingUsersByServer.delete(sUrl);

  serverCapabilitiesByServer.delete(sUrl);

  serverAuthModeByServer.delete(sUrl);

  delete loadedChannelsByServer[sUrl];
  delete reachedOldestByServer[sUrl];
  delete pendingReplyFetchesByServer[sUrl];

  readTimesByServer.delete(sUrl);

  if (pendingCrackedCredentials.value?.serverUrl === sUrl) {
    pendingCrackedCredentials.value = null;
  }

  renderChannelsSignal.value++;
  renderMessagesSignal.value++;
  renderMembersSignal.value++;
}

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
        ws.addEventListener("message", (event) => handleMessage(JSON.parse(event.data), sUrl));
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
    Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1), RECONNECT_MAX_DELAY_MS) / 2;

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
      if (existing.socket.readyState !== WebSocket.CLOSED) existing.socket.close();
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
  ws.addEventListener("message", (event) => handleMessage(JSON.parse(event.data), sUrl));
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
    case "auth_error":
      handleAuthError(msg, sUrl);
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
      handleMessageReact(msg, sUrl);
      break;
    case "message_react_remove":
      handleMessageReact(msg, sUrl);
      break;
    case "messages_search":
      handleMessagesSearch(msg);
      break;
    case "pings_get":
      handlePingsGet(msg, sUrl);
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
    case "unreads_get":
      handleUnreadsGet(msg, sUrl);
      break;
    case "unreads_count":
      handleUnreadsCount(msg, sUrl);
      break;
    case "unreads_ack":
      handleUnreadsAck(msg, sUrl);
      break;
    case "unreads_update":
      handleUnreadsUpdate(msg, sUrl);
      break;
    case "ping":
      break;
    default:
      console.debug(`[${sUrl}] Unhandled message type:`, msg.cmd || msg.type);
  }
}
function refreshCurrentChannel(): void {
  const sUrl = serverUrl.value;
  const channel = currentChannel.value;
  if (!sUrl || !channel || isSpecialChannel(channel.name, sUrl)) return;

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
      sUrl
    );
  } else {
    loadedChannelsByServer[sUrl]?.delete(channel.name);
    reachedOldestByServer[sUrl]?.delete(channel.name);
    startMessageFetch(sUrl, channel.name);
    wsSend({ cmd: "messages_get", channel: channel.name, limit: 30 }, sUrl);
  }
}

let visibilityHandler: (() => void) | null = null;
let autoIdleActive = false;
let idleDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_DEBOUNCE_MS = 500;

export function setupVisibilityHandler(): void {
  if (visibilityHandler) return;

  visibilityHandler = () => {
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
              const caps = serverCapabilitiesByServer.read(sUrl) || [];
              if (caps.includes("status_set")) {
                wsSend(
                  {
                    cmd: "status_set",
                    status: "idle",
                    text: currentText,
                  },
                  sUrl
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
            const caps = serverCapabilitiesByServer.read(sUrl) || [];
            if (caps.includes("status_set")) {
              wsSend(
                {
                  cmd: "status_set",
                  status: "online",
                  text: savedStatusText.value,
                },
                sUrl
              );
            }
          }
        }
      }
    }
    if (!document.hidden) {
      const sUrl = serverUrl.value;
      const ch = currentChannel.value;
      if (sUrl && ch && !isSpecialChannel(ch.name, sUrl)) {
        const key = currentThread.value ? `thread:${currentThread.value.id}` : ch.name;
        unreadState.clearChannel(sUrl, key);
      }
      refreshCurrentChannel();
    }
  };

  document.addEventListener("visibilitychange", visibilityHandler);
}

export function cleanupVisibilityHandler(): void {
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  if (idleDebounceTimer) {
    clearTimeout(idleDebounceTimer);
    idleDebounceTimer = null;
  }
  autoIdleActive = false;
  cleanupAudioContext();
}

export { wsSend } from "./ws-sender";
