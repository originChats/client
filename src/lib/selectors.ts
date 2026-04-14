import {
  currentChannel,
  currentThread,
  serverUrl,
  DM_SERVER_URL,
  SPECIAL_CHANNELS,
  channelsByServer,
} from "../state";
import { renderChannelsSignal, renderMessagesSignal } from "./ui-signals";
import { wsSend } from "./ws-sender";
import type { Channel } from "../types";

export function selectChannel(channel: Channel): void {
  const sUrl = serverUrl.value;

  if (currentChannel.value?.name === channel.name && !currentThread.value) {
    return;
  }

  currentChannel.value = channel;
  currentThread.value = null;

  if (SPECIAL_CHANNELS.has(channel.name) && sUrl === DM_SERVER_URL) {
    renderChannelsSignal.value++;
    return;
  }

  if (channel.type === "forum") {
    renderChannelsSignal.value++;
    renderMessagesSignal.value++;
    return;
  }

  renderChannelsSignal.value++;

  // Fetch messages if channel has loaded history
  const channels = channelsByServer.value[sUrl];
  if (channels?.some((c: Channel) => c.name === channel.name)) {
    wsSend({ cmd: "messages_get", channel: channel.name, limit: 100 }, sUrl);
  }
}
