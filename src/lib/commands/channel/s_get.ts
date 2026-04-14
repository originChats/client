import type { Channel, Thread } from "../../../types";
import {
  channelsByServer,
  threadsByServer,
  serverUrl,
  currentChannel,
  lastChannelByServer,
  pendingDMAddUsername,
  setPendingDMAddUsername,
  DM_SERVER_URL,
} from "../../../state";
import { renderChannelsSignal } from "../../ui-signals";
import { selectChannel } from "../../selectors";

export function handleChannelsGet(msg: { val: Channel[] }, sUrl: string): void {
  channelsByServer.value = { ...channelsByServer.value, [sUrl]: msg.val };

  const forumThreads: Record<string, Thread[]> = {};
  for (const channel of msg.val) {
    if (channel.type === "forum" && channel.threads) {
      forumThreads[channel.name] = channel.threads;
    }
  }
  if (Object.keys(forumThreads).length > 0) {
    threadsByServer.value = {
      ...threadsByServer.value,
      [sUrl]: forumThreads,
    };
  }

  renderChannelsSignal.value++;

  if (sUrl === DM_SERVER_URL && pendingDMAddUsername) {
    setPendingDMAddUsername(null);
  }

  if (
    serverUrl.value === sUrl &&
    !currentChannel.value &&
    channelsByServer.value[sUrl]?.length > 0 &&
    sUrl !== DM_SERVER_URL
  ) {
    selectChannel(channelsByServer.value[sUrl][0]);
  }

  if (serverUrl.value === sUrl && lastChannelByServer.value[sUrl]) {
    const lastChannelName = lastChannelByServer.value[sUrl];
    const channelList = channelsByServer.value[sUrl] || [];
    const targetChannel = channelList.find((c) => c.name === lastChannelName);
    if (targetChannel) {
      selectChannel(targetChannel);
    } else if (channelList.length > 0) {
      const textChannels = channelList.filter(
        (c) => c.type === "text" || c.type === "voice",
      );
      if (textChannels.length > 0) {
        selectChannel(textChannels[0]);
      }
    }
  }
}
