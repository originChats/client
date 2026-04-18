import type { UserRolesGet } from "@/msgTypes";
import { usersByServer } from "../../../state";

export function handleUserRolesGet(msg: UserRolesGet, sUrl: string): void {
  const username = msg.user?.toLowerCase();
  if (!username) return;
  const serverUsers = usersByServer.read(sUrl);
  const user = serverUsers[username];
  if (user) {
    usersByServer.update(sUrl, (current) => ({
      ...current,
      [username]: {
        ...current[username],
        roles: msg.roles || [],
        ...(msg.color ? { color: msg.color } : {}),
      },
    }));
  }
}
