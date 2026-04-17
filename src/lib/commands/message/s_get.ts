import type { MessagesGet } from "@/msgTypes";
import {
  messagesByServer,
  loadedChannelsByServer,
  reachedOldestByServer,
  reachedNewestByServer,
  serverUrl,
  currentChannel,
  channelsByServer,
  DM_SERVER_URL,
} from "../../../state";
import { finishMessageFetch, markChannelAsRead, markThreadAsRead } from "../../ws-sender";
import { selectChannel } from "../../actions";
import {
  getMessageKey,
  setMessages,
  mergeAndSortMessages,
  normalizeReactions,
} from "../../message-utils";

export function handleMessagesGet(msg: MessagesGet, sUrl: string): void {
  const messageKey = getMessageKey(msg);
  finishMessageFetch(sUrl, messageKey);

  if (!loadedChannelsByServer[sUrl]) loadedChannelsByServer[sUrl] = new Set();
  loadedChannelsByServer[sUrl].add(messageKey);

  const existingMsgs = messagesByServer.value[sUrl]?.[messageKey] || [];

  const newMessages = normalizeReactions(msg.messages || []);

  const sortedMsgs = mergeAndSortMessages(existingMsgs, newMessages);

  const SCROLL_UP_LIMIT = 20;
  if (existingMsgs.length > 0 && newMessages.length < SCROLL_UP_LIMIT) {
    if (!reachedOldestByServer[sUrl]) reachedOldestByServer[sUrl] = new Set();
    reachedOldestByServer[sUrl].add(messageKey);
  }

  setMessages(sUrl, messageKey, sortedMsgs);

  // Mark as reached newest on initial load
  if (sortedMsgs.length > 0) {
    if (!reachedNewestByServer[sUrl]) reachedNewestByServer[sUrl] = new Set();
    reachedNewestByServer[sUrl].add(messageKey);
  }

  if (sortedMsgs.length > 0) {
    const latestMessage = sortedMsgs[sortedMsgs.length - 1];
    if (msg.thread_id) {
      markThreadAsRead(msg.thread_id, latestMessage.id, sUrl);
    } else {
      markChannelAsRead(msg.channel, latestMessage.id, sUrl);
    }
  }

  if (
    serverUrl.value === sUrl &&
    !currentChannel.value &&
    sortedMsgs.length > 0 &&
    sUrl !== DM_SERVER_URL
  ) {
    const channels = channelsByServer.value[sUrl] || [];
    if (channels.length > 0) selectChannel(channels[0]);
  }
}
