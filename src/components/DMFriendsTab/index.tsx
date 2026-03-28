import { useSignalEffect } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import {
  currentChannel,
  friends,
  friendRequests,
  blockedUsers,
  dmServers,
  roturMyGroups,
  roturStatuses,
} from "../../state";
import { currentDMTab, showAccountModal } from "../../lib/ui-signals";
import {
  switchServer,
  selectChannel,
  openDMWith,
  removeFriend,
  acceptFriend,
  denyFriend,
  unblockUser,
  sendFriendRequest,
} from "../../lib/actions";
import {
  getMyGroups,
  searchGroups,
  joinGroup,
  leaveGroup,
  getStatus,
} from "../../lib/rotur-api";
import { Icon } from "../Icon";
import { MessageContent } from "../MessageContent";
import { avatarUrl } from "../../utils";
import { useDisplayName } from "../../lib/useDisplayName";
import type { RoturGroup } from "../../types";
import { Header } from "../Header";

export function DMFriendsTab() {
  useSignalEffect(() => {
    currentDMTab.value;
    friends.value;
    friendRequests.value;
    blockedUsers.value;
  });

  const tab = currentDMTab.value;

  return (
    <div className="dm-friends-container">
      <Header />
      <div className="dm-tabs">
        <button
          className={`dm-tab ${tab === "friends" ? "active" : ""}`}
          onClick={() => (currentDMTab.value = "friends")}
        >
          All
          {friends.value.length > 0 && (
            <span className="dm-tab-count">{friends.value.length}</span>
          )}
        </button>
        <button
          className={`dm-tab ${tab === "requests" ? "active" : ""}`}
          onClick={() => (currentDMTab.value = "requests")}
        >
          Pending
          {friendRequests.value.length > 0 && (
            <span className="dm-tab-count dm-tab-count-pending">
              {friendRequests.value.length}
            </span>
          )}
        </button>
        <button
          className={`dm-tab ${tab === "blocked" ? "active" : ""}`}
          onClick={() => (currentDMTab.value = "blocked")}
        >
          Blocked
        </button>
        <button
          className={`dm-tab ${tab === "groups" ? "active" : ""}`}
          onClick={() => (currentDMTab.value = "groups")}
        >
          Groups
          {roturMyGroups.value.length > 0 && (
            <span className="dm-tab-count">{roturMyGroups.value.length}</span>
          )}
        </button>
      </div>
      <div className="dm-list">
        {tab === "friends" && <FriendsList />}
        {tab === "requests" && <RequestsList />}
        {tab === "blocked" && <BlockedList />}
        {tab === "groups" && <GroupsList />}
      </div>
    </div>
  );
}

// ── Friends tab ───────────────────────────────────────────────────────────────

function FriendsList() {
  const list = friends.value;
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const username = addInput.trim();
    if (!username) return;
    setAdding(true);
    setAddError(null);
    setAddSuccess(false);
    try {
      await sendFriendRequest(username);
      setAddSuccess(true);
      setAddInput("");
      setTimeout(() => setAddSuccess(false), 3000);
    } catch (e: any) {
      setAddError(e.message || "Failed to send request");
    } finally {
      setAdding(false);
    }
  };

  const openDM = (username: string) => openDMWith(username);

  const handleRemoveFriend = async (username: string) => {
    if (confirm(`Remove ${username} from friends?`)) {
      try {
        await removeFriend(username);
      } catch (e: any) {
        console.error("Failed to remove friend:", e);
      }
    }
  };

  return (
    <>
      {/* Add friend input */}
      <div className="dm-add-friend">
        <div className="dm-add-friend-row">
          <input
            className="dm-add-friend-input"
            type="text"
            placeholder="Add friend by username…"
            value={addInput}
            onInput={(e) => {
              setAddInput((e.target as HTMLInputElement).value);
              setAddError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <button
            className="dm-add-friend-btn"
            onClick={handleAdd}
            disabled={adding || !addInput.trim()}
            title="Send friend request"
          >
            <Icon name="UserPlus" size={16} />
          </button>
        </div>
        {addError && <div className="dm-add-friend-error">{addError}</div>}
        {addSuccess && (
          <div className="dm-add-friend-success">Request sent!</div>
        )}
      </div>

      {list.length === 0 ? (
        <div className="dm-empty">
          <Icon name="UserPlus" size={48} />
          <h3>No friends yet</h3>
          <p>Add friends to start messaging</p>
        </div>
      ) : (
        list.map((username) => (
          <FriendItem
            key={username}
            username={username}
            onMessage={() => openDM(username)}
            onRemove={() => handleRemoveFriend(username)}
          />
        ))
      )}
    </>
  );
}

function FriendItem({
  username,
  onMessage,
  onRemove,
}: {
  username: string;
  onMessage: () => void;
  onRemove: () => void;
}) {
  const status = roturStatuses.value[username.toLowerCase()];
  const displayName = useDisplayName(username);

  // Fetch status on first render if not cached
  useEffect(() => {
    if (!roturStatuses.value[username.toLowerCase()]) {
      getStatus(username).then((s) => {
        if (s) {
          roturStatuses.value = {
            ...roturStatuses.value,
            [username.toLowerCase()]: s,
          };
        }
      });
    }
  }, [username]);

  return (
    <div className="dm-friend-item">
      <img
        src={avatarUrl(username)}
        className="dm-avatar"
        onClick={() => (showAccountModal.value = username)}
      />
      <div className="dm-friend-info">
        <span
          className="dm-username"
          onClick={() => (showAccountModal.value = username)}
        >
          {displayName}
        </span>
        {status?.content && (
          <span className="dm-friend-status">
            <MessageContent content={status.content} isReply />
          </span>
        )}
      </div>
      <div className="dm-actions">
        <button className="dm-action-btn" title="Message" onClick={onMessage}>
          <Icon name="MessageCircle" size={18} />
        </button>
        <button
          className="dm-action-btn dm-action-danger"
          title="Remove Friend"
          onClick={onRemove}
        >
          <Icon name="UserX" size={18} />
        </button>
      </div>
    </div>
  );
}

// ── Requests tab ──────────────────────────────────────────────────────────────

function RequestsList() {
  const list = friendRequests.value;

  if (list.length === 0) {
    return (
      <div className="dm-empty">
        <Icon name="Inbox" size={48} />
        <h3>No pending requests</h3>
        <p>Friend requests will appear here</p>
      </div>
    );
  }

  return (
    <>
      {list.map((username) => (
        <RequestItem key={username} username={username} />
      ))}
    </>
  );
}

function RequestItem({ username }: { username: string }) {
  const displayName = useDisplayName(username);
  return (
    <div className="dm-friend-item">
      <img
        src={avatarUrl(username)}
        className="dm-avatar"
        onClick={() => (showAccountModal.value = username)}
      />
      <span className="dm-username">{displayName}</span>
      <div className="dm-actions">
        <button
          className="dm-action-btn dm-action-accept"
          title="Accept"
          onClick={() => acceptFriend(username).catch(console.error)}
        >
          <Icon name="Check" size={18} />
        </button>
        <button
          className="dm-action-btn dm-action-danger"
          title="Deny"
          onClick={() => denyFriend(username).catch(console.error)}
        >
          <Icon name="X" size={18} />
        </button>
      </div>
    </div>
  );
}

// ── Blocked tab ───────────────────────────────────────────────────────────────

function BlockedList() {
  const list = blockedUsers.value;

  if (list.length === 0) {
    return (
      <div className="dm-empty">
        <Icon name="ShieldOff" size={48} />
        <h3>No blocked users</h3>
        <p>Blocked users will appear here</p>
      </div>
    );
  }

  return (
    <>
      {list.map((username) => (
        <BlockedItem key={username} username={username} />
      ))}
    </>
  );
}

function BlockedItem({ username }: { username: string }) {
  const displayName = useDisplayName(username);
  return (
    <div className="dm-friend-item">
      <img src={avatarUrl(username)} className="dm-avatar" />
      <span className="dm-username">{displayName}</span>
      <div className="dm-actions">
        <button
          className="dm-action-btn"
          title="Unblock"
          onClick={() => unblockUser(username).catch(console.error)}
        >
          <Icon name="ShieldOff" size={18} />
        </button>
      </div>
    </div>
  );
}

// ── Groups tab ────────────────────────────────────────────────────────────────

function GroupsList() {
  const myGroups = roturMyGroups.value;
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<RoturGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Reload my groups on mount
  useEffect(() => {
    setLoading(true);
    getMyGroups()
      .then((g) => {
        roturMyGroups.value = g;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = async () => {
    const q = search.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchGroups(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleJoin = async (tag: string) => {
    try {
      await joinGroup(tag);
      setActionMsg(`Joined ${tag}!`);
      const joined = searchResults.find((g) => g.tag === tag);
      if (joined) {
        roturMyGroups.value = [
          ...roturMyGroups.value,
          { ...joined, is_member: true },
        ];
      }
      setSearchResults((prev) =>
        prev.map((g) => (g.tag === tag ? { ...g, is_member: true } : g)),
      );
    } catch (e: any) {
      setActionMsg(e.message || "Failed to join");
    } finally {
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const handleLeave = async (tag: string) => {
    if (!confirm(`Leave group ${tag}?`)) return;
    try {
      await leaveGroup(tag);
      setActionMsg(`Left ${tag}.`);
      roturMyGroups.value = roturMyGroups.value.filter((g) => g.tag !== tag);
    } catch (e: any) {
      setActionMsg(e.message || "Failed to leave");
    } finally {
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const displayList = search.trim() ? searchResults : myGroups;

  return (
    <div className="groups-tab">
      {/* Search bar */}
      <div className="dm-add-friend">
        <div className="dm-add-friend-row">
          <input
            className="dm-add-friend-input"
            type="text"
            placeholder="Search groups…"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
          <button
            className="dm-add-friend-btn"
            onClick={handleSearch}
            disabled={searching}
            title="Search"
          >
            <Icon name={searching ? "Loader" : "Search"} size={16} />
          </button>
        </div>
        {actionMsg && <div className="dm-add-friend-success">{actionMsg}</div>}
      </div>

      {loading ? (
        <div className="dm-empty">
          <div className="loading-throbber" />
        </div>
      ) : displayList.length === 0 ? (
        <div className="dm-empty">
          <Icon name="Users" size={48} />
          <h3>{search.trim() ? "No groups found" : "No groups yet"}</h3>
          <p>
            {search.trim()
              ? "Try a different search"
              : "Search to find and join groups"}
          </p>
        </div>
      ) : (
        displayList.map((group) => {
          const isMember =
            group.is_member || myGroups.some((g) => g.tag === group.tag);
          return (
            <div key={group.tag} className="group-item">
              <div className="group-item-icon">
                {group.icon ? (
                  <img src={group.icon} alt={group.name} />
                ) : (
                  <Icon name="Users" size={20} />
                )}
              </div>
              <div className="group-item-info">
                <span className="group-item-name">{group.name}</span>
                <span className="group-item-tag">@{group.tag}</span>
                {group.description && (
                  <span className="group-item-desc">{group.description}</span>
                )}
                {group.member_count !== undefined && (
                  <span className="group-item-members">
                    <Icon name="Users" size={11} />
                    {group.member_count}
                  </span>
                )}
              </div>
              <div className="dm-actions">
                {isMember ? (
                  <button
                    className="dm-action-btn dm-action-danger"
                    title="Leave"
                    onClick={() => handleLeave(group.tag)}
                  >
                    <Icon name="LogOut" size={16} />
                  </button>
                ) : (
                  <button
                    className="dm-action-btn dm-action-accept"
                    title="Join"
                    onClick={() => handleJoin(group.tag)}
                  >
                    <Icon name="Plus" size={16} />
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
