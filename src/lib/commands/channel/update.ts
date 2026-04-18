import type { ChannelUpdate } from "@/msgTypes";
import { channelsByServer, currentChannel } from "../../../state";
import { renderChannelsSignal } from "../../ui-signals";
import { showError } from "../../ui-signals";

export function handleChannelUpdate(msg: ChannelUpdate, sUrl: string): void {
  if (msg.channel) {
    const chList = channelsByServer.read(sUrl);
    if (chList) {
      const currentName = msg.current_name || msg.channel.name;
      const idx = chList.findIndex((c) => c.name === currentName);
      if (idx !== -1) {
        const updatedList = [...chList];
        updatedList[idx] = msg.channel;
        channelsByServer.set(sUrl, updatedList);
        if (currentChannel.value?.name === currentName) {
          currentChannel.value = msg.channel;
        }
        renderChannelsSignal.value++;
      }
    }
  } else if (msg.updated === false) {
    showError(msg.val || "Failed to update channel");
  }
}
