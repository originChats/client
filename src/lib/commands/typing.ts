import type { Typing } from "@/msgTypes";
import { typingUsersByServer } from "../../state";

export function handleTyping(msg: Typing, sUrl: string): void {
  const { channel, user, thread_id } = msg;
  const typingChannel = thread_id || channel;
  if (!typingUsersByServer.has(sUrl)) {
    typingUsersByServer.set(sUrl, {});
  }
  const serverTyping = typingUsersByServer.read(sUrl);
  if (!serverTyping[typingChannel]) {
    typingUsersByServer.update(sUrl, (current) => ({ ...current, [typingChannel]: new Map() }));
  }
  const existingMap = typingUsersByServer.read(sUrl)[typingChannel] as Map<string, number>;
  const newMap = new Map(existingMap);
  newMap.set(user, Date.now() + 10000);
  typingUsersByServer.update(sUrl, (current) => ({
    ...current,
    [typingChannel]: newMap,
  }));
}
