import type { MessagesAround } from "@/msgTypes";
import {
  messagesByServer,
  loadedChannelsByServer,
  reachedOldestByServer,
} from "../../../state";
import { finishMessageFetch } from "../../ws-sender";
import {
  getMessageKey,
  setMessages,
  mergeAndSortMessages,
} from "../../message-utils";

const pendingJumpByServer: Record<
  string,
  { messageId: string; channel: string } | null
> = {};

export function setPendingJump(
  sUrl: string,
  messageId: string,
  channel: string,
): void {
  pendingJumpByServer[sUrl] = { messageId, channel };
}

export function clearPendingJump(sUrl: string): void {
  pendingJumpByServer[sUrl] = null;
}

export function handleMessagesAround(msg: MessagesAround, sUrl: string): void {
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
  if (
    existingMsgs.length > 0 &&
    newMessages.length > 0 &&
    newMessages.length < SCROLL_UP_LIMIT
  ) {
    const oldestNewTimestamp = Math.min(...newMessages.map((m) => m.timestamp));
    const oldestExistingTimestamp = Math.min(
      ...existingMsgs.map((m) => m.timestamp),
    );
    if (oldestNewTimestamp < oldestExistingTimestamp) {
      if (!reachedOldestByServer[sUrl]) reachedOldestByServer[sUrl] = new Set();
      reachedOldestByServer[sUrl].add(messageKey);
    }
  }

  setMessages(sUrl, messageKey, sortedMsgs);

  const pendingJump = pendingJumpByServer[sUrl];
  if (pendingJump && pendingJump.channel === messageKey) {
    pendingJumpByServer[sUrl] = null;
    setTimeout(() => {
      const el = document.querySelector(
        `[data-msg-id="${pendingJump.messageId}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("highlight-flash");
        setTimeout(() => el.classList.remove("highlight-flash"), 2000);
      }
    }, 100);
  }
}
