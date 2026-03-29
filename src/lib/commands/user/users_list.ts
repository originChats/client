import type { UsersList } from "@/msgTypes";
import type { ServerUser } from "../../../types";
import { usersByServer, serverCapabilitiesByServer } from "../../../state";
import { renderMembersSignal } from "../../ui-signals";

export function handleUsersList(msg: UsersList, sUrl: string): void {
  const existing = usersByServer.value[sUrl] || {};
  const caps = serverCapabilitiesByServer.value[sUrl] ?? [];
  const hasUsersOnline = caps.includes("users_online");
  const next: Record<string, (typeof existing)[string]> = {};
  for (const user of msg.users) {
    const key = user.username?.toLowerCase();
    if (!key) continue;
    const statusObj = user.status;
    const normalizedUser: ServerUser = {
      ...existing[key],
      ...user,
    };
    if (!hasUsersOnline || statusObj !== undefined) {
      normalizedUser.status = statusObj;
    }
    next[key] = normalizedUser;
  }
  usersByServer.value = { ...usersByServer.value, [sUrl]: next };
  renderMembersSignal.value++;
}
