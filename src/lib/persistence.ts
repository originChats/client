import {
  token,
  servers,
  serverFolders,
  readTimesByServer,
  friends,
  friendRequests,
  blockedUsers,
  friendNicknames,
  serverNotifSettings,
  channelNotifSettings,
} from "../state";
import { getOriginFS, DEFAULT_SERVERS } from "../state";
import type { NotificationLevel } from "../state";
import type { Server, ServerFolder } from "../types";
import { getFriends } from "./rotur-api";

export async function loadServers(): Promise<Server[]> {
  const originFS = getOriginFS();
  if (!originFS) return [...DEFAULT_SERVERS];
  try {
    await originFS.loadIndex();
    const content = await originFS.readFileContent(
      "/application data/chats@mistium/servers.json",
    );
    return (JSON.parse(content) as Server[]).filter(
      (s) => s.url !== "dms.mistium.com",
    );
  } catch {
    return [...DEFAULT_SERVERS];
  }
}

export async function saveServers(): Promise<void> {
  const originFS = getOriginFS();
  if (!originFS) return;
  const path = "/application data/chats@mistium/servers.json";
  try {
    await originFS.createFolders("/application data/chats@mistium");
    if (await originFS.exists(path))
      await originFS.writeFile(path, JSON.stringify(servers.value));
    else await originFS.createFile(path, JSON.stringify(servers.value));
    await originFS.commit();
  } catch (error) {
    console.error("Failed to save servers:", error);
  }
}

export async function loadReadTimes(): Promise<
  Record<string, Record<string, number>>
> {
  const originFS = getOriginFS();
  if (!originFS) return {};
  try {
    await originFS.loadIndex();
    const content = await originFS.readFileContent(
      "/application data/chats@mistium/read_times.json",
    );
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function saveReadTimes(): Promise<void> {
  const originFS = getOriginFS();
  if (!originFS) return;
  const path = "/application data/chats@mistium/read_times.json";
  try {
    await originFS.createFolders("/application data/chats@mistium");
    if (await originFS.exists(path))
      await originFS.writeFile(path, JSON.stringify(readTimesByServer.value));
    else
      await originFS.createFile(path, JSON.stringify(readTimesByServer.value));
    await originFS.commit();
  } catch (error) {
    console.error("Failed to save read times:", error);
  }
}

export async function loadNotifSettings(): Promise<{
  serverNotif: Record<string, NotificationLevel>;
  channelNotif: Record<string, NotificationLevel>;
}> {
  const originFS = getOriginFS();
  if (!originFS) return { serverNotif: {}, channelNotif: {} };
  try {
    await originFS.loadIndex();
    const content = await originFS.readFileContent(
      "/application data/chats@mistium/notif_settings.json",
    );
    const parsed = JSON.parse(content);
    return {
      serverNotif: parsed.serverNotif ?? {},
      channelNotif: parsed.channelNotif ?? {},
    };
  } catch {
    return { serverNotif: {}, channelNotif: {} };
  }
}

export async function saveNotifSettings(): Promise<void> {
  const originFS = getOriginFS();
  if (!originFS) return;
  const path = "/application data/chats@mistium/notif_settings.json";
  const data = JSON.stringify({
    serverNotif: serverNotifSettings.value,
    channelNotif: channelNotifSettings.value,
  });
  try {
    await originFS.createFolders("/application data/chats@mistium");
    if (await originFS.exists(path)) await originFS.writeFile(path, data);
    else await originFS.createFile(path, data);
    await originFS.commit();
  } catch (error) {
    console.error("Failed to save notif settings:", error);
  }
}

async function fetchMyAccountData(): Promise<void> {
  if (!token.value) return;
  try {
    const data = await getFriends();
    friends.value = data.friends;
    friendRequests.value = data.requests;
    blockedUsers.value = data.blocked;
  } catch (error) {
    console.error("Failed to fetch account data:", error);
  }
}

export async function loadFolders(): Promise<ServerFolder[]> {
  const originFS = getOriginFS();
  if (!originFS) return [];
  try {
    await originFS.loadIndex();
    const content = await originFS.readFileContent(
      "/application data/chats@mistium/folders.json",
    );
    return JSON.parse(content) as ServerFolder[];
  } catch {
    return [];
  }
}

export async function saveFolders(): Promise<void> {
  const originFS = getOriginFS();
  if (!originFS) return;
  const path = "/application data/chats@mistium/folders.json";
  try {
    await originFS.createFolders("/application data/chats@mistium");
    if (await originFS.exists(path))
      await originFS.writeFile(path, JSON.stringify(serverFolders.value));
    else await originFS.createFile(path, JSON.stringify(serverFolders.value));
    await originFS.commit();
  } catch (error) {
    console.error("Failed to save folders:", error);
  }
}

export async function loadFriendNicknames(): Promise<Record<string, string>> {
  const originFS = getOriginFS();
  if (!originFS) return {};
  try {
    await originFS.loadIndex();
    const content = await originFS.readFileContent(
      "/application data/chats@mistium/friend_nicknames.json",
    );
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function saveFriendNicknames(): Promise<void> {
  const originFS = getOriginFS();
  if (!originFS) return;
  const path = "/application data/chats@mistium/friend_nicknames.json";
  try {
    await originFS.createFolders("/application data/chats@mistium");
    if (await originFS.exists(path))
      await originFS.writeFile(path, JSON.stringify(friendNicknames.value));
    else await originFS.createFile(path, JSON.stringify(friendNicknames.value));
    await originFS.commit();
  } catch (error) {
    console.error("Failed to save friend nicknames:", error);
  }
}
