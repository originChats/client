import type {
  PollCreate,
  PollVote,
  PollVoteUpdate,
  PollEnd,
  PollResults,
  PollGet,
} from "@/msgTypes";
import { messagesByServer, serverUrl } from "../../../state";
import { renderMessagesSignal } from "../../ui-signals";

function updatePollInMessage(
  messageId: string,
  pollId: string,
  results: any,
): void {
  const sUrl = serverUrl.value;
  const serverMessages = messagesByServer.value[sUrl];
  if (!serverMessages) return;

  for (const [channel, msgs] of Object.entries(serverMessages)) {
    const msgIndex = (msgs as any[]).findIndex((m: any) => m.id === messageId);
    if (msgIndex === -1) continue;

    const msg = (msgs as any[])[msgIndex];
    if (!msg.embeds) continue;

    const pollEmbedIndex = msg.embeds.findIndex(
      (e: any) => e.type === "poll" && e.poll?.id === pollId,
    );
    if (pollEmbedIndex === -1) continue;

    const pollEmbed = msg.embeds[pollEmbedIndex];
    pollEmbed.poll = {
      ...pollEmbed.poll,
      ...results,
      results: results.results,
      total_votes: results.total_votes,
      ended: results.ended,
      ended_at: results.ended_at,
    };

    messagesByServer.value = {
      ...messagesByServer.value,
      [sUrl]: {
        ...serverMessages,
        [channel]: [...(msgs as any[])],
      },
    };
    renderMessagesSignal.value++;
    return;
  }
}

export function handlePollCreate(msg: PollCreate, sUrl: string): void {
  // Poll is created - the message_new handler should have already added the message
  // This handler is just for confirmation
}

export function handlePollVote(msg: PollVote, sUrl: string): void {
  // Vote confirmation - results are updated
}

export function handlePollVoteUpdate(msg: PollVoteUpdate, sUrl: string): void {
  if (!msg.message_id) return;
  updatePollInMessage(msg.message_id, msg.poll_id, msg.results);
}

export function handlePollEnd(msg: PollEnd, sUrl: string): void {
  if (!msg.message_id) return;
  updatePollInMessage(msg.message_id, msg.poll_id, msg.results);
}

export function handlePollResults(msg: PollResults, sUrl: string): void {
  // Results response - could update UI if needed
}

export function handlePollGet(msg: PollGet, sUrl: string): void {
  // Poll details response - could update UI if needed
}
