import type { Typing } from "@/msgTypes";
import { typingUsersByServer } from "../../state";

export function handleTyping(msg: Typing, sUrl: string): void {
  const { channel, user } = msg;
  if (!typingUsersByServer.has(sUrl)) {
    typingUsersByServer.set(sUrl, {});
  }
  const serverTyping = typingUsersByServer.read(sUrl);
  if (!serverTyping[channel]) {
    typingUsersByServer.update(sUrl, (current) => ({ ...current, [channel]: new Map() }));
  }
  const existingMap = typingUsersByServer.read(sUrl)[channel] as Map<string, number>;
  const newMap = new Map(existingMap);
  newMap.set(user, Date.now() + 10000);
  typingUsersByServer.update(sUrl, (current) => ({
    ...current,
    [channel]: newMap,
  }));
}
