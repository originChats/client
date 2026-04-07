import {
  serverCapabilitiesByServer,
  readTimesByServer,
  DM_SERVER_URL,
  serverAuthModeByServer,
  servers,
} from "../../state";
import { wsSend } from "../ws-sender";
import { readTimes as dbReadTimes } from "../db";
import {
  showCrackedAuthModal,
  crackedAuthError,
  pendingCrackedCredentials,
  crackedAuthLoading,
} from "../ui-signals";
import { saveServers } from "../persistence";

export function handleAuthSuccess(sUrl: string): void {
  const authMode = serverAuthModeByServer.value[sUrl];
  if (authMode === "cracked-only" || authMode === "cracked") {
    if (showCrackedAuthModal.value === sUrl) {
      showCrackedAuthModal.value = null;
      crackedAuthError.value = null;
      crackedAuthLoading.value = false;
    }

    const pending = pendingCrackedCredentials.value;
    if (pending && pending.serverUrl === sUrl) {
      servers.value = servers.value.map((s) =>
        s.url === sUrl
          ? {
              ...s,
              crackedCredentials: {
                username: pending.username,
                password: pending.password,
              },
            }
          : s,
      );
      saveServers().catch((err) =>
        console.error(
          "[auth_success] Failed to save cracked credentials:",
          err,
        ),
      );
      pendingCrackedCredentials.value = null;
    }
  }

  const caps = serverCapabilitiesByServer.value[sUrl] ?? [];
  const serverHas = (cap: string) => caps.includes(cap);
  wsSend({ cmd: "channels_get" }, sUrl);
  wsSend({ cmd: "users_list" }, sUrl);
  wsSend({ cmd: "users_online" }, sUrl);
  if (serverHas("roles_list")) wsSend({ cmd: "roles_list" }, sUrl);
  if (serverHas("slash_list")) wsSend({ cmd: "slash_list" }, sUrl);
  if (serverHas("emoji_get_all")) wsSend({ cmd: "emoji_get_all" }, sUrl);
  if (sUrl !== DM_SERVER_URL && serverHas("pings_get")) {
    const channelReadTimes = readTimesByServer.value[sUrl];
    if (!channelReadTimes || Object.keys(channelReadTimes).length === 0) {
      dbReadTimes.get(sUrl).then((times) => {
        if (times && Object.keys(times).length > 0) {
          readTimesByServer.value = {
            ...readTimesByServer.value,
            [sUrl]: times,
          };
        }
      });
    }
  }
}
