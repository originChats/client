import {
  serverUrl,
  currentChannel,
  currentThread,
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
  threadsByServer,
  lastChannelByServer,
  DM_SERVER_URL,
  SPECIAL_CHANNELS,
  setPendingDMAddUsername,
  blockedUsers,
  friends,
  dmServers,
  friendRequests,
  clearChannelPings,
  clearServerPings,
  myStatus,
  serverCapabilitiesByServer,
} from "../state";
import {
  renderGuildSidebarSignal,
  renderChannelsSignal,
  renderMessagesSignal,
} from "./ui-signals";
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

  // Clear thread selection when selecting a non-thread channel
  if (channel.type !== "thread") {
    currentThread.value = null;
  }

  const sUrl = serverUrl.value;

  markChannelAsRead(channel.name);

  if (SPECIAL_CHANNELS.has(channel.name)) {
    renderChannelsSignal.value++;
    return;
  }

  // Don't fetch messages for forum channels - they use threads instead
  if (channel.type === "forum") {
    renderChannelsSignal.value++;
    renderMessagesSignal.value++;
    updateUrlFromState();
    return;
  }

  // Persist the last-visited channel for this server
  lastChannelByServer.value = {
    ...lastChannelByServer.value,
    [sUrl]: channel.name,
  };
  try {
    dbSession.set(`lastChannel_${sUrl}`, channel.name);
  } catch {}

  const hasLoaded = loadedChannelsByServer[sUrl]?.has(channel.name) ?? false;
  if (!hasLoaded) {
    startMessageFetch(sUrl, channel.name);
    wsSend({ cmd: "messages_get", channel: channel.name, limit: 30 }, sUrl);
  }

  renderChannelsSignal.value++;
  updateUrlFromState();
}

export function selectHomeChannel(): void {
  console.log("[selectHomeChannel] Selecting home channel");
  currentChannel.value = {
    name: "home",
    type: "home",
    display_name: "Home",
  } as any;
  renderChannelsSignal.value++;
  updateUrlFromState();
}

export function selectRelationshipsChannel(): void {
  console.log("[selectRelationshipsChannel] Selecting relationships channel");
  currentChannel.value = {
    name: "relationships",
    type: "relationships",
    display_name: "Friends",
  } as any;
  renderChannelsSignal.value++;
  updateUrlFromState();
}

export function selectDiscoveryChannel(): void {
  currentChannel.value = {
    name: "discovery",
    type: "discovery",
    display_name: "Discover",
  } as any;
  renderChannelsSignal.value++;
  updateUrlFromState();
}

export function selectRolesChannel(): void {
  currentChannel.value = {
    name: "roles",
    type: "roles",
    display_name: "Roles",
  } as any;
  renderChannelsSignal.value++;
  updateUrlFromState();
  wsSend({ cmd: "self_roles_list" }, serverUrl.value);
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

  clearChannelPings(sUrl, channelName);

  try {
    dbReadTimes.set(sUrl, readTimesByServer.value[sUrl] || {});
  } catch (e) {
    console.warn("[markChannelAsRead] Failed to save read times:", e);
  }

  saveReadTimes().catch((e) =>
    console.warn("[markChannelAsRead] Failed to sync read times to cloud:", e),
  );
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

  clearServerPings(sUrl);

  try {
    dbReadTimes.set(sUrl, readTimesByServer.value[sUrl] || {});
  } catch (e) {
    console.warn("[markServerAsRead] Failed to save read times:", e);
  }

  saveReadTimes().catch((e) =>
    console.warn("[markServerAsRead] Failed to sync read times to cloud:", e),
  );
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

// ============= THREAD ACTIONS =============

export function createThread(channel: string, name: string): void {
  wsSend({ cmd: "thread_create", channel, name }, serverUrl.value);
}

export function deleteThread(threadId: string): void {
  wsSend({ cmd: "thread_delete", thread_id: threadId }, serverUrl.value);
}

export function joinThread(threadId: string): void {
  wsSend({ cmd: "thread_join", thread_id: threadId }, serverUrl.value);
}

export function leaveThread(threadId: string): void {
  wsSend({ cmd: "thread_leave", thread_id: threadId }, serverUrl.value);
}

export function getThread(threadId: string): void {
  wsSend({ cmd: "thread_get", thread_id: threadId }, serverUrl.value);
}

function updateUrlFromState(): void {
  const sUrl = serverUrl.value;
  const channel = currentChannel.value as any;
  const thread = currentThread.value;

  if (!sUrl) return;

  const baseUrl = `${window.location.protocol}//${window.location.host}`;
  let newPath = `/app/${encodeURIComponent(sUrl)}`;

  if (channel) {
    if (channel.type === "thread" && channel.parent_channel) {
      newPath += `/${encodeURIComponent(channel.parent_channel)}`;
    } else {
      newPath += `/${encodeURIComponent(channel.name)}`;
    }
    if (thread) {
      newPath += `/${encodeURIComponent(thread.id)}`;
    }
  }

  if (window.location.pathname !== newPath) {
    window.history.replaceState({}, document.title, newPath);
  }
}

export function navigateFromUrl(): void {
  const path = window.location.pathname;
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "app" && parts[1]) {
    const targetServer = decodeURIComponent(parts[1]);
    const targetChannel = parts[2] ? decodeURIComponent(parts[2]) : null;
    const targetThread = parts[3] ? decodeURIComponent(parts[3]) : null;

    if (targetServer !== serverUrl.value) {
      switchServer(targetServer).then(() => {
        selectChannelFromUrl(targetChannel, targetThread);
      });
    } else {
      selectChannelFromUrl(targetChannel, targetThread);
    }
  } else {
    selectHomeChannel();
  }
}

function selectChannelFromUrl(
  channelName: string | null,
  threadId: string | null,
): void {
  if (!channelName) {
    selectHomeChannel();
    return;
  }

  const sUrl = serverUrl.value;
  const serverChannels = channelsByServer.value[sUrl];
  const channel = serverChannels?.find((c) => c.name === channelName);

  if (!channel) return;

  if (channel.type === "forum") {
    selectChannel(channel);
    if (threadId) {
      const forumThreads = threadsByServer.value[sUrl]?.[channelName] || [];
      const thread = forumThreads.find((t) => t.id === threadId);
      if (thread) {
        selectThread(thread);
        wsSend({ cmd: "thread_messages", thread_id: thread.id }, sUrl);
      }
    }
  } else {
    selectChannel(channel);
  }
}

export function selectThread(
  thread: { id: string; name: string; parent_channel: string } | null,
): void {
  currentThread.value = thread as any;

  if (thread) {
    currentChannel.value = {
      name: thread.parent_channel,
      type: "thread",
      display_name: thread.name,
      parent_channel: thread.parent_channel,
    } as any;

    // Clear thread unread counts
    const sUrl = serverUrl.value;
    const threadKey = `${sUrl}:thread:${thread.id}`;
    if (unreadByChannel.value[threadKey]) {
      const newUnreads = { ...unreadByChannel.value };
      delete newUnreads[threadKey];
      unreadByChannel.value = newUnreads;
    }
    if (unreadPings.value[threadKey]) {
      const newPings = { ...unreadPings.value };
      delete newPings[threadKey];
      unreadPings.value = newPings;
    }

    // Fetch thread messages
    const hasLoaded = loadedChannelsByServer[sUrl]?.has(thread.id) ?? false;
    if (!hasLoaded) {
      startMessageFetch(sUrl, thread.id);
      wsSend({ cmd: "thread_messages", thread_id: thread.id }, sUrl);
    }

    renderMessagesSignal.value++;
    renderChannelsSignal.value++;
    renderGuildSidebarSignal.value++;
    updateUrlFromState();
  } else {
    const currentChannelValue = currentChannel.value as any;
    if (
      currentChannelValue?.type === "thread" &&
      currentChannelValue?.parent_channel
    ) {
      currentChannel.value = {
        name: currentChannelValue.parent_channel,
        type: "forum",
        display_name: currentChannelValue.parent_channel,
      } as any;
    }
    updateUrlFromState();
  }
}

export function setStatus(
  status: "online" | "idle" | "dnd" | "offline",
  text?: string,
): void {
  myStatus.value = { status: status as "online" | "idle" | "dnd", text };
  for (const sUrl of Object.keys(wsConnections)) {
    const caps = serverCapabilitiesByServer.value[sUrl] || [];
    if (caps.includes("status_set")) {
      wsSend({ cmd: "status_set", status, text }, sUrl);
    }
  }
}
