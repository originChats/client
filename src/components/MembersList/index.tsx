import { useMemo } from "preact/hooks";
import { memo } from "preact/compat";
import {
  serverUrl,
  users,
  currentChannel,
  currentThread,
  rolesByServer,
  DM_SERVER_URL,
  hasCapability,
} from "../../state";
import { renderMembersSignal, mobilePanelOpen } from "../../lib/ui-signals";
import { Icon } from "../Icon";
import { UserContextMenu, useUserContextMenu } from "../UserContextMenu";
import { openUserPopout } from "../UserPopout";
import { UserAvatar } from "../UserAvatar";
import { useDisplayName } from "../../lib/useDisplayName";
import { MessageContent } from "../MessageContent";
import styles from "./MembersList.module.css";

function MembersListInner() {
  const { showUserMenu, closeUserMenu, userMenu } = useUserContextMenu();

  const isDM = serverUrl.value === DM_SERVER_URL;
  const thread = currentThread.value;

  let memberList: Array<{
    username: string;
    nickname?: string;
    status?: { status: string; text?: string };
    color: string | null;
    roles: string[];
  }>;

  if (isDM) {
    const viewRoles = currentChannel.value?.permissions?.view;
    memberList = Object.values(users.value)
      .filter((u) => {
        if (!viewRoles || viewRoles.length === 0) return true;
        const userRoles = u.roles || [];
        return viewRoles.some((r) => userRoles.includes(r));
      })
      .map((u) => ({
        username: u.username,
        nickname: u.nickname,
        status: u.status,
        color: u.color || null,
        roles: u.roles || [],
      }));
  } else {
    const viewRoles = currentChannel.value?.permissions?.view;
    memberList = Object.values(users.value)
      .filter((u) => {
        if (!viewRoles || viewRoles.length === 0) return true;
        const userRoles = u.roles || [];
        return viewRoles.some((r) => userRoles.includes(r));
      })
      .map((u) => ({
        username: u.username,
        nickname: u.nickname,
        status: u.status,
        color: u.color || null,
        roles: u.roles || [],
      }));
  }

  if (thread && thread.participants) {
    memberList = memberList.filter((m) => thread.participants?.includes(m.username));
  }

  const rolesMap = rolesByServer.value[serverUrl.value] || {};
  const hoistedRoles = Object.entries(rolesMap)
    .filter(([, role]) => role.hoisted === true)
    .map(([name, role], i) => ({
      name,
      color: role.color || null,
      position: role.position ?? i,
    }))
    .sort((a, b) => a.position - b.position);

  const showStatus = hasCapability("status_get");

  const getHoistedRole = (member: (typeof memberList)[number]): string | null => {
    for (const hoisted of hoistedRoles) {
      if (member.roles.includes(hoisted.name)) return hoisted.name;
    }
    return null;
  };

  const assignedToHoisted = new Set<string>();

  const isOnline = (status: { status: string; text?: string } | undefined) =>
    typeof status === "undefined" || status.status !== "offline";

  const hoistedSections = hoistedRoles
    .map(({ name, color }) => {
      const members = memberList
        .filter((m) => isOnline(m.status) && getHoistedRole(m) === name)
        .sort((a, b) => a.username.localeCompare(b.username));
      members.forEach((m) => assignedToHoisted.add(m.username));
      return { roleName: name, color, members };
    })
    .filter((s) => s.members.length > 0);

  const remainder = memberList.filter((m) => !assignedToHoisted.has(m.username));
  const onlineRemainder = remainder
    .filter((u) => isOnline(u.status))
    .sort((a, b) => a.username.localeCompare(b.username));
  const offlineRemainder = remainder
    .filter((u) => !isOnline(u.status))
    .sort((a, b) => a.username.localeCompare(b.username));

  const totalOnline =
    hoistedSections.reduce((sum, s) => sum + s.members.length, 0) + onlineRemainder.length;
  const totalOffline = offlineRemainder.length;

  return (
    <div
      className={`members-list ${styles.membersList}${mobilePanelOpen.value ? ` ${styles.open}` : ""}`}
    >
      <div className={styles.membersHeaderMobile}>
        <h3>Members</h3>
        <span className={styles.membersCount}>{totalOnline + totalOffline} members</span>
        <button
          className={styles.rightPanelClose}
          onClick={() => {
            mobilePanelOpen.value = false;
          }}
          aria-label="Close"
        >
          <Icon name="X" size={18} />
        </button>
      </div>
      <div className={styles.membersListContent}>
        <>
          {hoistedSections.map(({ roleName, color, members }) => (
            <div key={roleName} className={styles.roleSection}>
              <h2 style={color ? { color } : undefined}>
                {roleName} — {members.length}
              </h2>
              {members.map((user) => (
                <MemberItem
                  key={user.username}
                  user={user}
                  offline={!isOnline(user.status)}
                  onContextMenu={showUserMenu}
                  showStatus={showStatus}
                />
              ))}
            </div>
          ))}

          {onlineRemainder.length > 0 && (
            <>
              <h2>Online — {onlineRemainder.length}</h2>
              {onlineRemainder.map((user) => (
                <MemberItem
                  key={user.username}
                  user={user}
                  onContextMenu={showUserMenu}
                  showStatus={showStatus}
                />
              ))}
            </>
          )}
          {offlineRemainder.length > 0 && (
            <>
              <h2>Offline — {offlineRemainder.length}</h2>
              {offlineRemainder.map((user) => (
                <MemberItem
                  key={user.username}
                  user={user}
                  offline
                  onContextMenu={showUserMenu}
                  showStatus={showStatus}
                />
              ))}
            </>
          )}
        </>
      </div>

      {userMenu && (
        <UserContextMenu
          username={userMenu.username}
          x={userMenu.x}
          y={userMenu.y}
          onClose={closeUserMenu}
        />
      )}
    </div>
  );
}

function MemberItemInner({
  user,
  offline,
  onContextMenu,
  showStatus,
}: {
  user: any;
  offline?: boolean;
  onContextMenu: (e: MouseEvent, username: string) => void;
  showStatus?: boolean;
}) {
  const displayName = useDisplayName(user.username);
  const statusClass = user.status?.status || "offline";
  const statusText = user.status?.text;
  const isOwner = user.roles?.includes("owner");
  return (
    <div
      className={`${styles.member}${offline ? ` ${styles.offline}` : ""}`}
      onClick={(e: any) => openUserPopout(e, user.username, true)}
      onContextMenu={(e: any) => onContextMenu(e, user.username)}
    >
      <div className={styles.memberAvatarWrapper}>
        <UserAvatar
          username={user.username}
          nickname={user.nickname}
          pfp={user.pfp}
          cracked={user.cracked}
          alt={displayName}
        />
        {showStatus && !offline && (
          <div className={`${styles.memberStatusIndicator} ${styles[statusClass]}`} />
        )}
      </div>
      <div className={styles.memberInfo}>
        <span className={styles.name} style={user.color ? { color: user.color } : undefined}>
          {displayName} {isOwner && <Icon name="Crown" size={14} />}
        </span>
        {showStatus && statusText && !offline && (
          <span className={styles.statusText}>
            <MessageContent content={statusText} isReply />
          </span>
        )}
      </div>
    </div>
  );
}

const MemberItem = memo(MemberItemInner);

export const MembersList = memo(MembersListInner);
