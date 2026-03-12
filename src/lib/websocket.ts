import {
  token,
  serverUrl,
  currentChannel,
  channelsByServer,
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
  serverPingsByServer,
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
} from "../state";

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

import type { VoiceUser } from "../types";
import { generateValidator as generateValidatorApi } from "./rotur-api";

let audioCtx: AudioContext | null = null;

// Helper: immutably update voice_state for a channel in channelsByServer
function _vcUpdateChannelState(
  sUrl: string,
  channelName: string,
  updater: (prev: VoiceUser[]) => VoiceUser[],
): void {
  const chList = channelsByServer.value[sUrl];
  if (!chList) return;
  const idx = chList.findIndex((c: any) => c.name === channelName);
  if (idx === -1) return;
  const prev: VoiceUser[] = (chList[idx] as any).voice_state || [];
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

const pingRegex = /@[\w-]+/gi;

const CONNECTION_TIMEOUT = 5000;
const pendingMessageFetchesByServer: Record<
  string,
  Record<string, boolean>
> = {};

function isFetchingMessages(sUrl: string, channelName: string): boolean {
  return pendingMessageFetchesByServer[sUrl]?.[channelName] || false;
}

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
  // Cancel any pending reconnect so we don't reconnect an intentionally-closed socket
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

export { authenticateServer };

function getServerStatus(
  sUrl: string,
): "connecting" | "connected" | "disconnected" | "error" {
  return wsConnections[sUrl]?.status || "error";
}

export async function reconnectServer(sUrl: string): Promise<boolean> {
  // Cancel any pending auto-reconnect timer
  if (reconnectTimeouts[sUrl]) {
    clearTimeout(reconnectTimeouts[sUrl]);
    delete reconnectTimeouts[sUrl];
  }
  // Dismiss any existing reconnect banner
  const bannerId = reconnectBannerIds[sUrl] || `reconnect-${sUrl}`;
  dismissBanner(bannerId);
  delete reconnectBannerIds[sUrl];
  reconnectAttempts[sUrl] = 0;

  // Clear all cached message state for this server
  messagesByServer.value = { ...messagesByServer.value, [sUrl]: {} };
  if (loadedChannelsByServer[sUrl]) {
    loadedChannelsByServer[sUrl].clear();
  }
  if (reachedOldestByServer[sUrl]) {
    reachedOldestByServer[sUrl].clear();
  }

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

  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1),
    RECONNECT_MAX_DELAY_MS,
  );

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

export function connectToServer(sUrl: string, manual = false): void {
  if (reconnectTimeouts[sUrl]) {
    clearTimeout(reconnectTimeouts[sUrl]);
    reconnectTimeouts[sUrl] = 0;
  }

  // Clear all cached message state for this server
  messagesByServer.value = { ...messagesByServer.value, [sUrl]: {} };
  if (loadedChannelsByServer[sUrl]) {
    loadedChannelsByServer[sUrl].clear();
  }
  if (reachedOldestByServer[sUrl]) {
    reachedOldestByServer[sUrl].clear();
  }

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
      if (msg.val.server?.icon) {
        const existing = servers.value.find((s) => s.url === sUrl);
        if (existing && existing.icon !== msg.val.server.icon) {
          servers.value = servers.value.map((s) =>
            s.url === sUrl ? { ...s, icon: msg.val.server.icon } : s,
          );
          const { saveServers } = await import("./persistence");
          saveServers().catch(() => {});
        }
      }
      renderGuildSidebarSignal.value++;
      await authenticateServer(sUrl);
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
      wsSend({ cmd: "channels_get" }, sUrl);
      wsSend({ cmd: "users_list" }, sUrl);
      wsSend({ cmd: "users_online" }, sUrl);
      wsSend({ cmd: "roles_list" }, sUrl);
      // Request slash commands — not all servers support this, so we send
      // it opportunistically and handle it only if the server responds.
      wsSend({ cmd: "slash_list" }, sUrl);
      // Request pings since the earliest unread read-time for this server.
      // We use the minimum read-time across all known channels so we don't
      // miss pings in channels that haven't been opened in a while. Channels
      // with no read-time entry default to 0 (beginning of time) but we only
      // include them if the server has channel data; the response handler
      // filters each ping against its channel's specific read-time.
      if (sUrl !== DM_SERVER_URL) {
        const channelReadTimes = readTimesByServer.value[sUrl] || {};
        const readValues = Object.values(channelReadTimes);
        // Use the minimum (oldest) read-time so we catch pings in all
        // channels the user hasn't visited since that time.
        const since =
          readValues.length > 0 ? Math.min(...(readValues as number[])) : 0;
        wsSend({ cmd: "list_pings", since }, sUrl);
      }
      break;
    }
    case "channels_get":
      channelsByServer.value = { ...channelsByServer.value, [sUrl]: msg.val };
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
      break;
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
      const channelIsLoaded =
        loadedChannelsByServer[sUrl]?.has(msg.channel) ?? false;
      if (channelIsLoaded) {
        if (!messagesByServer.value[sUrl])
          messagesByServer.value = { ...messagesByServer.value, [sUrl]: {} };
        if (!messagesByServer.value[sUrl][msg.channel]) {
          messagesByServer.value = {
            ...messagesByServer.value,
            [sUrl]: { ...messagesByServer.value[sUrl], [msg.channel]: [] },
          };
        }
        const channelMsgs = messagesByServer.value[sUrl][msg.channel];
        const alreadyExists = channelMsgs.some(
          (m: any) => m.id === msg.message.id,
        );
        if (!alreadyExists) {
          messagesByServer.value = {
            ...messagesByServer.value,
            [sUrl]: {
              ...messagesByServer.value[sUrl],
              [msg.channel]: [...channelMsgs, msg.message],
            },
          };
        }
      }

      const chList = channelsByServer.value[sUrl];
      if (chList) {
        const idx = chList.findIndex((c: any) => c.name === msg.channel);
        if (idx !== -1 && msg.message.timestamp) {
          const updatedList = [...chList];
          updatedList[idx] = {
            ...updatedList[idx],
            last_message: msg.message.timestamp,
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

      const isCurrentView =
        serverUrl.value === sUrl && msg.channel === currentChannel.value?.name;

      const notifLevel = getChannelNotifLevel(sUrl, msg.channel);
      const isMuted = notifLevel === "none";
      const channelKey = `${sUrl}:${msg.channel}`;

      if (!isCurrentView && !isMuted) {
        unreadByChannel.value = {
          ...unreadByChannel.value,
          [channelKey]: (unreadByChannel.value[channelKey] || 0) + 1,
        };

        if (
          sUrl === DM_SERVER_URL &&
          msg.message.user !== currentUserByServer.value[sUrl]?.username &&
          dmMessageSound.value
        ) {
          playPingSound();
        }

        // "all" mode: treat every incoming message as a ping
        if (notifLevel === "all") {
          const myUsername = currentUserByServer.value[sUrl]?.username;
          if (msg.message.user !== myUsername) {
            unreadPings.value = {
              ...unreadPings.value,
              [channelKey]: (unreadPings.value[channelKey] || 0) + 1,
            };
            serverPingsByServer.value = {
              ...serverPingsByServer.value,
              [sUrl]: (serverPingsByServer.value[sUrl] || 0) + 1,
            };
            playPingSound();
            if (serverUrl.value === sUrl) renderChannelsSignal.value++;
            renderGuildSidebarSignal.value++;
          }
        }

        // If this DM channel isn't in the sidebar list yet, add it so the
        // sender appears with an unread badge without needing a dm_list event.
        if (sUrl === DM_SERVER_URL) {
          const alreadyListed = dmServers.value.some(
            (d: any) => d.channel === msg.channel,
          );
          if (!alreadyListed) {
            const senderUsername = msg.message.user as string;
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

        if (serverUrl.value === sUrl) renderChannelsSignal.value++;
        renderGuildSidebarSignal.value++;
      } else if (isCurrentView) {
        const msgTimestamp =
          typeof msg.message.timestamp === "number"
            ? msg.message.timestamp
            : Date.now() / 1000;

        readTimesByServer.value = {
          ...readTimesByServer.value,
          [sUrl]: {
            ...(readTimesByServer.value[sUrl] ?? {}),
            [msg.channel]: msgTimestamp,
          },
        };

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
            (d: any) => d.channel === msg.channel,
          );
          if (!alreadyListed) {
            const senderUsername = msg.message.user as string;
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

      const myUsername = currentUserByServer.value[sUrl]?.username;
      // Only process mention/reply pings when not muted and not already in "all" mode
      // ("all" already counted every message as a ping above).
      if (
        myUsername &&
        msg.message.user !== myUsername &&
        !isMuted &&
        notifLevel !== "all"
      ) {
        const content = (msg.message.content || "").toLowerCase();
        const matches = content.match(pingRegex);
        if (matches) {
          const pings = matches.filter(
            (m: string) =>
              m.trim().toLowerCase() === "@" + myUsername.toLowerCase(),
          );
          if (pings.length > 0) {
            if (!isCurrentView) {
              unreadPings.value = {
                ...unreadPings.value,
                [channelKey]: (unreadPings.value[channelKey] || 0) + 1,
              };
              if (serverUrl.value === sUrl) renderChannelsSignal.value++;
            }
            playPingSound();
            const cleanContent = (msg.message.content || "").replace(
              /<[^>]*>/g,
              "",
            );
            const notifBody =
              cleanContent.length > 100
                ? cleanContent.substring(0, 100) + "..."
                : cleanContent;
            showNotification(
              `${msg.message.user} mentioned you in #${msg.channel}`,
              notifBody,
              msg.channel,
            );
            serverPingsByServer.value = {
              ...serverPingsByServer.value,
              [sUrl]: (serverPingsByServer.value[sUrl] || 0) + 1,
            };
            renderGuildSidebarSignal.value++;
          }
        }

        if (
          msg.message.reply_to &&
          msg.message.ping !== false &&
          messagesByServer.value[sUrl]?.[msg.channel]
        ) {
          const originalMsg = messagesByServer.value[sUrl][msg.channel].find(
            (m: any) => m.id === msg.message.reply_to?.id,
          );
          if (originalMsg && originalMsg.user === myUsername) {
            if (!isCurrentView) {
              unreadPings.value = {
                ...unreadPings.value,
                [channelKey]: (unreadPings.value[channelKey] || 0) + 1,
              };
              if (serverUrl.value === sUrl) renderChannelsSignal.value++;
            }
            playPingSound();
            const cleanContent = (msg.message.content || "").replace(
              /<[^>]*>/g,
              "",
            );
            const notifBody =
              cleanContent.length > 100
                ? cleanContent.substring(0, 100) + "..."
                : cleanContent;
            showNotification(
              `${msg.message.user} replied to your message in #${msg.channel}`,
              notifBody,
              msg.channel,
            );
          }
        }
      }

      const typingServer = typingUsersByServer.value[sUrl];
      if (typingServer && typingServer[msg.channel]) {
        const typing = typingServer[msg.channel] as Map<string, number>;
        if (typing.has(msg.message.user)) {
          typing.delete(msg.message.user);
        }
      }

      renderMessagesSignal.value++;
      break;
    }
    case "messages_get": {
      if (!messagesByServer.value[sUrl])
        messagesByServer.value = { ...messagesByServer.value, [sUrl]: {} };

      const channel = msg.channel;

      finishMessageFetch(sUrl, channel);

      // Mark this channel as loaded so future message_new events are stored
      if (!loadedChannelsByServer[sUrl])
        loadedChannelsByServer[sUrl] = new Set();
      loadedChannelsByServer[sUrl].add(channel);

      const existingMsgs = messagesByServer.value[sUrl][channel] || [];

      const newMessages = (msg.messages || []).map((m: any) => {
        if (m.reactions && typeof m.reactions === "object") {
          const normalised: Record<string, string[]> = {};
          for (const [emoji, reactors] of Object.entries(m.reactions)) {
            normalised[emoji] = (reactors as any[]).map((u) =>
              typeof u === "object" && u !== null
                ? (u.username ?? String(u))
                : String(u),
            );
          }
          return { ...m, reactions: normalised };
        }
        return m;
      });

      const existingIds = new Set(existingMsgs.map((m: any) => m.id));
      const deduplicatedNew = newMessages.filter(
        (m: any) => !existingIds.has(m.id),
      );
      const mergedMsgs = [...deduplicatedNew, ...existingMsgs];

      // If this was a pagination (scroll-up) fetch and the server returned fewer
      // messages than the requested limit, we've reached the beginning of history.
      const SCROLL_UP_LIMIT = 20;
      if (existingMsgs.length > 0 && newMessages.length < SCROLL_UP_LIMIT) {
        if (!reachedOldestByServer[sUrl])
          reachedOldestByServer[sUrl] = new Set();
        reachedOldestByServer[sUrl].add(channel);
      }

      messagesByServer.value = {
        ...messagesByServer.value,
        [sUrl]: {
          ...messagesByServer.value[sUrl],
          [channel]: mergedMsgs,
        },
      };

      renderMessagesSignal.value++;

      console.log(
        `[messages_get] Received ${newMessages.length} messages for channel ${channel}. Total: ${mergedMsgs.length}`,
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
      const channel = msg.channel;
      const message = msg.message;
      if (!channel || !message) break;
      pendingReplyFetchesByServer[sUrl]?.delete(message.id);
      if (!messagesByServer.value[sUrl][channel]) {
        messagesByServer.value = {
          ...messagesByServer.value,
          [sUrl]: { ...messagesByServer.value[sUrl], [channel]: [] },
        };
      }
      const existingMsgs = messagesByServer.value[sUrl][channel];
      const alreadyExists = existingMsgs.some((m: any) => m.id === message.id);
      if (!alreadyExists) {
        const insertIdx = existingMsgs.findIndex(
          (m: any) => m.timestamp > message.timestamp,
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
          [sUrl]: { ...messagesByServer.value[sUrl], [channel]: newMsgs },
        };
        renderMessagesSignal.value++;
      }
      break;
    }
    case "message_edit": {
      if (!messagesByServer.value[sUrl]?.[msg.channel]) break;
      const editedMsgs = messagesByServer.value[sUrl][msg.channel].map((m) =>
        m.id === msg.id ? { ...m, content: msg.content, edited: true } : m,
      );
      messagesByServer.value = {
        ...messagesByServer.value,
        [sUrl]: { ...messagesByServer.value[sUrl], [msg.channel]: editedMsgs },
      };
      renderMessagesSignal.value++;
      break;
    }
    case "message_delete": {
      if (!messagesByServer.value[sUrl]?.[msg.channel]) break;
      const filteredMsgs = messagesByServer.value[sUrl][msg.channel].filter(
        (m) => m.id !== msg.id,
      );
      messagesByServer.value = {
        ...messagesByServer.value,
        [sUrl]: {
          ...messagesByServer.value[sUrl],
          [msg.channel]: filteredMsgs,
        },
      };
      renderMessagesSignal.value++;
      break;
    }
    case "typing": {
      const { channel, user } = msg;
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
      const roles: Record<string, any> = msg.roles || {};
      rolesByServer.value = { ...rolesByServer.value, [sUrl]: roles };
      break;
    }
    case "dm_list":
    case "dms_list": {
      if (msg.dms && Array.isArray(msg.dms)) {
        dmServers.value = msg.dms;
        renderGuildSidebarSignal.value++;
      }
      break;
    }
    case "friends_list": {
      const {
        friends: friendsList,
        friendRequests: requestsList,
        blockedUsers: blockedList,
      } = await import("../state");
      if (msg.friends) friendsList.value = msg.friends;
      if (msg.requests) requestsList.value = msg.requests;
      if (msg.blocked) blockedList.value = msg.blocked;
      break;
    }
    case "message_react_add":
    case "message_react_remove": {
      if (!messagesByServer.value[sUrl]?.[msg.channel]) break;
      const reactMsg = messagesByServer.value[sUrl][msg.channel].find(
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
    case "pin_message":
    case "message_pin": {
      if (!messagesByServer.value[sUrl]?.[msg.channel]) break;
      const pinMsg = messagesByServer.value[sUrl][msg.channel].find(
        (m: any) => m.id === msg.id,
      );
      if (pinMsg) {
        pinMsg.pinned = msg.pinned !== undefined ? msg.pinned : true;
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
        serverPingsByServer.value = {
          ...serverPingsByServer.value,
          [sUrl]: (serverPingsByServer.value[sUrl] || 0) + totalNew,
        };
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
  }
}
