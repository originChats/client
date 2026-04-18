import type { RoleReorder } from "@/msgTypes";
import type { Role } from "../../../types";
import { rolesByServer } from "../../../state";

export function handleRoleReorder(msg: RoleReorder, sUrl: string): void {
  const currentRoles = rolesByServer.read(sUrl) || {};
  const reorderedRoles: Record<string, Role> = {};
  msg.roles.forEach((roleName) => {
    if (currentRoles[roleName]) {
      reorderedRoles[roleName] = currentRoles[roleName];
    }
  });
  rolesByServer.set(sUrl, reorderedRoles);
}
