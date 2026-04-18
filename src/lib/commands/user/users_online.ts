import type { UsersOnline } from "@/msgTypes";
import { usersByServer } from "../../../state";
import { renderMembersSignal } from "../../ui-signals";

export function handleUsersOnline(msg: UsersOnline, sUrl: string): void {
  if (!usersByServer.has(sUrl)) usersByServer.set(sUrl, {});
  const onlineUsernames = new Set<string>();
  for (const user of msg.users) {
    const key = user.username?.toLowerCase();
    if (!key) continue;
    onlineUsernames.add(key);
    const statusObj = user.status;
    const newStatus =
      typeof statusObj === "object" ? statusObj : { status: "online" as const, text: "" };
    const existing = usersByServer.read(sUrl)[key];
    if (existing) {
      usersByServer.update(sUrl, (serverUsers) => ({
        ...serverUsers,
        [key]: { ...serverUsers[key], status: newStatus },
      }));
    }
  }
  const serverUsers = usersByServer.read(sUrl);
  let needsOfflineUpdate = false;
  const updatedUsers = { ...serverUsers };
  for (const key of Object.keys(serverUsers)) {
    if (!onlineUsernames.has(key)) {
      if (updatedUsers[key]?.status?.status !== "offline") {
        updatedUsers[key] = { ...updatedUsers[key], status: { status: "offline", text: "" } };
        needsOfflineUpdate = true;
      }
    }
  }
  if (needsOfflineUpdate) {
    usersByServer.set(sUrl, updatedUsers);
  }

  renderMembersSignal.value++;
}
