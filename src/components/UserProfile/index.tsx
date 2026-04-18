import { useEffect, useState } from "preact/hooks";
import {
  friends,
  friendRequests,
  blockedUsers,
  currentUser,
  serverUrl,
  usersByServer,
  servers,
  DM_SERVER_URL,
  roturFollowing,
  roturStatuses,
  friendNicknames,
  rolesByServer,
} from "../../state";
import {
  switchServer,
  openDMWith,
  sendFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
} from "../../lib/actions";
import { showAccountModal } from "../../lib/ui-signals";
import { Icon, ServerIcon } from "../Icon";
import type { RoturAccount, RoturProfile, Server } from "../../types";
import { formatJoinDate } from "../../lib/date-utils";
import { isCrackedAccount } from "../../utils";
import { UserAvatar } from "../UserAvatar";
import { useDisplayName } from "../../lib/useDisplayName";
import { getProfile as fetchRoturProfile, followUser, unfollowUser } from "../../lib/rotur-api";
import { toggleFollowUser } from "../../lib/follow";
import styles from "./ProfileCard.module.css";

function useProfile(username: string) {
  const [profile, setProfile] = useState<RoturProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(() =>
    roturFollowing.value.has(username.toLowerCase())
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setProfile(null);
    setIsFollowing(roturFollowing.value.has(username.toLowerCase()));

    if (isCrackedAccount(username)) {
      const serverUsers = usersByServer.read(serverUrl.value) || {};
      const serverUser = serverUsers[username.toLowerCase()];
      if (serverUser) {
        setProfile({
          username: serverUser.username,
          pfp: serverUser.pfp,
          nickname: serverUser.nickname,
        } as RoturProfile);
      } else {
        setProfile({ username } as RoturProfile);
      }
      setLoading(false);
      return () => controller.abort();
    }

    fetchRoturProfile(username, false, controller.signal)
      .then((profileData) => {
        setProfile(profileData);
        if (profileData.followed !== undefined) {
          setIsFollowing(profileData.followed);
          const lower = username.toLowerCase();
          if (profileData.followed) {
            roturFollowing.value = new Set([...roturFollowing.value, lower]);
          } else {
            roturFollowing.value = new Set([...roturFollowing.value].filter((u) => u !== lower));
          }
        }
        if (profileData.customStatus) {
          roturStatuses.value = {
            ...roturStatuses.value,
            [username.toLowerCase()]: profileData.customStatus,
          };
        }
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false);
      });

    return () => controller.abort();
  }, [username]);

  const toggleFollow = async () => {
    await toggleFollowUser(
      username,
      isFollowing,
      setIsFollowing,
      setProfile,
      profile,
      console.error
    );
  };

  return { profile, loading, isFollowing, toggleFollow };
}

export function getUserStatus(username: string): string {
  const sUrl = serverUrl.value;
  const usersMap = usersByServer.read(sUrl) || {};
  const lower = username.toLowerCase();
  for (const [key, u] of Object.entries(usersMap)) {
    if (key.toLowerCase() === lower) {
      return u.status?.status || "offline";
    }
  }
  return "offline";
}

export function getUserRoles(username: string): string[] {
  const sUrl = serverUrl.value;
  if (sUrl === DM_SERVER_URL) return [];
  const usersMap = usersByServer.read(sUrl) || {};
  const lower = username.toLowerCase();
  for (const [key, u] of Object.entries(usersMap)) {
    if (key.toLowerCase() === lower) {
      return u.roles || [];
    }
  }
  return [];
}

function getFriendState(username: string): "self" | "friend" | "pending" | "blocked" | "none" {
  if (username === currentUser.value?.username) return "self";
  if (friends.value.includes(username)) return "friend";
  if (friendRequests.value.includes(username)) return "pending";
  if (blockedUsers.value.includes(username)) return "blocked";
  return "none";
}

function friendStateLabel(state: ReturnType<typeof getFriendState>): string {
  switch (state) {
    case "self":
      return "You";
    case "friend":
      return "Friends";
    case "pending":
      return "Pending Request";
    case "blocked":
      return "Blocked";
    default:
      return "";
  }
}

function getMutualServers(username: string): Server[] {
  const myUsername = currentUser.value?.username;
  if (!myUsername) return [];

  const mutuals: Server[] = [];
  const lower = username.toLowerCase();

  for (const server of servers.value) {
    const sUrl = server.url;
    const usersMap = usersByServer.read(sUrl);
    if (!usersMap) continue;
    if (usersMap[lower]) {
      mutuals.push(server);
    }
  }
  return mutuals;
}

function ProfileActions({
  username,
  onAction,
  compact,
}: {
  username: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  const friendState = getFriendState(username);
  if (friendState === "self") return null;

  const handleMessage = () => {
    openDMWith(username);
    onAction?.();
  };

  const handleFriend = () => {
    if (friendState === "friend") {
      removeFriend(username);
    } else if (friendState === "none") {
      sendFriendRequest(username);
    }
    onAction?.();
  };

  const handleBlock = () => {
    if (friendState === "blocked") {
      unblockUser(username);
    } else {
      blockUser(username);
    }
    onAction?.();
  };

  const handleViewProfile = () => {
    showAccountModal.value = username;
  };

  if (compact) {
    return (
      <div className={`${styles.profileActions} ${styles.compact}`}>
        <button className={styles.profileActionBtn} onClick={handleMessage} title="Message">
          <Icon name="MessageCircle" size={16} />
        </button>
        {friendState === "friend" ? (
          <button
            className={`${styles.profileActionBtn} ${styles.danger}`}
            onClick={handleFriend}
            title="Remove Friend"
          >
            <Icon name="UserX" size={16} />
          </button>
        ) : friendState === "none" ? (
          <button className={styles.profileActionBtn} onClick={handleFriend} title="Add Friend">
            <Icon name="UserPlus" size={16} />
          </button>
        ) : null}
        {friendState === "blocked" ? (
          <button className={styles.profileActionBtn} onClick={handleBlock} title="Unblock">
            <Icon name="ShieldOff" size={16} />
          </button>
        ) : (
          <button
            className={`${styles.profileActionBtn} ${styles.danger}`}
            onClick={handleBlock}
            title="Block"
          >
            <Icon name="ShieldOff" size={16} />
          </button>
        )}
        <button
          className={styles.profileActionBtn}
          onClick={handleViewProfile}
          title="View Full Profile"
        >
          <Icon name="ExternalLink" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.profileActions}>
      <button className={styles.profileActionBtnWide} onClick={handleMessage}>
        <Icon name="MessageCircle" size={16} />
        <span>Message</span>
      </button>
      {friendState === "friend" ? (
        <button
          className={`${styles.profileActionBtnWide} ${styles.danger}`}
          onClick={handleFriend}
        >
          <Icon name="UserX" size={16} />
          <span>Remove Friend</span>
        </button>
      ) : friendState === "none" ? (
        <button className={styles.profileActionBtnWide} onClick={handleFriend}>
          <Icon name="UserPlus" size={16} />
          <span>Add Friend</span>
        </button>
      ) : null}
      {friendState === "blocked" ? (
        <button className={styles.profileActionBtnWide} onClick={handleBlock}>
          <Icon name="ShieldOff" size={16} />
          <span>Unblock</span>
        </button>
      ) : (
        <button className={`${styles.profileActionBtnWide} ${styles.danger}`} onClick={handleBlock}>
          <Icon name="ShieldOff" size={16} />
          <span>Block</span>
        </button>
      )}
    </div>
  );
}

export function UserProfileCard({
  username,
  onClose,
  compact,
  compactActions,
}: {
  username: string;
  onClose?: () => void;
  compact?: boolean;
  compactActions?: boolean;
}) {
  const { profile, loading, isFollowing, toggleFollow } = useProfile(username);
  const displayName = useDisplayName(username);
  const hasNickname = friendNicknames.value[username];
  const statusClass = getUserStatus(username);
  const userRoles = getUserRoles(username);
  const friendState = getFriendState(username);
  const stateLabel = friendStateLabel(friendState);
  const mutualServers = getMutualServers(username);
  const customStatus = roturStatuses.value[username.toLowerCase()] || null;

  const joinedDate = profile?.created ? formatJoinDate(profile.created) : null;

  const sUrl = serverUrl.value;
  const serverRoles = sUrl ? rolesByServer.read(sUrl) || {} : {};

  const getRoleColor = (roleName: string): string | null => {
    const role = serverRoles[roleName];
    return role?.color || null;
  };

  // --- Compact (popout) layout ---
  if (compact) {
    if (loading) {
      return (
        <div className={styles.profileCard}>
          <div className={styles.profileCardLoading}>
            <div className={styles.accountLoadingSpinner} />
          </div>
        </div>
      );
    }

    if (!profile) {
      return (
        <div className={styles.profileCard}>
          <div className={styles.profileCardError}>Could not load profile</div>
        </div>
      );
    }

    return (
      <div className={styles.profileCard}>
        <div className={styles.profileCardBanner}>
          {profile.banner && <img src={profile.banner} alt="" />}
        </div>
        <div className={styles.profileCardAvatarRow}>
          <div className={styles.profileCardAvatar}>
            <UserAvatar
              username={profile.username}
              nickname={
                usersByServer.read(serverUrl.value)?.[profile.username?.toLowerCase()]?.nickname
              }
              pfp={profile.pfp}
              alt={profile.username}
            />
            <div className={`${styles.profileCardStatus} ${styles[statusClass]}`} />
          </div>
          {profile.system && (
            <div className={styles.profileCardSystemPill}>
              <Icon name="Monitor" size={11} />
              <span>{profile.system}</span>
            </div>
          )}
        </div>
        <div className={styles.profileCardBody}>
          <div
            className={`${styles.profileCardUsername} ${styles.clickable}`}
            onClick={() => (showAccountModal.value = username)}
          >
            {displayName}
          </div>
          <div className={styles.profileCardStatusText}>
            <span className={`${styles.statusDot} ${styles[statusClass]}`} />
            <span>
              {statusClass === "online"
                ? "Online"
                : statusClass === "idle"
                  ? "Idle"
                  : statusClass === "dnd"
                    ? "Do Not Disturb"
                    : "Offline"}
            </span>
          </div>
          {profile.pronouns && <div className={styles.profileCardPronouns}>{profile.pronouns}</div>}
          {customStatus?.content && (
            <div className={styles.profileCardCustomStatus}>
              <span className={styles.profileCardCustomStatusText}>{customStatus.content}</span>
            </div>
          )}
          {stateLabel && (
            <div className={`${styles.profileCardFriendState} ${styles[friendState]}`}>
              {stateLabel}
            </div>
          )}
          {profile.bio && (
            <div className={styles.profileCardSection}>
              <div className={styles.profileCardSectionTitle}>About Me</div>
              <div className={styles.profileCardBio}>{profile.bio}</div>
            </div>
          )}
          {userRoles.length > 0 && (
            <div className={styles.profileCardSection}>
              <div className={styles.profileCardSectionTitle}>Roles</div>
              <div className={styles.profileCardRoles}>
                {userRoles.map((role) => {
                  const color = getRoleColor(role);
                  return (
                    <span key={role} className={styles.profileCardRole}>
                      {color && (
                        <span
                          className={styles.profileCardRoleColor}
                          style={{ backgroundColor: color }}
                        />
                      )}
                      {role}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {joinedDate && (
            <div className={styles.profileCardSection}>
              <div className={styles.profileCardMeta}>
                <Icon name="Calendar" size={14} />
                <span>{joinedDate}</span>
              </div>
            </div>
          )}
        </div>
        <ProfileActions username={username} compact onAction={onClose} />
      </div>
    );
  }

  // --- Full (panel) layout ---
  if (loading) {
    return (
      <div className={styles.profilePanel}>
        <div className={styles.profileCardLoading}>
          <div className={styles.accountLoadingSpinner} />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.profilePanel}>
        <div className={styles.profileCardError}>Could not load profile</div>
      </div>
    );
  }

  return (
    <div className={styles.profilePanel}>
      <div className={styles.profilePanelContent}>
        <div className={styles.profilePanelBanner}>
          {profile.banner && <img src={profile.banner} alt="" />}
          {profile.system && (
            <div className={styles.profileCardSystemPill}>
              <Icon name="Monitor" size={11} />
              <span>{profile.system}</span>
            </div>
          )}
        </div>
        <div className={styles.profilePanelAvatarRow}>
          <div className={styles.profilePanelAvatar}>
            <UserAvatar
              username={profile.username}
              nickname={
                usersByServer.read(serverUrl.value)?.[profile.username?.toLowerCase()]?.nickname
              }
              pfp={profile.pfp}
              alt={profile.username}
            />
            <div className={`${styles.profileCardStatus} ${styles[statusClass]}`} />
          </div>
        </div>
        <div className={styles.profilePanelInfo}>
          <div
            className={`${styles.profilePanelUsername} ${styles.clickable}`}
            onClick={() => (showAccountModal.value = username)}
          >
            {displayName}
          </div>
          {profile.pronouns && (
            <div className={styles.profilePanelPronouns}>{profile.pronouns}</div>
          )}
          {customStatus?.content && (
            <div className={styles.profileCardCustomStatus}>
              <span className={styles.profileCardCustomStatusText}>{customStatus.content}</span>
            </div>
          )}
          {stateLabel && (
            <div className={`${styles.profileCardFriendState} ${styles[friendState]}`}>
              {stateLabel}
            </div>
          )}
        </div>

        <div className={styles.profilePanelStats}>
          <div className={styles.profilePanelStat}>
            <div className={styles.profilePanelStatValue}>{profile.followers || 0}</div>
            <div className={styles.profilePanelStatLabel}>Followers</div>
          </div>
          <div className={styles.profilePanelStat}>
            <div className={styles.profilePanelStatValue}>{profile.following || 0}</div>
            <div className={styles.profilePanelStatLabel}>Following</div>
          </div>
          <div className={styles.profilePanelStat}>
            <div className={styles.profilePanelStatValue}>
              {profile.currency?.toLocaleString() || 0}
            </div>
            <div className={styles.profilePanelStatLabel}>Credits</div>
          </div>
          <div className={styles.profilePanelStat}>
            <div className={styles.profilePanelStatValue}>{profile.subscription || "Free"}</div>
            <div className={styles.profilePanelStatLabel}>Tier</div>
          </div>
        </div>

        {/* Follow button — only show for other users */}
        {friendState !== "self" && (
          <button
            className={`${styles.profileFollowBtn}${isFollowing ? ` ${styles.following}` : ""}`}
            onClick={toggleFollow}
            title={isFollowing ? "Unfollow" : "Follow on Rotur"}
          >
            <Icon name={isFollowing ? "UserCheck" : "UserPlus"} size={14} />
            <span>{isFollowing ? "Following" : "Follow"}</span>
            {profile.follows_me && <span className={styles.profileFollowsMePill}>Follows you</span>}
          </button>
        )}

        {profile.bio && (
          <div className={styles.profilePanelSection}>
            <div className={styles.profilePanelSectionTitle}>About Me</div>
            <div className={styles.profilePanelBio}>{profile.bio}</div>
          </div>
        )}

        {profile.groups && profile.groups.length > 0 && (
          <div className={styles.profilePanelSection}>
            <div className={styles.profilePanelSectionTitle}>Groups</div>
            <div className={styles.profileGroups}>
              {profile.groups.map((tag) => (
                <span key={tag} className={styles.profileGroupTag}>
                  @{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {userRoles.length > 0 && (
          <div className={styles.profilePanelSection}>
            <div className={styles.profilePanelSectionTitle}>Roles</div>
            <div className={styles.profileCardRoles}>
              {userRoles.map((role) => (
                <span key={role} className={styles.profileCardRole}>
                  {role}
                </span>
              ))}
            </div>
          </div>
        )}

        {mutualServers.length > 0 && (
          <div className={styles.profilePanelSection}>
            <div className={styles.profilePanelSectionTitle}>
              Mutual Servers — {mutualServers.length}
            </div>
            <div className={styles.profileMutualServers}>
              {mutualServers.map((server) => (
                <div
                  key={server.url}
                  className={`${styles.profileMutualServer} ${styles.clickable}`}
                  onClick={() => switchServer(server.url)}
                  title={server.name}
                >
                  <div className={styles.profileMutualServerIcon}>
                    <ServerIcon server={server} />
                  </div>
                  <span className={styles.profileMutualServerName}>{server.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {joinedDate && (
          <div className={styles.profilePanelSection}>
            <div className={styles.profilePanelSectionTitle}>Member Since</div>
            <div className={styles.profileCardMeta}>
              <Icon name="Calendar" size={14} />
              <span>{joinedDate}</span>
            </div>
          </div>
        )}

        <ProfileActions username={username} compact={compactActions} />
      </div>
    </div>
  );
}
