import type { UserConnect } from "@/msgTypes";
import { usersByServer } from "../../../state";
import { renderMembersSignal } from "../../ui-signals";

export function handleUserConnect(msg: UserConnect, sUrl: string): void {
  if (!usersByServer.read(sUrl)) {
    usersByServer.set(sUrl, {});
  }
  const key = msg.user.username?.toLowerCase();
  if (key) {
    usersByServer.update(sUrl, (serverUsers) => ({
      ...serverUsers,
      [key]: {
        ...serverUsers[key],
        ...msg.user,
        status: { status: "online", text: "" },
      },
    }));
    renderMembersSignal.value++;
  }
}
