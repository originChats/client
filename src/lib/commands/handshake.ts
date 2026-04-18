import type { Handshake } from "@/msgTypes";
import {
  channelsByServer,
  messagesByServer,
  usersByServer,
  serverValidatorKeys,
  serverCapabilitiesByServer,
  serverPermissionsByServer,
  attachmentConfigByServer,
  servers,
  serverAuthModeByServer,
  token,
} from "../../state";
import {
  renderGuildSidebarSignal,
  showCrackedAuthModal,
  showRoturRequiredModal,
} from "../ui-signals";
import { reloadServerIcon } from "../../utils";
import { saveServers } from "../persistence";
import { authenticateServer } from "../auth";
import { wsSend } from "../ws-sender";
import { DEFAULT_PERMISSIONS } from "../../state";

export function handleHandshake(msg: Handshake, sUrl: string): void {
  if (!channelsByServer.has(sUrl)) channelsByServer.set(sUrl, []);
  if (!messagesByServer.value[sUrl])
    messagesByServer.value = { ...messagesByServer.value, [sUrl]: {} };
  if (!usersByServer.read(sUrl)) usersByServer.set(sUrl, {});
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
  ];

  serverCapabilitiesByServer.set(
    sUrl,
    Array.isArray(msg.val.capabilities) ? msg.val.capabilities : DEFAULT_CAPABILITIES
  );

  if (msg.val.roles && Array.isArray(msg.val.roles)) {
    const permissions = msg.val.roles.flatMap((r) => r.permissions || []);
    const uniquePerms = Array.from(new Set(permissions)).map((id: string) => {
      const defaultPerm = DEFAULT_PERMISSIONS.find((p) => p.id === id);
      return defaultPerm || { id, name: id, description: "", category: "Other" };
    });
    serverPermissionsByServer.set(sUrl, uniquePerms);
  }

  if (msg.val.attachments) {
    const att = msg.val.attachments;
    attachmentConfigByServer.set(sUrl, {
      enabled: att.enabled ?? true,
      max_size: att.max_size,
      allowed_types: att.allowed_types,
      max_attachments_per_user: att.max_attachments_per_user ?? 10,
      permanent_tiers: att.permanent_tiers ?? [],
    });
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
            : s
        );
        saveServers().catch(() => {});
      }
      if (icon) reloadServerIcon(sUrl);
    }
  }

  const rawAuthMode = msg.val.auth_mode;
  const authMode = rawAuthMode ?? "rotur";
  serverAuthModeByServer.set(sUrl, authMode);

  renderGuildSidebarSignal.value++;

  const existing = servers.value.find((s) => s.url === sUrl);
  switch (authMode) {
    case "rotur":
      if (!token.value) {
        showRoturRequiredModal.value = sUrl;
      } else {
        authenticateServer(sUrl);
      }
      break;
    case "cracked-only":
      if (existing?.crackedCredentials) {
        wsSend(
          {
            cmd: "login",
            username: existing.crackedCredentials.username,
            password: existing.crackedCredentials.password,
          },
          sUrl
        );
      } else {
        showCrackedAuthModal.value = sUrl;
      }
      break;
    case "cracked":
      if (existing?.crackedCredentials) {
        wsSend(
          {
            cmd: "login",
            username: existing.crackedCredentials.username,
            password: existing.crackedCredentials.password,
          },
          sUrl
        );
      } else if (!token.value) {
        showCrackedAuthModal.value = sUrl;
      } else {
        authenticateServer(sUrl);
      }
      break;
    default:
      authenticateServer(sUrl);
  }
}
