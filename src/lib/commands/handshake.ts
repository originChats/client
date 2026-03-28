import type { Handshake } from "@/msgTypes";
import {
  channelsByServer,
  messagesByServer,
  usersByServer,
  serverValidatorKeys,
  serverCapabilitiesByServer,
  attachmentConfigByServer,
  servers,
  offlinePushServers,
} from "../../state";
import { renderGuildSidebarSignal } from "../ui-signals";
import { reloadServerIcon } from "../../utils";
import { saveServers } from "../persistence";
import { authenticateServer, enablePushForServer } from "../websocket";

export function handleHandshake(msg: Handshake, sUrl: string): void {
  if (!channelsByServer.value[sUrl])
    channelsByServer.value = { ...channelsByServer.value, [sUrl]: [] };
  if (!messagesByServer.value[sUrl])
    messagesByServer.value = { ...messagesByServer.value, [sUrl]: {} };
  if (!usersByServer.value[sUrl])
    usersByServer.value = { ...usersByServer.value, [sUrl]: {} };
  serverValidatorKeys[sUrl] = msg.val.validator_key;

  // these are the capabilities all servers can be expected to support
  const DEFAULT_CAPABILITIES = [
    "auth",
    "channels_get",
    "message_delete",
    "message_edit",
    "message_get",
    "message_new",
    "messages_get",
    "typing",
    "user_connect",
    "user_disconnect",
    "users_list",
    "users_online",
  ];

  serverCapabilitiesByServer.value = {
    ...serverCapabilitiesByServer.value,
    [sUrl]: Array.isArray(msg.val.capabilities)
      ? msg.val.capabilities
      : DEFAULT_CAPABILITIES,
  };

  if (msg.val.attachments) {
    const att = msg.val.attachments;
    attachmentConfigByServer.value = {
      ...attachmentConfigByServer.value,
      [sUrl]: {
        enabled: att.enabled ?? true,
        max_size: att.max_size,
        allowed_types: att.allowed_types,
        max_attachments_per_user: att.max_attachments_per_user ?? 10,
        permanent_tiers: att.permanent_tiers ?? [],
      },
    };
  }

  if (msg.val.server) {
    const { icon, name, banner } = msg.val.server;
    const existing = servers.value.find((s) => s.url === sUrl);
    if (existing) {
      const iconChanged = icon && existing.icon !== icon;
      const nameChanged = name && existing.name !== name;
      const bannerChanged = banner !== undefined && existing.banner !== banner;
      if (iconChanged || nameChanged || bannerChanged) {
        servers.value = servers.value.map((s) =>
          s.url === sUrl
            ? {
                ...s,
                ...(icon ? { icon } : {}),
                ...(name ? { name } : {}),
                ...(banner !== undefined ? { banner } : {}),
              }
            : s,
        );
        saveServers().catch(() => {});
      }
      if (icon) reloadServerIcon(sUrl);
    }
  }

  renderGuildSidebarSignal.value++;
  authenticateServer(sUrl);

  if (Notification.permission === "granted") {
    if (!offlinePushServers.value[sUrl]) {
      enablePushForServer(sUrl);
    }
  }
}
