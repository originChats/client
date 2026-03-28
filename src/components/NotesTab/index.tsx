import { useEffect, useState, useRef, useCallback } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import { currentChannel, currentUser } from "../../state";
import { notesChannel } from "../../lib/notes-channel";
import { Icon } from "../Icon";
import { showContextMenu } from "../../lib/ui-signals";
import { MessageContent } from "../MessageContent";
import { avatarUrl } from "../../utils";
import { useScrollLock } from "../UserProfile/useScrollLock";
import { Header } from "../Header";

interface NoteMessage {
  key: string;
  content: string;
  user: string;
  timestamp: number;
  edited?: boolean;
  _isNew?: boolean;
  pings?: {
    users: string[];
    roles: string[];
    replies: string[];
  };
}

interface NoteGroup {
  head: NoteMessage;
  following: NoteMessage[];
}

function groupNotes(notes: NoteMessage[]): NoteGroup[] {
  const groups: NoteGroup[] = [];
  let current: NoteGroup | null = null;

  for (const note of notes) {
    const shouldStartNew =
      !current ||
      note.user !== current.head.user ||
      note.timestamp - current.head.timestamp >= 300 ||
      !!note.edited;

    if (shouldStartNew) {
      if (current) groups.push(current);
      current = { head: note, following: [] };
    } else if (current) {
      current.following.push(note);
    }
  }

  if (current) groups.push(current);
  return groups;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (msgDate < today) {
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
  }
  return time;
}

function resetInputHeight() {
  const input = document.getElementById(
    "message-input",
  ) as HTMLTextAreaElement | null;
  if (input) input.style.height = "auto";
}

export function NotesTab() {
  const [notes, setNotes] = useState<NoteMessage[]>([]);
  const [editingNote, setEditingNote] = useState<NoteMessage | null>(null);

  const lastChannelRef = useRef<string | null>(null);

  const {
    containerRef: messagesContainerRef,
    showScrollBtn,
    scrollToBottom,
    resetForChannel,
  } = useScrollLock({
    isLoadingOlder: false,
    onOlderLoaded: () => {},
    onLoadOlder: () => {},
  });

  useSignalEffect(() => {
    currentChannel.value;
  });

  useEffect(() => {
    const chName = currentChannel.value?.name ?? null;
    if (lastChannelRef.current !== chName) {
      lastChannelRef.current = chName;
      resetForChannel();
    }
    loadNotes();
  }, [currentChannel.value?.name]);

  const loadNotes = async () => {
    const allNotes = await notesChannel.getAllMessages();
    setNotes(allNotes);
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const sendNote = useCallback(async () => {
    const input = document.getElementById(
      "message-input",
    ) as HTMLTextAreaElement | null;
    if (!input || !input.value.trim()) return;
    const content = input.value.trim();
    input.value = "";
    resetInputHeight();

    if (editingNote) {
      await notesChannel.editMessage(editingNote.key, content);
      setEditingNote(null);
    } else {
      await notesChannel.saveMessage(
        content,
        currentUser.value?.username || "you",
      );
    }
    await loadNotes();
  }, [editingNote]);

  const deleteNote = async (key: string) => {
    await notesChannel.deleteMessage(key);
    await loadNotes();
  };

  const startEdit = (note: NoteMessage) => {
    setEditingNote(note);
    const input = document.getElementById(
      "message-input",
    ) as HTMLTextAreaElement | null;
    if (input) {
      input.value = note.content;
      input.focus();
      autoResize(input);
    }
  };

  const cancelEdit = () => {
    setEditingNote(null);
    const input = document.getElementById(
      "message-input",
    ) as HTMLTextAreaElement | null;
    if (input) {
      input.value = "";
      resetInputHeight();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendNote();
    } else if (e.key === "Escape" && editingNote) {
      cancelEdit();
    }
  };

  const handleNoteContextMenu = (e: MouseEvent, note: NoteMessage) => {
    e.preventDefault();
    const isOwn = note.user === (currentUser.value?.username || "you");
    const items: any[] = [];

    if (isOwn) {
      items.push({ label: "Edit", icon: "Edit3", fn: () => startEdit(note) });
    }
    items.push({
      label: "Copy text",
      icon: "Copy",
      fn: () => navigator.clipboard.writeText(note.content),
    });
    items.push({ separator: true });
    items.push({
      label: "Delete",
      icon: "Trash2",
      danger: true,
      fn: () => deleteNote(note.key),
    });

    showContextMenu(e, items);
  };

  const groups = groupNotes(notes);

  return (
    <div className="main-content-wrapper">
      <Header />
      <div className="main-content-area">
        <div className="messages-container">
          <div
            id="notes-messages"
            ref={messagesContainerRef}
            className="messages"
          >
            {notes.length === 0 && (
              <div className="empty-channel-message">
                <div className="empty-channel-icon">📝</div>
                <div className="empty-channel-title">Your Notes</div>
                <div className="empty-channel-text">
                  This is your private notes channel. Only you can see these.
                </div>
              </div>
            )}
            {groups.map((group) => {
              const allNotes = [group.head, ...group.following];
              return allNotes.map((note, idx) => {
                const isHead = idx === 0;
                const groupClass = isHead ? "message-group" : "message-single";
                return (
                  <div
                    key={note.key}
                    className={groupClass}
                    data-msg-id={note.key}
                    onContextMenu={(e: any) => handleNoteContextMenu(e, note)}
                  >
                    {isHead && (
                      <>
                        <img
                          src={avatarUrl(note.user)}
                          className="avatar"
                          alt={note.user}
                        />
                        <div className="message-group-content">
                          <div className="message-header">
                            <span className="username">{note.user}</span>
                            <span className="timestamp">
                              {formatTimestamp(note.timestamp)}
                            </span>
                            {note.edited && (
                              <span className="edited-indicator">(edited)</span>
                            )}
                          </div>
                          <MessageContent
                            content={note.content}
                            currentUsername={currentUser.value?.username}
                            pings={note.pings}
                          />
                        </div>
                      </>
                    )}
                    {!isHead && (
                      <div className="message-group-content">
                        <MessageContent
                          content={note.content}
                          currentUsername={currentUser.value?.username}
                          pings={note.pings}
                        />
                      </div>
                    )}
                  </div>
                );
              });
            })}
          </div>
          {showScrollBtn && (
            <button
              className="scroll-to-bottom-btn"
              onClick={scrollToBottom}
              title="Jump to bottom"
            >
              <Icon name="ArrowDown" size={20} />
            </button>
          )}
          {editingNote && (
            <div className="reply-bar editing-mode active">
              <div className="reply-bar-icon">
                <Icon name="Pencil" size={16} />
              </div>
              <div className="reply-bar-body">
                <div className="reply-bar-label">Editing note</div>
                <div className="reply-bar-preview">
                  <MessageContent
                    content={editingNote.content}
                    currentUsername={currentUser.value?.username}
                    isReply
                  />
                </div>
              </div>
              <button
                className="reply-bar-close icon-btn"
                onClick={cancelEdit}
                title="Cancel"
              >
                <Icon name="X" size={14} />
              </button>
            </div>
          )}
          <div className="input-area">
            <div className="input-wrapper">
              <textarea
                id="message-input"
                placeholder={
                  editingNote ? "Edit your note..." : "Write a note..."
                }
                rows={1}
                onKeyDown={handleKeyDown as any}
                onInput={(e) =>
                  autoResize(e.currentTarget as HTMLTextAreaElement)
                }
              />
              <button className="send-btn" onClick={sendNote}>
                <Icon name="Send" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
