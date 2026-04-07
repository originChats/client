import type { Ready } from "@/msgTypes";
import {
  currentUserByServer,
  usersByServer,
  serverCapabilitiesByServer,
  myStatus,
  savedStatusText,
  offlinePushServers,
} from "../../state";
import { statusState } from "../state";
import { renderMembersSignal } from "../ui-signals";
import { wsSend } from "../ws-sender";
import { enablePushForServer } from "../websocket";

export function handleReady(msg: Ready, sUrl: string): void {
  currentUserByServer.value = {
    ...currentUserByServer.value,
    [sUrl]: msg.user,
  };
  if (!usersByServer.value[sUrl])
    usersByServer.value = { ...usersByServer.value, [sUrl]: {} };
  usersByServer.value = {
    ...usersByServer.value,
    [sUrl]: {
      ...usersByServer.value[sUrl],
      [msg.user.username?.toLowerCase()]: {
        ...msg.user,
        status: msg.user.status,
      },
    },
  };
  if (msg.user.status) {
    statusState.updateFromReady(sUrl, msg.user.username, msg.user.status);
    myStatus.value = {
      status: msg.user.status.status,
      text: msg.user.status.text,
    };
    if (msg.user.status.text) {
      savedStatusText.value = msg.user.status.text;
    }
  } else if (savedStatusText.value !== undefined) {
    const caps = serverCapabilitiesByServer.value[sUrl] || [];
    if (caps.includes("status_set")) {
      wsSend(
        {
          cmd: "status_set",
          status: myStatus.value.status,
          text: savedStatusText.value,
        },
        sUrl,
      );
    }
  }
  renderMembersSignal.value++;

  if (Notification.permission === "granted") {
    if (!offlinePushServers.value[sUrl]) {
      enablePushForServer(sUrl);
    }
  }
}
