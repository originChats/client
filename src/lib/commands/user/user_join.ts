import type { UserJoin } from "@/msgTypes";
import { usersByServer } from "../../../state";
import { renderMembersSignal } from "../../ui-signals";

export function handleUserJoin(msg: UserJoin, sUrl: string): void {
  if (!usersByServer.has(sUrl)) {
    usersByServer.set(sUrl, {});
  }
  usersByServer.update(sUrl, (serverUsers) => ({
    ...serverUsers,
    [msg.user.username?.toLowerCase()]: msg.user,
  }));
  renderMembersSignal.value++;
}
