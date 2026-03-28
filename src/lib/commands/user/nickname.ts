import type { NicknameUpdate, NicknameRemove } from "@/msgTypes";
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
