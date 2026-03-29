import type { NicknameUpdate, NicknameRemove, UserUpdate } from "@/msgTypes";
import { usersByServer } from "../../../state";
import { renderMembersSignal, renderMessagesSignal } from "../../ui-signals";
import { normalizeUsername } from "../../state-utils";

type NicknameMsg = NicknameUpdate | NicknameRemove;

function handleNicknameChange(
  msg: NicknameMsg,
  sUrl: string,
  remove: boolean,
): void {
  const uKey = normalizeUsername(msg.username);
  if (usersByServer.value[sUrl]?.[uKey]) {
    const user = usersByServer.value[sUrl][uKey];
    if (remove) {
      const updated = { ...user };
      delete updated.nickname;
      usersByServer.value[sUrl][uKey] = updated;
    } else {
      usersByServer.value[sUrl][uKey] = {
        ...user,
        nickname: (msg as NicknameUpdate).nickname,
      };
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
  const serverUsers = usersByServer.value[sUrl];
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

  usersByServer.value[sUrl][uKey] = updated;

  if (msg.username && msg.username !== msg.user) {
    const newKey = normalizeUsername(msg.username);
    if (newKey !== uKey) {
      usersByServer.value = {
        ...usersByServer.value,
        [sUrl]: {
          ...usersByServer.value[sUrl],
          [newKey]: updated,
        },
      };
      const currentServerUsers = usersByServer.value[sUrl];
      if (currentServerUsers) {
        delete currentServerUsers[uKey];
      }
    }
  }

  renderMembersSignal.value++;
  renderMessagesSignal.value++;
}
