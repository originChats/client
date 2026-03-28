import type { MessagesGet } from "@/msgTypes";
import {
  messagesByServer,
  loadedChannelsByServer,
  reachedOldestByServer,
  serverUrl,
  currentChannel,
  channelsByServer,
} from "../../../state";
import { finishMessageFetch } from "../../websocket";
import { selectChannel } from "../../actions";
import {
  getMessageKey,
  setMessages,
  mergeAndSortMessages,
} from "../../message-utils";

const DM_SERVER_URL = "dms.mistium.com";

export function handleMessagesGet(msg: MessagesGet, sUrl: string): void {
  const messageKey = getMessageKey(msg);
  finishMessageFetch(sUrl, messageKey);

  if (!loadedChannelsByServer[sUrl]) loadedChannelsByServer[sUrl] = new Set();
  loadedChannelsByServer[sUrl].add(messageKey);

  const existingMsgs = messagesByServer.value[sUrl]?.[messageKey] || [];

  const newMessages = (msg.messages || []).map((m) => {
    const normalised: Record<string, string[]> = {};
    if (m.reactions && typeof m.reactions === "object")
      for (const [emoji, reactors] of Object.entries(m.reactions)) {
        normalised[emoji] = reactors;
      }
    return { ...m, reactions: normalised };
  });

  const sortedMsgs = mergeAndSortMessages(existingMsgs, newMessages);

  const SCROLL_UP_LIMIT = 20;
  if (existingMsgs.length > 0 && newMessages.length < SCROLL_UP_LIMIT) {
    if (!reachedOldestByServer[sUrl]) reachedOldestByServer[sUrl] = new Set();
    reachedOldestByServer[sUrl].add(messageKey);
  }

  setMessages(sUrl, messageKey, sortedMsgs);

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
