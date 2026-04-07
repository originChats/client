import type { ServerError } from "@/msgTypes";
import {
  offlinePushServers,
  pendingDMAddUsername,
  setPendingDMAddUsername,
  DM_SERVER_URL,
} from "../../state";
import { showBanner } from "../ui-signals";

export function handleError(msg: ServerError, sUrl: string): void {
  const errText: string =
    msg.val || msg.message || msg.error || "The server reported an error.";
  if (/^unknown command/i.test(errText)) {
    console.debug(`[${sUrl}] Unsupported command (ignored):`, errText);
    if (/push_get_vapid/i.test(errText)) {
      const next = { ...offlinePushServers.value };
      delete next[sUrl];
      offlinePushServers.value = next;
      showBanner({
        kind: "error",
        serverUrl: sUrl,
        message: "This server does not support offline push notifications.",
        autoDismissMs: 8000,
      });
    }
    return;
  }

  if (
    sUrl === DM_SERVER_URL &&
    pendingDMAddUsername &&
    /does not exist/i.test(errText)
  ) {
    const attempted = pendingDMAddUsername;
    setPendingDMAddUsername(null);
    showBanner({
      kind: "error",
      serverUrl: sUrl,
      message: `"${attempted}" is not on OriginChats. Make sure you have the right username.`,
      autoDismissMs: 8000,
    });
    console.error(`[${sUrl}] DM add failed — user not found:`, attempted);
    return;
  }

  if (sUrl === DM_SERVER_URL && pendingDMAddUsername) {
    setPendingDMAddUsername(null);
  }

  showBanner({
    kind: "error",
    serverUrl: sUrl,
    message: errText,
    autoDismissMs: 8000,
  });
  console.error(`[${sUrl}] Server error:`, errText);
}
