import {
  friends,
  friendRequests,
  blockedUsers,
  currentUser,
  friendNicknames,
} from "../../state";
import {
  openDMWith,
  sendFriendRequest,
  removeFriend,
  acceptFriend,
  denyFriend,
  blockUser,
  unblockUser,
} from "../../lib/actions";
import { showAccountModal } from "../../lib/ui-signals";
import { ContextMenu, type ContextMenuItem } from "../ContextMenu";
import { Icon } from "../Icon";
import { useContextMenu } from "../../hooks/useContextMenu";
import { avatarUrl, reloadAvatar } from "../../utils";
import { useDisplayName } from "../../lib/useDisplayName";
import { saveFriendNicknames } from "../../lib/persistence";
import styles from "./UserContextMenu.module.css";

export interface UserContextMenuProps {
  username: string;
  x: number;
  y: number;
  onClose: () => void;
}

export function UserContextMenu({
  username,
  x,
  y,
  onClose,
}: UserContextMenuProps) {
  const isSelf = username === currentUser.value?.username;
  const isFriend = friends.value.includes(username);
  const isBlocked = blockedUsers.value.includes(username);
  const hasPendingRequest = friendRequests.value.includes(username);
  const currentNickname = friendNicknames.value[username] || "";
  const displayName = useDisplayName(username);

  const setNickname = (newNick: string) => {
    if (newNick.trim()) {
      friendNicknames.value = {
        ...friendNicknames.value,
        [username]: newNick.trim(),
      };
    } else {
      const { [username]: _, ...rest } = friendNicknames.value;
      friendNicknames.value = rest;
    }
    saveFriendNicknames().catch(() => {});
  };

  const items: ContextMenuItem[] = [
    {
      label: "View Profile",
      icon: "User",
      fn: () => {
        showAccountModal.value = username;
      },
    },
    {
      label: "Reload Avatar",
      icon: "RefreshCw",
      fn: () => {
        reloadAvatar(username);
      },
    },
  ];

  if (!isSelf) {
    items.push({
      label: "Message",
      icon: "MessageCircle",
      fn: () => openDMWith(username),
    });

    items.push({ label: "", separator: true, fn: () => {} });

    if (hasPendingRequest) {
      items.push(
        {
          label: "Accept Friend Request",
          icon: "Check",
          fn: () => acceptFriend(username),
        },
        {
          label: "Deny Friend Request",
          icon: "X",
          danger: true,
          fn: () => denyFriend(username),
        },
      );
    } else if (isFriend || isSelf) {
      items.push({
        label: currentNickname ? "Edit Nickname" : "Set Nickname",
        icon: "Edit3",
        fn: () => {
          const newNick = prompt("Enter nickname:", currentNickname);
          if (newNick !== null) setNickname(newNick);
        },
      });
      if (isFriend) {
        items.push({
          label: "Remove Friend",
          icon: "UserX",
          danger: true,
          fn: () => removeFriend(username),
        });
      }
    } else if (!isBlocked) {
      items.push({
        label: "Send Friend Request",
        icon: "UserPlus",
        fn: () => sendFriendRequest(username),
      });
    }

    if (isBlocked) {
      items.push({
        label: "Unblock",
        icon: "ShieldOff",
        fn: () => unblockUser(username),
      });
    } else {
      items.push({
        label: "Block",
        icon: "ShieldOff",
        danger: true,
        fn: () => blockUser(username),
      });
    }
  }

  const header = (
    <>
      <img
        src={avatarUrl(username)}
        className={styles.contextMenuAvatar}
        alt={displayName}
      />
      <div className={styles.contextMenuInfo}>
        <span className={styles.contextMenuName}>{displayName}</span>
        {currentNickname && (
          <span className={styles.contextMenuUsername}>{username}</span>
        )}
        <span className={styles.contextMenuStatus}>
          {isSelf
            ? "You"
            : isFriend
              ? "Friend"
              : hasPendingRequest
                ? "Pending Request"
                : isBlocked
                  ? "Blocked"
                  : ""}
        </span>
      </div>
    </>
  );

  return (
    <ContextMenu x={x} y={y} items={items} onClose={onClose} header={header} />
  );
}

export type UseUserContextMenuResult = ReturnType<typeof useUserContextMenu>;

export function useUserContextMenu() {
  const { show, close, state } = useContextMenu<string>();
  return {
    showUserMenu: show,
    closeUserMenu: close,
    userMenu: state ? { username: state.data, x: state.x, y: state.y } : null,
  };
}
