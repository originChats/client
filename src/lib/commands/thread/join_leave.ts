import type { ThreadJoin, ThreadLeave } from "@/msgTypes";
import type { Thread } from "../../../types";
import { currentThread, updateThreadInChannel } from "../../../state";
import { renderChannelsSignal } from "../../ui-signals";

type ThreadParticipantMsg = ThreadJoin | ThreadLeave;

function handleThreadParticipantUpdate(
  msg: ThreadParticipantMsg,
  sUrl: string,
): void {
  if (msg.thread && msg.thread_id) {
    updateThreadInChannel(sUrl, msg.thread.parent_channel, msg.thread_id, {
      participants: msg.thread.participants,
    });
    if (currentThread.value?.id === msg.thread_id) {
      currentThread.value = {
        ...currentThread.value,
        participants: msg.thread.participants,
      } as Thread;
    }
    renderChannelsSignal.value++;
  }
}

export const handleThreadJoin = handleThreadParticipantUpdate;
export const handleThreadLeave = handleThreadParticipantUpdate;
