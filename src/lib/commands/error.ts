import type { ServerError } from "@/msgTypes";
import {
  offlinePushServers,
  pendingDMAddUsername,
  setPendingDMAddUsername,
  DM_SERVER_URL,
  servers,
  wsConnections,
} from "../../state";
import {
  showBanner,
  showCrackedAuthModal,
  crackedAuthError,
} from "../ui-signals";
import { closeWebSocket } from "../websocket";

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

  if (/you are banned from this server/i.test(errText)) {
    showBanner({
      kind: "error",
      serverUrl: sUrl,
      message: `You are banned from this server. You have been disconnected.`,
      autoDismissMs: 15000,
    });
    closeWebSocket(sUrl);
    return;
  }

  if (/you are (timed out|muted)/i.test(errText)) {
    const match = errText.match(/(\d+)\s*(second|minute|hour|day)s?/i);
    let duration = "a while";
    if (match) {
      const amount = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      duration = `${amount} ${unit}${amount !== 1 ? "s" : ""}`;
    }
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: `You are timed out for ${duration}. You cannot send messages until it expires.`,
    });
    console.warn(`[${sUrl}] User timed out:`, errText);
    return;
  }

  if (/access denied.*role required/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: `Permission denied: You don't have the required role for this action.`,
      autoDismissMs: 6000,
    });
    console.warn(`[${sUrl}] Permission denied:`, errText);
    return;
  }

  if (/access denied.*permission required/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: `Permission denied: ${errText}`,
      autoDismissMs: 6000,
    });
    console.warn(`[${sUrl}] Permission denied:`, errText);
    return;
  }

  if (/rate limited|rate limit/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: `You're sending messages too quickly. Please wait a moment.`,
      autoDismissMs: 5000,
    });
    console.warn(`[${sUrl}] Rate limited:`, errText);
    return;
  }

  if (/authentication failed|invalid authentication/i.test(errText)) {
    const existing = servers.value.find((s) => s.url === sUrl);
    if (existing?.crackedCredentials) {
      servers.value = servers.value.map((s) =>
        s.url === sUrl ? { ...s, crackedCredentials: undefined } : s,
      );
    }
    showCrackedAuthModal.value = sUrl;
    crackedAuthError.value = "Authentication failed. Please try again.";
    console.warn(`[${sUrl}] Authentication failed:`, errText);
    return;
  }

  if (/username already taken/i.test(errText)) {
    crackedAuthError.value = "Username already taken. Please choose another.";
    console.warn(`[${sUrl}] Registration failed:`, errText);
    return;
  }

  if (/invalid password/i.test(errText)) {
    crackedAuthError.value = "Invalid password. Please try again.";
    console.warn(`[${sUrl}] Login failed:`, errText);
    return;
  }

  if (/registration is disabled/i.test(errText)) {
    crackedAuthError.value =
      "Registration is disabled on this server. Please login instead.";
    console.warn(`[${sUrl}] Registration disabled:`, errText);
    return;
  }

  if (/rotur authentication is disabled/i.test(errText)) {
    showCrackedAuthModal.value = sUrl;
    crackedAuthError.value = null;
    console.log(`[${sUrl}] Server requires cracked authentication`);
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

  if (/thread is locked/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: "This thread is locked. You cannot send messages here.",
      autoDismissMs: 5000,
    });
    return;
  }

  if (/thread is archived/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: "This thread is archived. You cannot send messages here.",
      autoDismissMs: 5000,
    });
    return;
  }

  if (/channel not found/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: "Channel not found. It may have been deleted.",
      autoDismissMs: 5000,
    });
    return;
  }

  if (/thread not found/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: "Thread not found. It may have been deleted.",
      autoDismissMs: 5000,
    });
    return;
  }

  if (/message not found/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: "Message not found. It may have been deleted.",
      autoDismissMs: 4000,
    });
    return;
  }

  if (/message too long/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: "Message too long. Please shorten your message.",
      autoDismissMs: 5000,
    });
    return;
  }

  if (/attachment.*not found|attachment.*expired/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: "Attachment not found or has expired.",
      autoDismissMs: 5000,
    });
    return;
  }

  if (/attachments are disabled/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: "Attachments are disabled on this server.",
      autoDismissMs: 5000,
    });
    return;
  }

  if (/you do not have permission/i.test(errText)) {
    showBanner({
      kind: "warning",
      serverUrl: sUrl,
      message: errText,
      autoDismissMs: 5000,
    });
    return;
  }

  showBanner({
    kind: "error",
    serverUrl: sUrl,
    message: errText,
    autoDismissMs: 8000,
  });
  console.error(`[${sUrl}] Server error:`, errText);
}
