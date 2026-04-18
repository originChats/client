import type { NicknameUpdate, NicknameRemove, UserUpdate } from "@/msgTypes";
import { usersByServer } from "../../../state";
import { renderMembersSignal, renderMessagesSignal } from "../../ui-signals";
import { normalizeUsername } from "../../state-utils";

type NicknameMsg = NicknameUpdate | NicknameRemove;

function handleNicknameChange(msg: NicknameMsg, sUrl: string, remove: boolean): void {
  const uKey = normalizeUsername(msg.username);
  const serverUsers = usersByServer.read(sUrl);
  if (serverUsers?.[uKey]) {
    const user = serverUsers[uKey];
    if (remove) {
      const { nickname: _, ...rest } = user;
      usersByServer.update(sUrl, (current) => ({ ...current, [uKey]: rest as typeof user }));
    } else {
      usersByServer.update(sUrl, (current) => ({
        ...current,
        [uKey]: { ...user, nickname: (msg as NicknameUpdate).nickname },
      }));
    }
    renderMembersSignal.value++;
    renderMessagesSignal.value++;
  }
}

export const handleNicknameUpdate = (msg: NicknameUpdate, sUrl: string) =>
  handleNicknameChange(msg, sUrl, false);
export const handleNicknameRemove = (msg: NicknameRemove, sUrl: string) =>
  handleNicknameChange(msg, sUrl, true);

export function handleUserUpdate(msg: UserUpdate, sUrl: string): void {
  const uKey = normalizeUsername(msg.user);
  const serverUsers = usersByServer.read(sUrl);
  if (!serverUsers?.[uKey]) return;

  const user = serverUsers[uKey];
  const updated = { ...user };
  if (msg.nickname !== undefined) {
    if (msg.nickname === null) {
      delete updated.nickname;
    } else {
      updated.nickname = msg.nickname;
    }
  }
  if (msg.username !== undefined) {
    updated.username = msg.username;
  }

  // Handle username rename
  if (msg.username && msg.username !== msg.user) {
    const newKey = normalizeUsername(msg.username);
    if (newKey !== uKey) {
      usersByServer.update(sUrl, (current) => {
        const next = { ...current, [newKey]: updated };
        delete next[uKey];
        return next;
      });
    } else {
      usersByServer.update(sUrl, (current) => ({ ...current, [uKey]: updated }));
    }
  } else {
    usersByServer.update(sUrl, (current) => ({ ...current, [uKey]: updated }));
  }

  renderMembersSignal.value++;
  renderMessagesSignal.value++;
}
