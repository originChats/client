import type { RolesList } from "@/msgTypes";
import { rolesByServer } from "../../../state";

export function handleRolesList(msg: RolesList, sUrl: string): void {
  rolesByServer.set(sUrl, msg.roles);
}
