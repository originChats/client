import { memo } from "preact/compat";
import { useState, useMemo } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import { Icon } from "../Icon";
import { MessageGroupRow } from "../MessageGroupRow";
import type { Message } from "../../types";
import { messages, users, currentThread } from "../../state";
import { translatedMessages, translatingMessageId, showContextMenu } from "../../lib/ui-signals";
import { formatShortDateTime } from "../../lib/date-utils";
import type { MessageListProps } from "./types";
import { groupMessages } from "./types";
import styles from "./MessageList.module.css";

function MessageListInner({
  messages: messagesProp,
  channelName,
  mode = "panel",
  loading = false,
  emptyIcon = "MessageCircle",
  emptyText = "No messages",
  onMessageClick,
  onMessageContextMenu,
  showChannelContext = false,
  showReplyPreview = false,
  hasMore = false,
  onLoadMore,
  className = "",
}: MessageListProps) {
  const [channelMessages, setChannelMessages] = useState<Message[]>([]);

  useSignalEffect(() => {
    if (channelName) {
      setChannelMessages(messages.value[channelName] || []);
    }
  });

  const messagesList = messagesProp ?? channelMessages;
  const messageGroups = useMemo(() => groupMessages(messagesList), [messagesList]);
  const thread = currentThread.value;
  const threadCreator = thread?.created_by;

  const translated = translatedMessages.value;
  const translating = translatingMessageId.value;

  const handleCopyContextMenu = (e: any, content: string) => {
    e.preventDefault();
    const menuItems = [
      {
        label: "Copy text",
        icon: "Copy",
        fn: () => navigator.clipboard.writeText(content),
      },
    ];
    showContextMenu(e, menuItems);
  };

  const handleMessageContextMenu = (e: MouseEvent, msg: Message) => {
    if (onMessageContextMenu) {
      onMessageContextMenu(e, msg);
    } else {
      handleCopyContextMenu(e, msg.content);
    }
  };

  const getChannelContext = (msg: Message): { channel: string; timestamp: number } | null => {
    const ch = (msg as any).channel;
    if (showChannelContext && ch) {
      return { channel: ch, timestamp: msg.timestamp };
    }
    return null;
  };

  const renderMessageRow = (msg: Message) => {
    const replyTo = msg.reply_to as { id: string; user: string; content?: string } | undefined;
    const replyUserColor = replyTo?.user
      ? users.value[replyTo.user?.toLowerCase()]?.color || undefined
      : undefined;
    const isOriginalPoster = threadCreator ? msg.user === threadCreator : false;

    const ctx = getChannelContext(msg);

    if (ctx) {
      return (
        <div className={styles.messageRowWithContext} key={msg.id}>
          <div className={styles.messageContext}>
            <Icon name="Hash" size={12} />
            <span className={styles.contextChannel}>{ctx.channel}</span>
            <span className={styles.contextTime}>{formatShortDateTime(ctx.timestamp)}</span>
          </div>
          <MessageGroupRow
            group={{ head: msg, following: [] }}
            onClick={() => onMessageClick?.(msg)}
            onContextMenu={(e: any) => handleMessageContextMenu(e, msg)}
            translatedMessages={translated}
            translatingMessageId={translating}
            showReply={showReplyPreview}
            replyUserColor={replyUserColor}
            isOriginalPoster={isOriginalPoster}
          />
        </div>
      );
    }

    return (
      <MessageGroupRow
        key={msg.id}
        group={{ head: msg, following: [] }}
        onClick={() => onMessageClick?.(msg)}
        onContextMenu={(e: any) => handleMessageContextMenu(e, msg)}
        translatedMessages={translated}
        translatingMessageId={translating}
        isOriginalPoster={threadCreator ? msg.user === threadCreator : false}
      />
    );
  };

  if (loading && messagesList.length === 0) {
    return (
      <div className={`${styles.messageList} ${styles[mode]} ${className}`}>
        <div className={styles.emptyState}>
          <div className="loading-throbber" />
        </div>
      </div>
    );
  }

  if (messagesList.length === 0) {
    return (
      <div className={`${styles.messageList} ${styles[mode]} ${className}`}>
        <div className={styles.emptyState}>
          <Icon name={emptyIcon} size={40} />
          <span>{emptyText}</span>
        </div>
      </div>
    );
  }

  if (showChannelContext) {
    return (
      <div className={`${styles.messageList} ${styles[mode]} ${className}`}>
        {messagesList.map((msg) => renderMessageRow(msg))}
        {hasMore && onLoadMore && (
          <button className={styles.loadMoreButton} onClick={onLoadMore} disabled={loading}>
            {loading ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.messageList} ${styles[mode]} ${className}`}>
      {messageGroups.map((group) => (
        <MessageGroupRow
          key={group.head.id}
          group={group}
          onClick={() => onMessageClick?.(group.head)}
          onContextMenu={(e: any) => handleMessageContextMenu(e, group.head)}
          translatedMessages={translated}
          translatingMessageId={translating}
          isOriginalPoster={threadCreator ? group.head.user === threadCreator : false}
        />
      ))}
      {hasMore && onLoadMore && (
        <button className={styles.loadMoreButton} onClick={onLoadMore} disabled={loading}>
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}

export const MessageList = memo(MessageListInner);
