import { useState, useEffect, useRef } from "preact/hooks";
import {
  serverUrl,
  currentUserByServer,
  currentThread,
  threadsByServer,
  users,
} from "../state";
import { selectThread, deleteThread, getThread } from "../lib/actions";
import { wsSend } from "../lib/websocket";
import { updateThreadInChannel } from "../state";
import { Icon } from "./Icon";
import type { Thread } from "../types";

export interface ThreadContextMenuProps {
  thread: Thread;
  x: number;
  y: number;
  onClose: () => void;
}

export function ThreadContextMenu({
  thread,
  x,
  y,
  onClose,
}: ThreadContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const myUsername = currentUserByServer.value[serverUrl.value]?.username;
  const myRoles = users.value[myUsername?.toLowerCase() || ""]?.roles || [];
  const canManage =
    thread.created_by === myUsername ||
    myUsername === "admin" ||
    myRoles.includes("owner");

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const padding = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let finalX = x;
    let finalY = y;

    if (finalX + menu.offsetWidth > vw - padding)
      finalX = vw - menu.offsetWidth - padding;
    if (finalY + menu.offsetHeight > vh - padding)
      finalY = vh - menu.offsetHeight - padding;
    if (finalX < padding) finalX = padding;
    if (finalY < padding) finalY = padding;

    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;
    menu.style.visibility = "visible";
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const handleOpenThread = () => {
    selectThread(thread);
    getThread(thread.id);
    wsSend({ cmd: "thread_messages", thread_id: thread.id }, serverUrl.value);
    onClose();
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/app/${serverUrl.value}/projects/${thread.id}`;
    navigator.clipboard.writeText(link);
    onClose();
  };

  const handleToggleLock = () => {
    const newLocked = !thread.locked;
    updateThreadInChannel(serverUrl.value, thread.parent_channel, thread.id, {
      locked: newLocked,
    });
    onClose();
  };

  const handleToggleArchive = () => {
    const newArchived = !thread.archived;
    updateThreadInChannel(serverUrl.value, thread.parent_channel, thread.id, {
      archived: newArchived,
    });
    onClose();
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this thread?")) {
      deleteThread(thread.id);
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="user-context-menu"
      style={{ position: "fixed", visibility: "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="user-context-header">
        <div className="user-context-icon">
          <Icon name="MessageSquare" size={20} />
        </div>
        <div className="user-context-info">
          <span className="user-context-name">{thread.name}</span>
          <span className="user-context-status">by {thread.created_by}</span>
        </div>
      </div>

      <div className="user-context-separator" />

      <div className="user-context-item" onClick={handleOpenThread}>
        <Icon name="ExternalLink" size={16} />
        <span>Open Thread</span>
      </div>

      <div className="user-context-item" onClick={handleCopyLink}>
        <Icon name="Link" size={16} />
        <span>Copy Link</span>
      </div>

      {canManage && (
        <>
          <div className="user-context-separator" />

          <div className="user-context-item" onClick={handleToggleLock}>
            <Icon name={thread.locked ? "Unlock" : "Lock"} size={16} />
            <span>{thread.locked ? "Unlock Thread" : "Lock Thread"}</span>
          </div>

          <div className="user-context-item" onClick={handleToggleArchive}>
            <Icon name="Archive" size={16} />
            <span>
              {thread.archived ? "Unarchive Thread" : "Archive Thread"}
            </span>
          </div>

          <div className="user-context-separator" />

          <div className="user-context-item danger" onClick={handleDelete}>
            <Icon name="Trash2" size={16} />
            <span>Delete Thread</span>
          </div>
        </>
      )}
    </div>
  );
}

export interface UseThreadContextMenuResult {
  showThreadMenu: (event: MouseEvent, thread: Thread) => void;
  closeThreadMenu: () => void;
  threadMenu: { thread: Thread; x: number; y: number } | null;
}

export function useThreadContextMenu(): UseThreadContextMenuResult {
  const [threadMenu, setThreadMenu] = useState<{
    thread: Thread;
    x: number;
    y: number;
  } | null>(null);

  const showThreadMenu = (event: MouseEvent, thread: Thread) => {
    event.preventDefault();
    event.stopPropagation();
    setThreadMenu({ thread, x: event.clientX, y: event.clientY });
  };

  const closeThreadMenu = () => setThreadMenu(null);

  return { showThreadMenu, closeThreadMenu, threadMenu };
}
