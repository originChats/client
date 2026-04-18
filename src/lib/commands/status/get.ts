import type { StatusGet } from "@/msgTypes";
import { usersByServer } from "../../../state";
import { statusState } from "../../state";
import { renderMembersSignal } from "../../ui-signals";

export function handleStatusGet(msg: StatusGet, sUrl: string): void {
  const username = msg.username?.toLowerCase();
  if (!username) return;
  if (usersByServer.read(sUrl)?.[username]) {
    usersByServer.update(sUrl, (serverUsers) => ({
      ...serverUsers,
      [username]: {
        ...serverUsers[username],
        status: msg.status,
      },
    }));
  }
  statusState.updateFromStatusGet(sUrl, msg.username, msg.status);
  renderMembersSignal.value++;
}
