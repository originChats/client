import { useState } from "preact/hooks";
import { wsSend } from "../../lib/websocket";
import { serverUrl, currentUser } from "../../state";
import type { PollData } from "../../types";
import styles from "./PollEmbed.module.css";

interface PollEmbedProps {
  poll: PollData;
  messageId: string;
}

export function PollEmbed({ poll, messageId }: PollEmbedProps) {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(
    new Set(poll.user_votes || [])
  );
  const [isVoting, setIsVoting] = useState(false);

  const options = poll.results || poll.options;
  const totalVotes = poll.total_votes || 0;
  const isEnded = poll.ended || false;

  const handleVote = (optionId: string) => {
    if (isEnded || isVoting) return;

    const newSelected = new Set(selectedOptions);

    if (poll.allow_multiselect) {
      if (newSelected.has(optionId)) {
        newSelected.delete(optionId);
      } else {
        newSelected.add(optionId);
      }
      setSelectedOptions(newSelected);
    } else {
      newSelected.clear();
      newSelected.add(optionId);
      setSelectedOptions(newSelected);
      submitVote(Array.from(newSelected));
    }
  };

  const submitVote = (optionIds: string[]) => {
    if (optionIds.length === 0) return;

    setIsVoting(true);
    const sUrl = serverUrl.value;

    wsSend(
      {
        cmd: "poll_vote",
        message_id: messageId,
        option_ids: optionIds,
      },
      sUrl
    );

    setTimeout(() => setIsVoting(false), 500);
  };

  const handleEndPoll = () => {
    if (isEnded) return;

    const sUrl = serverUrl.value;
    wsSend(
      {
        cmd: "poll_end",
        message_id: messageId,
      },
      sUrl
    );
  };

  const formatTimeRemaining = () => {
    if (!poll.expires_at) return null;
    const now = Math.floor(Date.now() / 1000);
    const remaining = poll.expires_at - now;
    if (remaining <= 0) return "Ended";
    if (remaining < 60) return `${remaining}s`;
    if (remaining < 3600) return `${Math.floor(remaining / 60)}m`;
    if (remaining < 86400) return `${Math.floor(remaining / 3600)}h`;
    return `${Math.floor(remaining / 86400)}d`;
  };

  return (
    <div className={styles.pollContainer}>
      <div className={styles.pollQuestion}>{poll.question}</div>

      <div className={styles.pollOptions}>
        {options.map((option) => {
          const votes = option.votes || 0;
          const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const isSelected = selectedOptions.has(option.id) || option.voted;

          return (
            <button
              key={option.id}
              className={`${styles.pollOption} ${isSelected ? styles.selected : ""} ${isEnded ? styles.ended : ""}`}
              onClick={() => handleVote(option.id)}
              disabled={isEnded || isVoting}
            >
              <div className={styles.optionContent}>
                <div className={styles.optionHeader}>
                  {option.emoji && <span className={styles.optionEmoji}>{option.emoji}</span>}
                  <span className={styles.optionText}>{option.text}</span>
                  {isSelected && <span className={styles.checkmark}>✓</span>}
                </div>
                <div className={styles.voteBarContainer}>
                  <div className={styles.voteBar} style={{ width: `${percentage}%` }} />
                </div>
                <div className={styles.voteInfo}>
                  <span className={styles.voteCount}>
                    {votes} vote{votes !== 1 ? "s" : ""}
                  </span>
                  <span className={styles.votePercentage}>{percentage}%</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className={styles.pollFooter}>
        <span className={styles.totalVotes}>
          {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
        </span>
        {formatTimeRemaining() && (
          <span className={styles.timeRemaining}>{isEnded ? "Ended" : formatTimeRemaining()}</span>
        )}
        {!isEnded && poll.allow_multiselect && selectedOptions.size > 0 && (
          <button
            className={styles.submitVoteBtn}
            onClick={() => submitVote(Array.from(selectedOptions))}
            disabled={isVoting}
          >
            Submit Vote
          </button>
        )}
        {!isEnded && (
          <button className={styles.endPollBtn} onClick={handleEndPoll}>
            End Poll
          </button>
        )}
      </div>
    </div>
  );
}
