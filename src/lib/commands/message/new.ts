import type { MessageNew } from "@/msgTypes";
import type { Channel, Message, DMServer } from "../../../types";
import {
  loadedChannelsByServer,
  channelsByServer,
  currentThread,
  serverUrl,
  currentChannel,
  currentUserByServer,
  dmMessageSound,
  dmServers,
  usersByServer,
  serverCapabilitiesByServer,
  readTimesByServer,
  typingUsersByServer,
  DM_SERVER_URL,
  reachedNewestByServer,
  missedMessagesCount,
} from "../../../state";
import { unreadState, getChannelNotifLevel } from "../../../state";
import { messages } from "../../state/messages";
import { pendingMessages } from "../../state/pending-messages";
import {
  renderChannelsSignal,
  renderMessagesSignal,
  renderGuildSidebarSignal,
  missedMessagesSignal,
} from "../../ui-signals";
import { wsSend } from "../../ws-sender";
import { playPingSound } from "../../audio";
import { readTimes as dbReadTimes } from "../../db";
import { getMessageKey, truncateForNotification } from "../../message-utils";

const readTimeTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function notify(title: string, body: string, tag: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(title, { body, tag });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }
}

function isPinged(
  msg: MessageNew,
  myUsername: string
): { user: boolean; role: boolean; reply: boolean } {
  const pings = msg.message.pings;
  if (!pings) return { user: false, role: false, reply: false };
  return {
    user: (pings.users || []).some((u: string) => u.toLowerCase() === myUsername.toLowerCase()),
    role: false,
    reply: (pings.replies || []).some((r: string) => r.toLowerCase() === myUsername.toLowerCase()),
  };
}

function getMyRoles(sUrl: string, username: string): string[] {
  return (
    usersByServer.value[sUrl]?.[username.toLowerCase()]?.roles?.map((r) => r.toLowerCase()) || []
  );
}

function updateLastMessage(sUrl: string, channel: string, timestamp: number) {
  const chList = channelsByServer.value[sUrl];
  if (!chList) return;
  const idx = chList.findIndex((c: Channel) => c.name === channel);
  if (idx === -1 || !timestamp) return;
  const updated = [...chList];
  updated[idx] = { ...updated[idx], last_message: timestamp };
  channelsByServer.value = { ...channelsByServer.value, [sUrl]: updated };
  if (sUrl === DM_SERVER_URL) renderChannelsSignal.value++;
}

function ensureDMServer(channel: string, user: string, timestamp: number) {
  if (!dmServers.value.some((d: DMServer) => d.channel === channel)) {
    dmServers.value = [
      ...dmServers.value,
      { channel, name: user, username: user, last_message: timestamp },
    ];
  }
}

function persistReadTime(sUrl: string, channel: string, timestamp: number) {
  readTimesByServer.value = {
    ...readTimesByServer.value,
    [sUrl]: { ...(readTimesByServer.value[sUrl] ?? {}), [channel]: timestamp },
  };
  const key = `${sUrl}:${channel}`;
  if (readTimeTimers[key]) clearTimeout(readTimeTimers[key]);
  readTimeTimers[key] = setTimeout(() => {
    delete readTimeTimers[key];
    dbReadTimes
      .set(sUrl, readTimesByServer.value[sUrl] ?? {})
      .catch((e) => console.warn("[message_new] Failed to persist read time:", e));
  }, 1000);
}

function doPingNotification(sUrl: string, channel: string, msg: MessageNew, title: string) {
  unreadState.incrementPing(sUrl, channel);
  playPingSound();
  notify(title, truncateForNotification(msg.message.content), msg.channel);
  if (sUrl === serverUrl.value) renderChannelsSignal.value++;
  renderGuildSidebarSignal.value++;
}

function handlePingNotifications(
  msg: MessageNew,
  sUrl: string,
  channel: string,
  myUsername: string
) {
  const pinged = isPinged(msg, myUsername);
  const myRoles = getMyRoles(sUrl, myUsername);
  const rolePinged = (msg.message.pings?.roles || []).some((r) =>
    myRoles.includes(r.toLowerCase())
  );

  if (msg.thread_id && (pinged.user || rolePinged || pinged.reply)) {
    const caps = serverCapabilitiesByServer.value[sUrl] ?? [];
    if (caps.includes("thread_join"))
      wsSend({ cmd: "thread_join", thread_id: msg.thread_id }, sUrl);
  }

  if (pinged.user) {
    doPingNotification(sUrl, channel, msg, `${msg.message.user} mentioned you in #${msg.channel}`);
  } else if (rolePinged) {
    const role = (msg.message.pings?.roles || []).find((r) => myRoles.includes(r.toLowerCase()));
    doPingNotification(
      sUrl,
      channel,
      msg,
      `${msg.message.user} mentioned ${role} in #${msg.channel}`
    );
  } else if (pinged.reply) {
    doPingNotification(
      sUrl,
      channel,
      msg,
      `${msg.message.user} replied to your message in #${msg.channel}`
    );
  }
}

export function handleMessageNew(msg: MessageNew, sUrl: string): void {
  const isThread = !!msg.thread_id;
  const key = getMessageKey(msg);
  const myUsername = currentUserByServer.value[sUrl]?.username || "";
  const isOwn = msg.message.user === myUsername;
  const isCurrentServer = sUrl === serverUrl.value;
  const isCurrentChannel =
    isCurrentServer &&
    ((isThread && currentThread.value?.id === msg.thread_id) ||
      (!isThread && currentChannel.value?.name === key));

  // Handle pending message confirmation for own messages
  if (isOwn) {
    pendingMessages.removeByKey(sUrl, key, msg.message.content, myUsername);
  }

  if (isCurrentChannel && loadedChannelsByServer[sUrl]?.has(key)) {
    // Check if we're at the bottom (reachedNewest)
    const isAtBottom = reachedNewestByServer[sUrl]?.has(key);

    if (isAtBottom) {
      // We're at the bottom, append the message normally
      messages.append(sUrl, key, msg.message as Message);
      // Mark as reached newest since we received a new message for the current channel
      if (!reachedNewestByServer[sUrl]) reachedNewestByServer[sUrl] = new Set();
      reachedNewestByServer[sUrl].add(key);
    } else {
      // We're not at the bottom, track missed messages instead of appending
      if (!missedMessagesCount[sUrl]) missedMessagesCount[sUrl] = {};
      if (!missedMessagesCount[sUrl][key]) missedMessagesCount[sUrl][key] = 0;
      missedMessagesCount[sUrl][key]++;
      missedMessagesSignal.value++;
    }
  }

  updateLastMessage(sUrl, msg.channel, msg.message.timestamp);

  const notifLevel = getChannelNotifLevel(sUrl, msg.channel);
  const isMuted = notifLevel === "none";
  const channelToClear = isThread ? msg.thread_id! : msg.channel;

  if (!isCurrentChannel && !isMuted && !isOwn) {
    unreadState.incrementUnread(sUrl, channelToClear);
    renderChannelsSignal.value++;

    if (sUrl === DM_SERVER_URL && dmMessageSound.value) playPingSound();

    if (notifLevel === "all") {
      doPingNotification(sUrl, channelToClear, msg, `${msg.message.user} in #${msg.channel}`);
    }

    if (sUrl === DM_SERVER_URL)
      ensureDMServer(msg.channel, msg.message.user, msg.message.timestamp);

    if (isCurrentServer) renderChannelsSignal.value++;
    renderGuildSidebarSignal.value++;
  } else if (isOwn && !isCurrentChannel) {
    unreadState.clearChannel(sUrl, channelToClear);
  } else if (isCurrentChannel) {
    persistReadTime(sUrl, msg.channel, msg.message.timestamp);
    unreadState.clearChannel(sUrl, channelToClear);
  } else if (isMuted && sUrl === DM_SERVER_URL) {
    ensureDMServer(msg.channel, msg.message.user, msg.message.timestamp);
  }

  if (!isOwn && !isMuted && !isCurrentChannel && notifLevel !== "all" && myUsername) {
    handlePingNotifications(msg, sUrl, channelToClear, myUsername);
  }

  const typing = typingUsersByServer.value[sUrl]?.[msg.channel];
  if (typing) (typing as Map<string, number>).delete(msg.message.user);

  renderMessagesSignal.value++;
}
