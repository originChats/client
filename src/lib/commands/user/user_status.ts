import type { UserStatusMessage } from "@/msgTypes";
import { usersByServer } from "../../../state";
import { renderMembersSignal } from "../../ui-signals";

export function handleUserStatus(msg: UserStatusMessage, sUrl: string): void {
  const uKey = msg.username?.toLowerCase();
  if (usersByServer.read(sUrl)?.[uKey]) {
    usersByServer.update(sUrl, (serverUsers) => ({
      ...serverUsers,
      [uKey]: { ...serverUsers[uKey], status: msg.status },
    }));
    renderMembersSignal.value++;
  }
}
