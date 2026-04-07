import type { PingsGet } from "@/msgTypes";
import {
  pingsInboxMessages,
  pingsInboxTotal,
  pingsInboxOffset,
  pingsInboxLoading,
} from "../../../state";

export function handlePingsGet(msg: PingsGet, sUrl?: string): void {
  const incoming = msg.messages || [];
  const offset = msg.offset ?? 0;
  if (offset === 0) {
    pingsInboxMessages.value = incoming as any;
  } else {
    pingsInboxMessages.value = [
      ...pingsInboxMessages.value,
      ...incoming,
    ] as any;
  }
  pingsInboxTotal.value = msg.total ?? incoming.length;
  pingsInboxOffset.value = offset;
  pingsInboxLoading.value = false;
}
