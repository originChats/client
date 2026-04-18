import { useState, useEffect, useRef } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import {
  serverUrl,
  currentChannel,
  currentThread,
  threadsByServer,
  currentUserByServer,
  users,
  hasCapability,
} from "../../state";
import { UserAvatar } from "../UserAvatar";
import {
  selectThread,
  createThread,
  deleteThread,
  joinThread,
  leaveThread,
} from "../../lib/actions";
import { Header } from "../Header";
import { formatThreadTime } from "../../lib/date-utils";
import { showThreadPanel, renderChannelsSignal } from "../../lib/ui-signals";
import { Icon } from "../Icon";
import { wsSend } from "../../lib/websocket";
import { ThreadContextMenu, useThreadContextMenu } from "../ThreadContextMenu";
import { pendingMessages } from "../../lib/state/pending-messages";
import type { Thread } from "../../types";
import styles from "./ThreadPanel.module.css";

export function ThreadPanel() {
  const [newThreadName, setNewThreadName] = useState("");
  const [newThreadMessage, setNewThreadMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingThreadMessage, setPendingThreadMessage] = useState<{
    channel: string;
    content: string;
  } | null>(null);
  const { showThreadMenu, closeThreadMenu, threadMenu } = useThreadContextMenu();

  const ch = currentChannel.value;
  const isForum = ch?.type === "forum";
  const threads = isForum ? threadsByServer.read(serverUrl.value)?.[ch.name] || [] : [];

  const supportsJoinLeave = hasCapability("thread_join") && hasCapability("thread_leave");

  useSignalEffect(() => {
    renderChannelsSignal.value;
    currentChannel.value;
    if (currentChannel.value?.type === "forum") {
      showThreadPanel.value = true;
    }
  });

  const prevThreadsRef = useRef<{
    threads: Thread[];
    pending: typeof pendingThreadMessage;
  }>({
    threads: [],
    pending: null,
  });

  useEffect(() => {
    if (pendingThreadMessage && threads.length > prevThreadsRef.current.threads.length) {
      const newThread = threads.find(
        (t) => !prevThreadsRef.current.threads.some((pt) => pt.id === t.id)
      );
      if (newThread) {
        const myUsername = currentUserByServer.read(serverUrl.value)?.username;
        if (myUsername) {
          pendingMessages.add(serverUrl.value, newThread.id, {
            user: myUsername,
            content: pendingThreadMessage.content,
            timestamp: Date.now(),
          });
        }
        wsSend(
          {
            cmd: "message_new",
            channel: pendingThreadMessage.channel,
            thread_id: newThread.id,
            content: pendingThreadMessage.content,
          },
          serverUrl.value
        );
        selectThread(newThread);
        setPendingThreadMessage(null);
      }
    }
    prevThreadsRef.current = { threads, pending: pendingThreadMessage };
  }, [threads, pendingThreadMessage]);

  if (!isForum) {
    return null;
  }

  const handleCreateThread = (e: Event) => {
    e.preventDefault();
    if (!newThreadName.trim() || !ch) return;
    const messageContent = newThreadMessage.trim();
    if (messageContent) {
      setPendingThreadMessage({ channel: ch.name, content: messageContent });
    }
    createThread(ch.name, newThreadName.trim());
    setNewThreadName("");
    setNewThreadMessage("");
    setIsCreating(false);
  };

  const handleThreadClick = (thread: Thread) => {
    selectThread(thread);
  };

  const handleDeleteThread = (e: Event, threadId: string) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this thread?")) {
      deleteThread(threadId);
    }
  };

  const handleJoinThread = (e: Event, threadId: string) => {
    e.stopPropagation();
    joinThread(threadId);
  };

  const handleLeaveThread = (e: Event, threadId: string) => {
    e.stopPropagation();
    leaveThread(threadId);
  };

  const myUsername = currentUserByServer.read(serverUrl.value)?.username;

  const formatTimestamp = (timestamp: number): string => formatThreadTime(timestamp);

  return (
    <div className={styles.mainContentWrapper}>
      <Header />
      <div className={styles.threadPanel}>
        <div className={styles.threadList}>
          {isCreating ? (
            <form onSubmit={handleCreateThread} className={styles.threadCreateForm}>
              <input
                type="text"
                placeholder="Thread title..."
                value={newThreadName}
                onInput={(e) => setNewThreadName((e.target as HTMLInputElement).value)}
                autoFocus
                maxLength={100}
                className={styles.threadCreateTitle}
              />
              <textarea
                placeholder="Send the first message..."
                value={newThreadMessage}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  setNewThreadMessage(target.value);
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 150) + "px";
                }}
                maxLength={2000}
                className={styles.threadCreateMessage}
                rows={3}
              />
              <div className={styles.threadCreateActions}>
                <button
                  type="button"
                  className={styles.threadCreateCancel}
                  onClick={() => {
                    setIsCreating(false);
                    setNewThreadName("");
                    setNewThreadMessage("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.threadCreateSubmit}
                  disabled={!newThreadName.trim()}
                >
                  Create
                </button>
              </div>
            </form>
          ) : (
            <button className={styles.threadCreateBtn} onClick={() => setIsCreating(true)}>
              <Icon name="Plus" size={16} />
              <span>New Thread</span>
            </button>
          )}

          {threads.length === 0 && !isCreating ? (
            <div className={styles.threadEmpty}>
              <Icon name="MessageSquare" size={32} />
              <p>No threads yet</p>
              <p className={styles.threadEmptyHint}>Create the first thread!</p>
            </div>
          ) : threads.length > 0 ? (
            <div className={styles.threadGrid}>
              {threads.map((thread) => {
                const isParticipant = thread.participants?.includes(myUsername || "");
                const participantCount = thread.participants?.length || 0;

                return (
                  <div
                    key={thread.id}
                    className={`${styles.threadCard} ${currentThread.value?.id === thread.id ? styles.active : ""}`}
                    onClick={() => handleThreadClick(thread)}
                    onContextMenu={(e) => showThreadMenu(e, thread)}
                  >
                    <div className={styles.threadCardHeader}>
                      <UserAvatar
                        username={thread.created_by}
                        className={styles.threadCardAvatar}
                        alt={thread.created_by}
                      />
                      <div className={styles.threadCardInfo}>
                        <span className={styles.threadCardUsername}>{thread.created_by}</span>
                        <span className={styles.threadCardTime}>
                          {formatTimestamp(thread.created_at)}
                        </span>
                      </div>
                      {thread.locked && (
                        <span className={styles.threadCardLocked}>
                          <Icon name="Lock" size={12} />
                        </span>
                      )}
                    </div>
                    <div className={styles.threadCardTitle}>{thread.name}</div>
                    <div className={styles.threadCardFooter}>
                      <div className={styles.threadCardMeta}>
                        {supportsJoinLeave && participantCount > 0 && (
                          <span
                            className={styles.threadCardParticipants}
                            title={`${participantCount} participant${participantCount === 1 ? "" : "s"}`}
                          >
                            <Icon name="Users" size={12} />
                            {participantCount}
                          </span>
                        )}
                        <span className={styles.threadCardReplies}>
                          <Icon name="MessageSquare" size={12} />0
                        </span>
                      </div>
                      <div className={styles.threadCardActions}>
                        {supportsJoinLeave &&
                          !thread.locked &&
                          (isParticipant ? (
                            <button
                              className={styles.threadCardLeave}
                              onClick={(e) => handleLeaveThread(e, thread.id)}
                              title="Leave thread"
                            >
                              <Icon name="UserMinus" size={14} />
                            </button>
                          ) : (
                            <button
                              className={styles.threadCardJoin}
                              onClick={(e) => handleJoinThread(e, thread.id)}
                              title="Join thread"
                            >
                              <Icon name="UserPlus" size={14} />
                            </button>
                          ))}
                        {(thread.created_by === myUsername || myUsername === "admin") && (
                          <button
                            className={styles.threadCardDelete}
                            onClick={(e) => handleDeleteThread(e, thread.id)}
                            title="Delete thread"
                          >
                            <Icon name="Trash2" size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
        {threadMenu && (
          <ThreadContextMenu
            thread={threadMenu.thread}
            x={threadMenu.x}
            y={threadMenu.y}
            onClose={closeThreadMenu}
          />
        )}
      </div>
    </div>
  );
}

function ThreadView() {
  const thread = currentThread.value;
  const supportsJoinLeave = hasCapability("thread_join") && hasCapability("thread_leave");
  const myUsername = currentUserByServer.read(serverUrl.value)?.username;
  const isParticipant = thread?.participants?.includes(myUsername || "");

  useSignalEffect(() => {
    currentThread.value;
  });

  if (!thread) {
    return null;
  }

  return (
    <div className={styles.threadView}>
      <div className={styles.threadViewHeader}>
        <button className={styles.threadViewBack} onClick={() => selectThread(null)}>
          <Icon name="ArrowLeft" size={18} />
        </button>
        <div className={styles.threadViewTitle}>
          <Icon name="MessageSquare" size={18} />
          <span>{thread.name}</span>
        </div>
        {supportsJoinLeave && (
          <div className={styles.threadViewActions}>
            {thread.participants && thread.participants.length > 0 && (
              <div className={styles.threadViewParticipants}>
                <Icon name="Users" size={14} />
                <span>{thread.participants.length}</span>
              </div>
            )}
            {!thread.locked &&
              (isParticipant ? (
                <button
                  className={styles.threadViewLeave}
                  onClick={() => leaveThread(thread.id)}
                  title="Leave thread"
                >
                  <Icon name="UserMinus" size={16} />
                  <span>Leave</span>
                </button>
              ) : (
                <button
                  className={styles.threadViewJoin}
                  onClick={() => joinThread(thread.id)}
                  title="Join thread"
                >
                  <Icon name="UserPlus" size={16} />
                  <span>Join</span>
                </button>
              ))}
          </div>
        )}
      </div>
      <div className={styles.threadViewContent}>Thread messages will appear here...</div>
    </div>
  );
}
