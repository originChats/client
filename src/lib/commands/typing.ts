import type { Typing } from "@/msgTypes";
import { typingUsersByServer } from "../../state";

export function handleTyping(msg: Typing, sUrl: string): void {
  const { channel, user } = msg;
  if (!typingUsersByServer.value[sUrl]) {
    typingUsersByServer.value = {
      ...typingUsersByServer.value,
      [sUrl]: {},
    };
  }
  if (!typingUsersByServer.value[sUrl][channel]) {
    typingUsersByServer.value[sUrl][channel] = new Map();
  }
  const existingMap = typingUsersByServer.value[sUrl][channel] as Map<string, number>;
  const newMap = new Map(existingMap);
  newMap.set(user, Date.now() + 10000);
  typingUsersByServer.value = {
    ...typingUsersByServer.value,
    [sUrl]: {
      ...typingUsersByServer.value[sUrl],
      [channel]: newMap,
    },
  };
}
