import { serverValidatorKeys, serverCapabilitiesByServer } from "../state";
import { wsSend } from "./ws-sender";
import { generateValidator as generateValidatorApi } from "./rotur-api";

export async function authenticateServer(sUrl: string): Promise<void> {
  const validatorKey = serverValidatorKeys[sUrl];
  if (!validatorKey) return;
  try {
    const validator = await generateValidatorApi(validatorKey);
    wsSend({ cmd: "auth", validator }, sUrl);
  } catch (error) {
    console.error(`Authentication failed for ${sUrl}:`, error);
  }
}

export async function enablePushForServer(sUrl: string): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("[Push] Web Push not supported in this browser.");
    return;
  }

  if (Notification.permission === "default") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      console.warn("[Push] Notification permission denied.");
      return;
    }
  }

  if (Notification.permission !== "granted") {
    console.warn("[Push] Notification permission not granted.");
    return;
  }

  const caps = serverCapabilitiesByServer.read(sUrl) ?? [];
  if (!caps.includes("push_get_vapid")) {
    console.warn(`[Push] ${sUrl} does not support push notifications.`);
    return;
  }

  wsSend({ cmd: "push_get_vapid" }, sUrl);
}
