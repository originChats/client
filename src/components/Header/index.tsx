import { useReducer, useState } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import {
  currentServer,
  currentChannel,
  currentThread,
  getServerPingCount,
  getChannelUnreadCount,
  DM_SERVER_URL,
  dmServers,
  serverUrl,
  serverCapabilities,
  pingsInboxLoading,
  pingsInboxMessages,
  pingsInboxOffset,
  PINGS_INBOX_LIMIT,
  servers,
  currentUserByServer,
  hasCapability,
} from "../../state";
import { joinThread, leaveThread } from "../../lib/actions";
import { Icon } from "../Icon";
import {
  mobileSidebarOpen,
  mobilePanelOpen,
  rightPanelView,
  showVoiceCallView,
  pinnedLoading,
  pinnedMessages,
  searchResults,
  searchLoading,
} from "../../lib/ui-signals";
import { CallButton } from "../buttons/CallButton";
import { wsSend } from "../../lib/websocket";
import { avatarUrl } from "../../utils";
import styles from "./Header.module.css";

const SPECIAL_CHANNELS = new Set(["friends", "requests", "blocked", "groups"]);

export function Header() {
  const [, forceUpdate] = useReducer((n) => n + 1, 0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  useSignalEffect(() => {
    currentChannel.value;
    serverUrl.value;
    showVoiceCallView.value;
    serverCapabilities.value;
    rightPanelView.value;
    mobilePanelOpen.value;
    dmServers.value;
    forceUpdate(undefined);
  });

  const isDM = serverUrl.value === DM_SERVER_URL;
  const ch = currentChannel.value;
  const thread = currentThread.value;
  const isChatChannel = ch !== null && ch.type === "chat";
  const caps = serverCapabilities.value;
  const canPin =
    caps.includes("message_pin") && caps.includes("messages_pinned");
  const canSearch = caps.includes("messages_search");
  const canInbox = caps.includes("pings_get");
  const supportsJoinLeave =
    hasCapability("thread_join") && hasCapability("thread_leave");

  const myUsername = currentUserByServer.value[serverUrl.value]?.username;
  const isThreadParticipant = thread?.participants?.includes(myUsername || "");

  const serverPingTotal = servers.value.reduce(
    (sum, s) => sum + getServerPingCount(s.url),
    0,
  );
  const dmPingTotal = dmServers.value.reduce(
    (sum, dm) => sum + getChannelUnreadCount(DM_SERVER_URL, dm.channel),
    0,
  );
  const totalPings = serverPingTotal + dmPingTotal;

  const toggleSidebar = () => {
    mobileSidebarOpen.value = !mobileSidebarOpen.value;
    if (mobileSidebarOpen.value) mobilePanelOpen.value = false;
  };

  const togglePanel = (panel: "members" | "pinned" | "search" | "inbox") => {
    const isDesktop = window.innerWidth >= 769;

    if (isDesktop) {
      if (rightPanelView.value === panel) {
        rightPanelView.value = null;
      } else {
        rightPanelView.value = panel;
        fetchPanelData(panel);
      }
    } else {
      if (rightPanelView.value === panel && mobilePanelOpen.value) {
        mobilePanelOpen.value = false;
      } else {
        rightPanelView.value = panel;
        mobilePanelOpen.value = true;
        mobileSidebarOpen.value = false;
        fetchPanelData(panel);
      }
    }
  };

  const fetchPanelData = (panel: "members" | "pinned" | "search" | "inbox") => {
    if (panel === "pinned" && canPin) {
      pinnedLoading.value = true;
      pinnedMessages.value = [];
      wsSend({
        cmd: "messages_pinned",
        channel: currentChannel.value?.name,
      });
    }
    if (panel === "inbox" && canInbox) {
      pingsInboxLoading.value = true;
      pingsInboxMessages.value = [];
      pingsInboxOffset.value = 0;
      wsSend({ cmd: "pings_get", limit: PINGS_INBOX_LIMIT, offset: 0 });
    }
  };

  const renderMobileHeader = () => (
    <div className={styles.header}>
      <button
        className={styles.menuBtn}
        onClick={toggleSidebar}
        aria-label="Toggle navigation"
      >
        <Icon name="Menu" size={24} />
        {totalPings > 0 && !mobileSidebarOpen.value && (
          <span className={styles.menuBtnPingBadge}>
            {totalPings > 99 ? "99+" : totalPings}
          </span>
        )}
      </button>
      <div className={styles.serverInfo}>
        <div className={styles.headerText}>
          <div className={styles.serverName}>
            <span>{currentServer.value?.name || "Direct Messages"}</span>
          </div>
          <div className={styles.channelName}>
            #{" "}
            {currentChannel.value?.display_name ||
              currentChannel.value?.name ||
              "home"}
            {(currentChannel.value as any)?.description && (
              <span
                className={styles.channelDescription}
                style={{ marginLeft: 8, opacity: 0.6 }}
              >
                {(currentChannel.value as any).description}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className={styles.headerActions}>
        {isChatChannel && <CallButton className={styles.headerBtn} />}
        {canSearch && (
          <button
            className={`${styles.headerBtn} ${rightPanelView.value === "search" && mobilePanelOpen.value ? styles.active : ""}`}
            onClick={() => togglePanel("search")}
            aria-label="Search"
          >
            <Icon name="Search" />
          </button>
        )}
        {canPin && (
          <button
            className={`${styles.headerBtn} ${rightPanelView.value === "pinned" && mobilePanelOpen.value ? styles.active : ""}`}
            onClick={() => togglePanel("pinned")}
            aria-label="Pinned messages"
          >
            <Icon name="Pin" />
          </button>
        )}
        {canInbox && (
          <button
            className={`${styles.headerBtn} ${rightPanelView.value === "inbox" && mobilePanelOpen.value ? styles.active : ""}`}
            onClick={() => togglePanel("inbox")}
            aria-label="Inbox"
          >
            <Icon name="Bell" />
          </button>
        )}
        {!isDM && (
          <button
            className={`${styles.headerBtn} ${rightPanelView.value === "members" && mobilePanelOpen.value ? styles.active : ""}`}
            onClick={() => togglePanel("members")}
            aria-label="Members"
          >
            <Icon name="Users" />
          </button>
        )}
      </div>
    </div>
  );

  const renderDesktopHeader = () => (
    <div className={styles.mainMessagesHeader}>
      <div className={styles.mainHeaderLeft}>
        <Icon
          name={ch?.type === "thread" ? "MessageSquare" : "Hash"}
          size={24}
        />
        <span className={styles.mainHeaderChannelName}>
          {currentChannel.value?.display_name ||
            currentChannel.value?.name ||
            "home"}
        </span>
        {(currentChannel.value as any)?.description && (
          <span className={styles.mainHeaderChannelDescription}>
            {(currentChannel.value as any).description}
          </span>
        )}
        {thread && thread.participants && thread.participants.length > 0 && (
          <span className={styles.headerThreadParticipants}>
            <Icon name="Users" size={14} />
            {thread.participants.length}
          </span>
        )}
      </div>
      <div className={styles.mainHeaderRight}>
        {thread &&
          supportsJoinLeave &&
          !thread.locked &&
          (isThreadParticipant ? (
            <button
              className={`${styles.headerThreadBtn} ${styles.leave}`}
              onClick={() => leaveThread(thread.id)}
              title="Leave Thread"
            >
              <Icon name="UserMinus" size={18} />
              <span>Leave</span>
            </button>
          ) : (
            <button
              className={`${styles.headerThreadBtn} ${styles.join}`}
              onClick={() => joinThread(thread.id)}
              title="Join Thread"
            >
              <Icon name="UserPlus" size={18} />
              <span>Join</span>
            </button>
          ))}
        {isChatChannel && (
          <CallButton className={styles.headerIconBtn} iconSize={20} />
        )}
        {canInbox && (
          <button
            className={`${styles.headerIconBtn} ${rightPanelView.value === "inbox" ? styles.active : ""}`}
            onClick={() => togglePanel("inbox")}
            title="Inbox"
          >
            <Icon name="Bell" size={20} />
          </button>
        )}
        {canPin && (
          <button
            className={`${styles.headerIconBtn} ${rightPanelView.value === "pinned" ? styles.active : ""}`}
            onClick={() => togglePanel("pinned")}
            title="Pinned Messages"
          >
            <Icon name="Pin" size={20} />
          </button>
        )}
        {!isDM && (
          <button
            className={`${styles.headerIconBtn} ${rightPanelView.value === "members" ? styles.active : ""}`}
            onClick={() => togglePanel("members")}
            title="Members"
          >
            <Icon name="Users" size={20} />
          </button>
        )}
        {isDM &&
          currentChannel.value?.name &&
          !SPECIAL_CHANNELS.has(currentChannel.value.name) &&
          (() => {
            const displayName = currentChannel.value?.display_name;
            const is1on1 =
              displayName &&
              currentChannel.value?.icon === avatarUrl(displayName);
            return (
              <button
                className={`${styles.headerIconBtn} ${rightPanelView.value === "members" ? styles.active : ""}`}
                onClick={() => togglePanel("members")}
                title={is1on1 ? "User Profile" : "Members"}
              >
                <Icon name={is1on1 ? "User" : "Users"} size={20} />
              </button>
            );
          })()}
        {canSearch && (
          <div
            className={`${styles.searchInputContainer} ${searchFocused ? styles.focused : ""}`}
          >
            <Icon name="Search" size={16} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search"
              value={searchInput}
              onInput={(e) =>
                setSearchInput((e.target as HTMLInputElement).value)
              }
              onFocus={() => {
                setSearchFocused(true);
                rightPanelView.value = "search";
              }}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  searchInput.trim() &&
                  currentChannel.value
                ) {
                  searchLoading.value = true;
                  searchResults.value = [];
                  wsSend({
                    cmd: "messages_search",
                    channel: currentChannel.value.name,
                    query: searchInput.trim(),
                  });
                  rightPanelView.value = "search";
                  mobilePanelOpen.value = true;
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {renderMobileHeader()}
      {renderDesktopHeader()}
    </>
  );
}
