import {
  serverUrl,
  currentChannel,
  channelsByServer,
  readTimesByServer,
  unreadByChannel,
  unreadPings,
  channels,
  currentUser,
  messagesByServer,
  loadedChannelsByServer,
  wsConnections,
  servers,
  wsStatus,
  usersByServer,
  currentUserByServer,
  serverPingsByServer,
  DM_SERVER_URL,
  SPECIAL_CHANNELS,
  setPendingDMAddUsername,
  blockedUsers,
  friends,
  friendRequests,
} from "../state";
import { renderGuildSidebarSignal, renderChannelsSignal } from "./ui-signals";
import {
  wsSend,
  closeWebSocket,
  startMessageFetch,
  finishMessageFetch,
} from "./websocket";
import { fetchMyAccountData, saveServers, saveReadTimes } from "./persistence";
import { session as dbSession, readTimes as dbReadTimes } from "./db";
import {
  getAuthRedirectUrl,
  sendFriendRequestApi,
  acceptFriendRequestApi,
  rejectFriendRequestApi,
  removeFriendApi,
  blockUserApi,
  unblockUserApi,
} from "./rotur-api";

export function selectChannel(channel: {
  name: string;
  type: string;
  display_name?: string;
}): void {
  if (!channel) return;

  currentChannel.value = channel as any;

  const sUrl = serverUrl.value;

  markChannelAsRead(channel.name);

  if (SPECIAL_CHANNELS.has(channel.name)) {
    renderChannelsSignal.value++;
    return;
  }

  // Persist the last-visited channel for this server
  try {
    dbSession.set(`lastChannel_${sUrl}`, channel.name);
  } catch {}

  const hasLoaded = loadedChannelsByServer[sUrl]?.has(channel.name) ?? false;
  if (!hasLoaded) {
    startMessageFetch(sUrl, channel.name);
    wsSend({ cmd: "messages_get", channel: channel.name, limit: 30 }, sUrl);
  }

  renderChannelsSignal.value++;
}

export function selectHomeChannel(): void {
  console.log("[selectHomeChannel] Selecting home channel");
  currentChannel.value = {
    name: "home",
    type: "home",
    display_name: "Home",
  } as any;
  renderChannelsSignal.value++;
}

export function selectRelationshipsChannel(): void {
  console.log("[selectRelationshipsChannel] Selecting relationships channel");
  currentChannel.value = {
    name: "relationships",
    type: "relationships",
    display_name: "Friends",
  } as any;
  renderChannelsSignal.value++;
}

export function selectDiscoveryChannel(): void {
  currentChannel.value = {
    name: "discovery",
    type: "discovery",
    display_name: "Discover",
  } as any;
  renderChannelsSignal.value++;
}

export async function switchServer(url: string): Promise<boolean> {
  console.log(`[switchServer] Switching to server: ${url}`);

  const connStatus = wsConnections[url]?.status;

  if (connStatus === "connected") {
    serverUrl.value = url;
    dbSession.set("serverUrl", url);
    renderGuildSidebarSignal.value++;
    renderChannelsSignal.value++;
    if (url === DM_SERVER_URL) {
      selectHomeChannel();
    } else {
      const saved = await dbSession.get<string>(`lastChannel_${url}`, "");
      const chs = channelsByServer.value[url] || [];
      if (chs.length > 0) {
        const textChannels = chs.filter(
          (c) =>
            c.type === "text" || c.type === "voice" || c.type === "category",
        );
        const target =
          (saved && textChannels.find((c) => c.name === saved)) ||
          textChannels[0];
        if (target) selectChannel(target);
      }
    }
    return true;
  }

  const { reconnectServer } = await import("./websocket");
  const connected = await reconnectServer(url);

  if (connected) {
    serverUrl.value = url;
    dbSession.set("serverUrl", url);
    renderGuildSidebarSignal.value++;
    renderChannelsSignal.value++;
    if (url === DM_SERVER_URL) {
      selectHomeChannel();
    } else {
      const saved = await dbSession.get<string>(`lastChannel_${url}`, "");
      const chs = channelsByServer.value[url] || [];
      if (chs.length > 0) {
        const target =
          (saved && chs.find((c: any) => c.name === saved)) || chs[0];
        if (target) selectChannel(target);
      }
    }
    return true;
  } else {
    console.error(`[switchServer] Failed to connect to ${url}`);
    return false;
  }
}

export function markChannelAsRead(channelName: string): void {
  const sUrl = serverUrl.value;
  if (!readTimesByServer.value[sUrl]) {
    readTimesByServer.value = { ...readTimesByServer.value, [sUrl]: {} };
  }
  const currentTime = Date.now() / 1000;
  readTimesByServer.value = {
    ...readTimesByServer.value,
    [sUrl]: {
      ...readTimesByServer.value[sUrl],
      [channelName]: currentTime,
    },
  };

  if (unreadByChannel.value[`${sUrl}:${channelName}`]) {
    const newUnreads = { ...unreadByChannel.value };
    delete newUnreads[`${sUrl}:${channelName}`];
    unreadByChannel.value = newUnreads;
  }

  const pingKey = `${sUrl}:${channelName}`;
  if (unreadPings.value[pingKey]) {
    const pingCount = unreadPings.value[pingKey];
    const newPings = { ...unreadPings.value };
    delete newPings[pingKey];
    unreadPings.value = newPings;

    const currentServerPings = serverPingsByServer.value[sUrl] || 0;
    serverPingsByServer.value = {
      ...serverPingsByServer.value,
      [sUrl]: Math.max(0, currentServerPings - pingCount),
    };
  }

  try {
    dbReadTimes.set(sUrl, readTimesByServer.value[sUrl] || {});
  } catch (e) {
    console.warn("[markChannelAsRead] Failed to save read times:", e);
  }

  saveReadTimes().catch((e) =>
    console.warn("[markChannelAsRead] Failed to sync read times to cloud:", e),
  );

  renderChannelsSignal.value++;
  renderGuildSidebarSignal.value++;
}

export function markServerAsRead(sUrl: string): void {
  console.log(`[markServerAsRead] Marking server ${sUrl} as read`);
  const serverChannels = channelsByServer.value[sUrl] || [];
  const currentTime = Date.now() / 1000;

  const newReadTimes = { ...readTimesByServer.value };
  if (!newReadTimes[sUrl]) {
    newReadTimes[sUrl] = {};
  }

  serverChannels.forEach((channel) => {
    newReadTimes[sUrl][channel.name] = currentTime;
  });

  readTimesByServer.value = newReadTimes;

  const newUnreads = { ...unreadByChannel.value };
  const newPings = { ...unreadPings.value };

  Object.keys(newUnreads).forEach((key) => {
    if (key.startsWith(`${sUrl}:`)) {
      delete newUnreads[key];
    }
  });

  serverChannels.forEach((channel) => {
    delete newPings[`${sUrl}:${channel.name}`];
  });

  unreadByChannel.value = newUnreads;
  unreadPings.value = newPings;

  serverPingsByServer.value = {
    ...serverPingsByServer.value,
    [sUrl]: 0,
  };

  try {
    dbReadTimes.set(sUrl, readTimesByServer.value[sUrl] || {});
  } catch (e) {
    console.warn("[markServerAsRead] Failed to save read times:", e);
  }

  saveReadTimes().catch((e) =>
    console.warn("[markServerAsRead] Failed to sync read times to cloud:", e),
  );

  renderChannelsSignal.value++;
  renderGuildSidebarSignal.value++;
}

export function removeServer(sUrl: string): void {
  console.log(`[removeServer] Removing server ${sUrl}`);

  const wasCurrentServer = serverUrl.value === sUrl;

  const updatedServers = servers.value.filter((s) => s.url !== sUrl);
  servers.value = updatedServers;

  saveServers().catch((err) =>
    console.error("[removeServer] Failed to save servers:", err),
  );

  const serverChannels = channelsByServer.value[sUrl] || [];

  const newChannels = { ...channelsByServer.value };
  delete newChannels[sUrl];
  channelsByServer.value = newChannels;

  const newMessages = { ...messagesByServer.value };
  delete newMessages[sUrl];
  messagesByServer.value = newMessages;

  const newUsers = { ...usersByServer.value };
  delete newUsers[sUrl];
  usersByServer.value = newUsers;

  const newCurrentUser = { ...currentUserByServer.value };
  delete newCurrentUser[sUrl];
  currentUserByServer.value = newCurrentUser;

  const newReadTimes = { ...readTimesByServer.value };
  delete newReadTimes[sUrl];
  readTimesByServer.value = newReadTimes;

  const newUnreads = { ...unreadByChannel.value };
  Object.keys(newUnreads).forEach((key) => {
    if (key.startsWith(`${sUrl}:`)) {
      delete newUnreads[key];
    }
  });
  unreadByChannel.value = newUnreads;

  const newPings = { ...unreadPings.value };
  serverChannels.forEach((channel) => {
    delete newPings[`${sUrl}:${channel.name}`];
  });
  unreadPings.value = newPings;

  closeWebSocket(sUrl);
  delete wsStatus[sUrl];

  if (wasCurrentServer) {
    const remainingServers = servers.value;
    if (remainingServers.length > 0) {
      switchServer(remainingServers[0].url);
    } else {
      switchServer(DM_SERVER_URL);
    }
  }

  renderGuildSidebarSignal.value++;
  renderChannelsSignal.value++;
}

export function logout(): void {
  dbSession.del("token");
  window.location.href = getAuthRedirectUrl(window.location.href);
}

// ============= DM ACTIONS =============

export async function openDMWith(username: string): Promise<void> {
  if (serverUrl.value !== DM_SERVER_URL) {
    await switchServer(DM_SERVER_URL);
  }
  const dmChannels = channelsByServer.value[DM_SERVER_URL] || [];
  const existingChannel = dmChannels.find(
    (ch: any) => ch.display_name?.toLowerCase() === username.toLowerCase(),
  );
  if (existingChannel) {
    selectChannel(existingChannel);
  } else {
    setPendingDMAddUsername(username);
    wsSend(
      { cmd: "message_new", content: `dm add ${username}`, channel: "cmds" },
      DM_SERVER_URL,
    );
  }
}

// ============= SOCIAL ACTIONS =============

export async function sendFriendRequest(username: string): Promise<void> {
  await sendFriendRequestApi(username);
  // Outgoing requests aren't tracked in local state; nothing to update.
}

export async function removeFriend(username: string): Promise<void> {
  await removeFriendApi(username);
  friends.value = friends.value.filter((f) => f !== username);
}

export async function acceptFriend(username: string): Promise<void> {
  await acceptFriendRequestApi(username);
  friendRequests.value = friendRequests.value.filter((r) => r !== username);
  if (!friends.value.includes(username)) {
    friends.value = [...friends.value, username];
  }
}

export async function denyFriend(username: string): Promise<void> {
  await rejectFriendRequestApi(username);
  friendRequests.value = friendRequests.value.filter((r) => r !== username);
}

export async function blockUser(username: string): Promise<void> {
  await blockUserApi(username);
  if (!blockedUsers.value.includes(username)) {
    blockedUsers.value = [...blockedUsers.value, username];
  }
  friends.value = friends.value.filter((f) => f !== username);
  friendRequests.value = friendRequests.value.filter((r) => r !== username);
}

export async function unblockUser(username: string): Promise<void> {
  await unblockUserApi(username);
  blockedUsers.value = blockedUsers.value.filter((u) => u !== username);
}
