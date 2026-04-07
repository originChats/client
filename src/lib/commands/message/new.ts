import type { MessageNew } from "@/msgTypes";
import type { Channel, Message, DMServer } from "../../../types";
import {
  messagesByServer,
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
} from "../../../state";
import { unreadState } from "../../../state";
import {
  renderChannelsSignal,
  renderMessagesSignal,
  renderGuildSidebarSignal,
} from "../../ui-signals";
import { getChannelNotifLevel } from "../../../state";
import { wsSend } from "../../ws-sender";
import { playPingSound } from "../../websocket";
import { readTimes as dbReadTimes } from "../../db";
import { getMessageKey, truncateForNotification } from "../../message-utils";

const _readTimeFlushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function showNotification(title: string, body: string, channel: string): void {
  if ("Notification" in window && Notification.permission === "granted") {
    const notification = new Notification(title, { body, tag: channel });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
}

function handlePingedMessage(
  msg: MessageNew,
  sUrl: string,
  targetChannelKey: string,
  notifTitle: string,
): void {
  if (serverUrl.value === sUrl) {
    unreadState.incrementPing(sUrl, targetChannelKey);
    renderChannelsSignal.value++;
  }
  playPingSound();
  showNotification(
    notifTitle,
    truncateForNotification(msg.message.content),
    msg.channel,
  );
  renderGuildSidebarSignal.value++;
}

export function handleMessageNew(msg: MessageNew, sUrl: string): void {
  const isThreadMessage = !!msg.thread_id;
  const messageKey = getMessageKey(msg);

  const channelIsLoaded =
    loadedChannelsByServer[sUrl]?.has(messageKey) ?? false;
  if (channelIsLoaded) {
    const channelMsgs = messagesByServer.value[sUrl]?.[messageKey] || [];
    const alreadyExists = channelMsgs.some(
      (m: Message) => m.id === msg.message.id,
    );
    if (!alreadyExists) {
      messagesByServer.value = {
        ...messagesByServer.value,
        [sUrl]: {
          ...messagesByServer.value[sUrl],
          [messageKey]: [...channelMsgs, msg.message],
        },
      };
    }
  }

  const chList = channelsByServer.value[sUrl];
  const targetChannel = msg.channel;
  if (chList) {
    const idx = chList.findIndex((c: Channel) => c.name === targetChannel);
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

  const isThreadView =
    isThreadMessage && currentThread.value?.id === msg.thread_id;
  const isCurrentView =
    isThreadView ||
    (!isThreadMessage &&
      serverUrl.value === sUrl &&
      currentChannel.value?.name === messageKey);

  const notifLevel = getChannelNotifLevel(sUrl, targetChannel);
  const isMuted = notifLevel === "none";
  const channelKey = `${sUrl}:${targetChannel}`;

  let myUsername = currentUserByServer.value[sUrl]?.username;
  const isOwnMessage = msg.message.user === myUsername;

  if (!isCurrentView && !isMuted && !isOwnMessage) {
    const targetChannelKey = isThreadMessage ? msg.thread_id! : msg.channel;
    unreadState.incrementUnread(sUrl, targetChannelKey);

    if (sUrl === DM_SERVER_URL && !isOwnMessage && dmMessageSound.value) {
      playPingSound();
    }

    if (notifLevel === "all") {
      myUsername = currentUserByServer.value[sUrl]?.username;
      if (msg.message.user !== myUsername) {
        unreadState.incrementPing(sUrl, targetChannelKey);
        playPingSound();
        showNotification(
          `${msg.message.user} in #${msg.channel}`,
          truncateForNotification(msg.message.content),
          msg.channel,
        );
        if (serverUrl.value === sUrl) renderChannelsSignal.value++;
        renderGuildSidebarSignal.value++;
      }
    }

    if (sUrl === DM_SERVER_URL) {
      const alreadyListed = dmServers.value.some(
        (d: DMServer) => d.channel === msg.channel,
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
  } else if (isOwnMessage && !isCurrentView) {
    const channelToClear = isThreadMessage ? msg.thread_id! : msg.channel;
    unreadState.clearChannel(sUrl, channelToClear);
  } else if (isCurrentView) {
    const msgTimestamp = msg.message.timestamp;

    readTimesByServer.value = {
      ...readTimesByServer.value,
      [sUrl]: {
        ...(readTimesByServer.value[sUrl] ?? {}),
        [msg.channel]: msgTimestamp,
      },
    };

    const channelToClear = isThreadMessage ? msg.thread_id! : msg.channel;
    unreadState.clearChannel(sUrl, channelToClear);

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
    if (sUrl === DM_SERVER_URL) {
      const alreadyListed = dmServers.value.some(
        (d: DMServer) => d.channel === msg.channel,
      );
      if (!alreadyListed) {
        const senderUsername = msg.message.user;
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
    usersByServer.value[sUrl]?.[myUsername?.toLowerCase() || ""]?.roles || [];
  const myRolesLower = myRoles.map((r) => r.toLowerCase());
  const mentionedRoles = msg.message.pings?.roles || [];
  const isRolePinged = mentionedRoles.some((r) =>
    myRolesLower.includes(r.toLowerCase()),
  );

  const isUserPinged =
    msg.message.pings?.users?.some(
      (u) => u.toLowerCase() === myUsername?.toLowerCase(),
    ) || false;
  const isReplyPinged =
    msg.message.pings?.replies?.some(
      (r) => r.toLowerCase() === myUsername?.toLowerCase(),
    ) || false;

  if (
    myUsername &&
    msg.message.user !== myUsername &&
    !isMuted &&
    !isCurrentView &&
    notifLevel !== "all"
  ) {
    if (
      isThreadMessage &&
      msg.thread_id &&
      (isUserPinged || isRolePinged || isReplyPinged)
    ) {
      const caps = serverCapabilitiesByServer.value[sUrl] ?? [];
      if (caps.includes("thread_join")) {
        wsSend({ cmd: "thread_join", thread_id: msg.thread_id }, sUrl);
      }
    }

    if (isUserPinged) {
      const targetChannelKey = isThreadMessage ? msg.thread_id! : msg.channel;
      handlePingedMessage(
        msg,
        sUrl,
        targetChannelKey,
        `${msg.message.user} mentioned you in #${msg.channel}`,
      );
    } else if (isRolePinged) {
      const pingedRole = mentionedRoles.find((r) =>
        myRolesLower.includes(r.toLowerCase()),
      );
      const targetChannelKey = isThreadMessage ? msg.thread_id! : msg.channel;
      handlePingedMessage(
        msg,
        sUrl,
        targetChannelKey,
        `${msg.message.user} mentioned ${pingedRole} in #${msg.channel}`,
      );
    } else if (isReplyPinged) {
      const targetChannelKey = isThreadMessage ? msg.thread_id! : msg.channel;
      handlePingedMessage(
        msg,
        sUrl,
        targetChannelKey,
        `${msg.message.user} replied to your message in #${msg.channel}`,
      );
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
}
