import type { UserDisconnect, UserLeave } from "@/msgTypes";
import { usersByServer } from "../../../state";
import { renderMembersSignal } from "../../ui-signals";

export function handleUserDisconnect(msg: UserDisconnect, sUrl: string): void {
  const uKey = msg.username.toLowerCase();
  if (usersByServer.read(sUrl)?.[uKey]) {
    usersByServer.update(sUrl, (serverUsers) => ({
      ...serverUsers,
      [uKey]: {
        ...serverUsers[uKey],
        status: { status: "offline", text: "" },
      },
    }));
    renderMembersSignal.value++;
  }
}

export function handleUserLeave(msg: UserLeave, sUrl: string): void {
  if (usersByServer.read(sUrl)?.[msg.username?.toLowerCase()]) {
    const updated = { ...usersByServer.read(sUrl) };
    delete updated[msg.username.toLowerCase()];
    usersByServer.set(sUrl, updated);
    renderMembersSignal.value++;
  }
}
