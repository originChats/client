import type { PushVapid, PushSubscribed } from "@/msgTypes";
import { offlinePushServers } from "../../../state";
import { subscribeToPushForServer } from "../../push-manager";
import { showBanner } from "../../ui-signals";

export function handlePushVapid(msg: PushVapid, sUrl: string): void {
  const vapidKey: string = msg.key || msg.vapid_key || msg.val || "";
  if (vapidKey) {
    subscribeToPushForServer(sUrl, vapidKey);
  } else {
    console.warn(`[Push] push_vapid from ${sUrl} had no key:`, msg);
  }
}

export function handlePushSubscribed(msg: PushSubscribed, sUrl: string): void {
  if (msg.success === false) {
    console.warn(`[Push] Server ${sUrl} rejected subscription.`);
    const next = { ...offlinePushServers.value };
    delete next[sUrl];
    offlinePushServers.value = next;
  }
}
