import type { UserRolesSet } from "@/msgTypes";
import { usersByServer, rolesByServer } from "../../../state";

export function handleUserRolesSet(msg: UserRolesSet, sUrl: string): void {
  const username = msg.user?.toLowerCase();
  if (!username) return;
  const serverUsers = usersByServer.read(sUrl);
  const user = serverUsers[username];
  if (user) {
    const roles = msg.roles || [];
    const roleColor = Object.values(rolesByServer.read(sUrl)).find((r) =>
      roles.includes(r.name)
    )?.color;
    usersByServer.update(sUrl, (current) => ({
      ...current,
      [username]: {
        ...current[username],
        roles,
        ...(roleColor ? { color: roleColor } : {}),
      },
    }));
  }
}
