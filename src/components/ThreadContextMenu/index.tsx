import {
  serverUrl,
  currentUserByServer,
  users,
  hasCapability,
} from "../../state";
import {
  selectThread,
  deleteThread,
  getThread,
  joinThread,
  leaveThread,
} from "../../lib/actions";
import { wsSend } from "../../lib/websocket";
import { ContextMenu, type ContextMenuItem } from "../ContextMenu";
import { Icon } from "../Icon";
import { useContextMenu } from "../../hooks/useContextMenu";
import type { Thread } from "../../types";

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
  const myUsername = currentUserByServer.value[serverUrl.value]?.username;
  const myRoles = users.value[myUsername?.toLowerCase() || ""]?.roles || [];
  const canManage =
    thread.created_by === myUsername ||
    myUsername === "admin" ||
    myRoles.includes("owner");

  const supportsJoinLeave =
    hasCapability("thread_join") && hasCapability("thread_leave");
  const isParticipant = thread.participants?.includes(myUsername || "");

  const items: ContextMenuItem[] = [
    {
      label: "Open Thread",
      icon: "ExternalLink",
      fn: () => {
        selectThread(thread);
        getThread(thread.id);
        wsSend(
          { cmd: "thread_messages", thread_id: thread.id },
          serverUrl.value,
        );
      },
    },
    {
      label: "Copy Link",
      icon: "Link",
      fn: () => {
        const link = `https://originchats.mistium.com/app/${serverUrl.value}/projects/${thread.id}`;
        navigator.clipboard.writeText(link);
      },
    },
  ];

  if (supportsJoinLeave && !thread.locked) {
    items.push({ label: "", separator: true, fn: () => {} });

    if (isParticipant) {
      items.push({
        label: "Leave Thread",
        icon: "UserMinus",
        fn: () => {
          leaveThread(thread.id);
          onClose();
        },
      });
    } else {
      items.push({
        label: "Join Thread",
        icon: "UserPlus",
        fn: () => {
          joinThread(thread.id);
          onClose();
        },
      });
    }
  }

  if (canManage) {
    items.push({ label: "", separator: true, fn: () => {} });

    items.push({
      label: thread.locked ? "Unlock Thread" : "Lock Thread",
      icon: thread.locked ? "Unlock" : "Lock",
      fn: () => {
        wsSend(
          {
            cmd: "thread_update",
            thread_id: thread.id,
            channel: thread.parent_channel,
            locked: !thread.locked,
          },
          serverUrl.value,
        );
        onClose();
      },
    });

    items.push({
      label: thread.archived ? "Unarchive Thread" : "Archive Thread",
      icon: "Archive",
      fn: () => {
        wsSend(
          {
            cmd: "thread_update",
            thread_id: thread.id,
            channel: thread.parent_channel,
            archived: !thread.archived,
          },
          serverUrl.value,
        );
        onClose();
      },
    });

    items.push({ label: "", separator: true, fn: () => {} });

    items.push({
      label: "Delete Thread",
      icon: "Trash2",
      danger: true,
      fn: () => {
        if (confirm("Are you sure you want to delete this thread?")) {
          deleteThread(thread.id);
        }
        onClose();
      },
    });
  }

  const header = (
    <>
      <div className="context-menu-icon">
        <Icon name="MessageSquare" size={20} />
      </div>
      <div className="context-menu-info">
        <span className="context-menu-name">{thread.name}</span>
        <span className="context-menu-status">
          by {thread.created_by}
          {thread.participants && thread.participants.length > 0 && (
            <span className="context-menu-participants">
              {" · "}
              <Icon name="Users" size={10} />
              {thread.participants.length}
            </span>
          )}
        </span>
      </div>
    </>
  );

  return (
    <ContextMenu x={x} y={y} items={items} onClose={onClose} header={header} />
  );
}

export type UseThreadContextMenuResult = ReturnType<
  typeof useThreadContextMenu
>;

export function useThreadContextMenu() {
  const { show, close, state } = useContextMenu<Thread>();
  return {
    showThreadMenu: show,
    closeThreadMenu: close,
    threadMenu: state ? { thread: state.data, x: state.x, y: state.y } : null,
  };
}
