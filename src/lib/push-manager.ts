import { offlinePushServers, pushSubscriptionsByServer } from "../state";
import { wsSend } from "./ws-sender";

export async function subscribeToPushForServer(
  sUrl: string,
  vapidPublicKey: string,
): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;

    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const keyBytes = urlBase64ToUint8Array(vapidPublicKey);

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes as unknown as ArrayBuffer,
    });

    const subJson = subscription.toJSON();
    pushSubscriptionsByServer[sUrl] = subJson;

    wsSend(
      {
        cmd: "push_subscribe",
        subscription: subJson,
        vapid_public_key: vapidPublicKey,
      },
      sUrl,
    );

    offlinePushServers.value = { ...offlinePushServers.value, [sUrl]: true };
    console.log(`[Push] Subscribed to push notifications for ${sUrl}`);
  } catch (err) {
    console.error(`[Push] Failed to subscribe for ${sUrl}:`, err);
  }
}

export async function disablePushForServer(sUrl: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      wsSend(
        {
          cmd: "push_unsubscribe",
          endpoint: subscription.endpoint,
        },
        sUrl,
      );
      await subscription.unsubscribe();
    }

    delete pushSubscriptionsByServer[sUrl];
    const next = { ...offlinePushServers.value };
    delete next[sUrl];
    offlinePushServers.value = next;
    console.log(`[Push] Unsubscribed from push notifications for ${sUrl}`);
  } catch (err) {
    console.error(`[Push] Failed to unsubscribe for ${sUrl}:`, err);
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
