import type { MessageReactAdd, MessageReactRemove } from "@/msgTypes";
import { messagesByServer } from "../../../state";
import { renderMessagesSignal } from "../../ui-signals";
import { getMessageKey } from "../../message-utils";

export function handleMessageReact(
  msg: MessageReactAdd | MessageReactRemove,
  sUrl: string,
): void {
  const messageKey = getMessageKey(msg);
  const channelMessages = messagesByServer.value[sUrl]?.[messageKey];
  if (!channelMessages) return;

  const msgIndex = channelMessages.findIndex((m) => m.id === msg.id);
  if (msgIndex === -1) return;

  const reactUser: string = typeof msg.from === "string" ? msg.from : "";
  const reactMsg = channelMessages[msgIndex];

  const updatedReactions = reactMsg.reactions ? { ...reactMsg.reactions } : {};

  if (msg.cmd === "message_react_add") {
    if (!updatedReactions[msg.emoji]) {
      updatedReactions[msg.emoji] = [];
    }
    if (!updatedReactions[msg.emoji].includes(reactUser)) {
      updatedReactions[msg.emoji] = [...updatedReactions[msg.emoji], reactUser];
    }
  } else {
    if (updatedReactions[msg.emoji]) {
      updatedReactions[msg.emoji] = updatedReactions[msg.emoji].filter(
        (u: string) => u !== reactUser,
      );
      if (updatedReactions[msg.emoji].length === 0) {
        delete updatedReactions[msg.emoji];
      }
    }
  }

  const updatedMsg = { ...reactMsg, reactions: updatedReactions };
  const updatedChannelMessages = [...channelMessages];
  updatedChannelMessages[msgIndex] = updatedMsg;

  messagesByServer.value = {
    ...messagesByServer.value,
    [sUrl]: {
      ...messagesByServer.value[sUrl],
      [messageKey]: updatedChannelMessages,
    },
  };

  renderMessagesSignal.value++;
}
