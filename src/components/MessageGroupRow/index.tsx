import { memo } from "preact/compat";
import { useMemo } from "preact/hooks";
import { currentUser } from "../../state";
import { UserAvatar } from "../UserAvatar";
import { MessageContent } from "../MessageContent";
import type { Message } from "../../types";
import { openUserPopout } from "../UserPopout";
import { useDisplayName, useUserColor } from "../../lib/useDisplayName";
import { Icon } from "../Icon";
import { formatRelativeTimeShort } from "../../lib/date-utils";
import styles from "./MessageGroupRow.module.css";

interface MessageGroup {
  head: Message;
  following: Message[];
}

interface MessageGroupRowProps {
  group: MessageGroup;
  onClick?: () => void;
  onContextMenu?: (e: any) => void;
  translatedMessages?: Record<string, string>;
  translatingMessageId?: string | null;
  showReply?: boolean;
  replyUserColor?: string;
  avatarSize?: number;
  isPending?: boolean;
}

function MessageGroupRowInner({
  group,
  onClick,
  onContextMenu,
  translatedMessages = {},
  translatingMessageId,
  showReply = false,
  replyUserColor,
  avatarSize,
  isPending = false,
}: MessageGroupRowProps) {
  const headUser = group.head.user;
  const displayName = useDisplayName(headUser);
  const color = useUserColor(headUser);
  const currentUsername = currentUser.value?.username;

  const headTranslation = group.head.id ? translatedMessages[group.head.id] : null;
  const headIsTranslating = translatingMessageId && group.head.id === translatingMessageId;

  const replyTo = group.head.reply_to as { id: string; user: string; content?: string } | undefined;
  const replyPreview = replyTo?.content
    ? replyTo.content.split("\n")[0].substring(0, 100)
    : replyTo
      ? "Click to see message"
      : null;
  const replyUser = replyTo?.user;
  const replyDisplayUser = useDisplayName(replyUser || "");

  const followingMessages = useMemo(
    () =>
      group.following.map((msg) => {
        const translation = msg.id ? translatedMessages[msg.id] : null;
        const isTranslating = translatingMessageId && msg.id === translatingMessageId;
        return (
          <div key={msg.id} className={styles.messageSingle}>
            <span className={styles.timestamp}>{formatRelativeTimeShort(msg.timestamp)}</span>
            <div className={styles.messageContentWrapper}>
              <MessageContent
                content={msg.content}
                currentUsername={currentUsername}
                authorUsername={msg.user}
                messageId={msg.id}
                pings={msg.pings}
                messageEmbeds={msg.embeds}
              />
              {isTranslating && <div className={styles.translationLoading}>Translating...</div>}
              {translation && <div className={styles.translationResult}>{translation}</div>}
            </div>
          </div>
        );
      }),
    [group.following, currentUsername, translatedMessages, translatingMessageId]
  );

  return (
    <div
      className={`${styles.messageGroup} ${isPending ? styles.pending : ""}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <UserAvatar
        username={headUser}
        className={`${styles.avatar} ${styles.clickable}`}
        alt={headUser}
        size={avatarSize}
        onClick={(e: any) => openUserPopout(e, headUser)}
      />
      <div className={styles.messageGroupContent}>
        {showReply && replyTo && replyUser && (
          <div className={styles.replyContext}>
            <Icon name="CornerUpRight" size={14} />
            <UserAvatar username={replyUser} className={styles.replyAvatar} alt={replyUser} />
            <span className={styles.replyUsername} style={{ color: replyUserColor }}>
              {replyDisplayUser}
            </span>
            <span className={styles.replyPreview}>{replyPreview || "Click to see message"}</span>
          </div>
        )}
        <div className={styles.messageHeader}>
          <span
            className={`${styles.username} ${styles.clickable}`}
            style={{ color }}
            onClick={(e: any) => openUserPopout(e, headUser)}
          >
            {displayName}
          </span>
          <span className={styles.timestamp}>{formatRelativeTimeShort(group.head.timestamp)}</span>
        </div>
        <div className={styles.messageBody}>
          <MessageContent
            content={group.head.content}
            currentUsername={currentUsername}
            authorUsername={headUser}
            messageId={group.head.id}
            pings={group.head.pings}
            messageEmbeds={group.head.embeds}
          />
          {headIsTranslating && <div className={styles.translationLoading}>Translating...</div>}
          {headTranslation && <div className={styles.translationResult}>{headTranslation}</div>}
        </div>
        {group.following.length > 0 && (
          <div className={styles.messageGroupFollowing}>{followingMessages}</div>
        )}
      </div>
    </div>
  );
}

export const MessageGroupRow = memo(MessageGroupRowInner);
