import { currentUser, users } from "../../state";
import { avatarUrl } from "../../utils";
import { MessageContent } from "../MessageContent";
import type { Message } from "../../types";
import { openUserPopout } from "../UserPopout";

export interface MessageGroup {
  head: Message;
  following: Message[];
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;

  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface MessageGroupRowProps {
  group: MessageGroup;
  onClick?: () => void;
  onContextMenu?: (e: any) => void;
}

export function MessageGroupRow({
  group,
  onClick,
  onContextMenu,
}: MessageGroupRowProps) {
  return (
    <div
      className="message-group"
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <img
        src={avatarUrl(group.head.user)}
        className="avatar clickable"
        alt={group.head.user}
        onClick={(e: any) => openUserPopout(e, group.head.user)}
      />
      <div className="message-group-content">
        <div className="message-header">
          <span
            className="username clickable"
            style={{
              color:
                users.value[group.head.user?.toLowerCase()]?.color || undefined,
            }}
            onClick={(e: any) => openUserPopout(e, group.head.user)}
          >
            {group.head.user}
          </span>
          <span className="timestamp">
            {formatRelativeTime(group.head.timestamp)}
          </span>
        </div>
        <div className="message-body">
          <MessageContent
            content={group.head.content}
            currentUsername={currentUser.value?.username}
            authorUsername={group.head.user}
          />
        </div>
        {group.following.length > 0 && (
          <div className="message-group-following">
            {group.following.map((msg) => (
              <div key={msg.id} className="message-single">
                <span className="timestamp">
                  {formatRelativeTime(msg.timestamp)}
                </span>
                <MessageContent
                  content={msg.content}
                  currentUsername={currentUser.value?.username}
                  authorUsername={msg.user}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
