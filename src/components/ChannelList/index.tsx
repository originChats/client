import { useReducer, useState, useRef, useCallback, useEffect } from "preact/hooks";
import { useSignalEffect, useSignal } from "@preact/signals";
import { signal } from "@preact/signals";

import {
  serverUrl,
  currentChannel,
  currentThread,
  channels,
  threadsByServer,
  currentServer,
  currentUserByServer,
  currentUser,
  DM_SERVER_URL,
  roturStatuses,
  channelNotifSettings,
  getChannelNotifLevel,
  getChannelPingCount,
  getChannelUnreadCount,
  hasChannelUnreads,
  users,
  myStatus,
  serverCapabilitiesByServer,
  rolesByServer,
  type NotificationLevel,
  newThreadCounts,
  clearNewThreadCount,
  token,
} from "../../state";
import { parseEmojisInContainer } from "../../lib/emoji";
import {
  selectChannel,
  selectHomeChannel,
  selectRelationshipsChannel,
  selectRolesChannel,
  selectThread,
  createThread,
} from "../../lib/actions";
import { markChannelAsRead } from "../../lib/ws-sender";
import {
  showSettingsModal,
  showServerSettingsModal,
  showChannelEditModal,
  showVoiceCallView,
  mobileSidebarOpen,
  closeMobileNav,
  showContextMenu,
  showThreadPanel,
  channelListWidth,
} from "../../lib/ui-signals";
import { unreadState } from "../../lib/state";
import { Icon } from "../Icon";
import { voiceManager, voiceState } from "../../voice";
import { openUserPopout } from "../UserPopout";
import type { VoiceUser } from "../../types";
import { avatarUrl } from "../../utils";
import { UserAvatar } from "../UserAvatar";
import { useDisplayName } from "../../lib/useDisplayName";
import { updateStatus, clearStatus } from "../../lib/rotur-api";
import { saveNotifSettings } from "../../lib/persistence";
import { ThreadContextMenu, useThreadContextMenu } from "../ThreadContextMenu";
import { wsSend } from "../../lib/websocket";
import { StatusSelector } from "../StatusSelector";
import { dmVoiceStates } from "../../lib/commands/voice/voice";
import styles from "./ChannelList.module.css";

import type { Channel } from "../../types";

const collapsedForumChannels = signal<Set<string>>(new Set());

export function ChannelList() {
  const channelsListRef = useRef<HTMLDivElement>(null);
  const [hasUnreadsAbove, setHasUnreadsAbove] = useState(false);
  const [hasUnreadsBelow, setHasUnreadsBelow] = useState(false);

  const isDM = serverUrl.value === DM_SERVER_URL;
  const hasToken = !!token.value;
  const rawChs = channels.value;
  const chs = isDM
    ? [...rawChs].sort((a, b) => (b.last_message || 0) - (a.last_message || 0))
    : rawChs;

  useEffect(() => {
    if (channelsListRef.current) {
      parseEmojisInContainer(channelsListRef.current);
    }
  }, [chs]);

  let separatorIndex = 0;

  const voice = voiceState.value;
  const isInVoice = !!voice.currentChannel;
  const sUrl = serverUrl.value;
  const myUsername = currentUserByServer.read(sUrl)?.username;
  const { showThreadMenu, closeThreadMenu, threadMenu } = useThreadContextMenu();

  // When the voice call view is open for a dedicated voice channel (not a chat
  // channel), suppress the text-channel active highlight so only the voice
  // channel entry shows as selected.
  const voiceChannelActive =
    showVoiceCallView.value &&
    voice.currentChannel !== null &&
    channels.value.find((c) => c.name === voice.currentChannel && c.type === "voice") !== undefined;

  const handleChannelClick = (channel: any) => {
    if (channel.type === "voice") {
      voiceManager.joinChannel(channel.name, myUsername);
    } else if (channel.type === "forum") {
      selectChannel(channel);
    } else {
      selectChannel(channel);
    }
    // close nav on mobile after selecting a channel
    closeMobileNav();
  };

  const handleChannelContextMenu = (e: MouseEvent, channel: any) => {
    e.preventDefault();
    const sUrl = serverUrl.value;
    const channelKey = `${sUrl}:${channel.name}`;
    const currentLevel = getChannelNotifLevel(sUrl, channel.name);

    const myUsername = currentUser.value?.username?.toLowerCase();
    const myServerUser = users.value[myUsername || ""];
    const isOwner = myServerUser?.roles?.includes("owner");

    const setChannelNotif = (level: NotificationLevel) => {
      if (level === "mentions") {
        const next = { ...channelNotifSettings.value };
        delete next[channelKey];
        channelNotifSettings.value = next;
      } else {
        channelNotifSettings.value = {
          ...channelNotifSettings.value,
          [channelKey]: level,
        };
      }
      saveNotifSettings().catch(() => {});
    };

    const menuItems: any[] = [
      {
        label: "Mark as Read",
        icon: "CheckCircle",
        fn: () => markChannelAsRead(channel.name),
      },
      { separator: true, label: "", fn: () => {} },
      {
        label: "Notifications",
        icon: "Bell",
        fn: () => {},
        children: [
          {
            label: `All Messages${currentLevel === "all" ? " ✓" : ""}`,
            icon: "Bell",
            fn: () => setChannelNotif("all"),
          },
          {
            label: `Mentions Only${currentLevel === "mentions" ? " ✓" : ""}`,
            icon: "BellDot",
            fn: () => setChannelNotif("mentions"),
          },
          {
            label: `Mute${currentLevel === "none" ? " ✓" : ""}`,
            icon: "BellOff",
            fn: () => setChannelNotif("none"),
          },
        ],
      },
    ];

    if (isOwner) {
      menuItems.push(
        { separator: true, label: "", fn: () => {} },
        {
          label: "Edit Channel",
          icon: "Edit3",
          fn: () => {
            showChannelEditModal.value = channel.name;
          },
        }
      );
    }

    menuItems.push(
      { separator: true, label: "", fn: () => {} },
      {
        label: "Copy Channel Link",
        icon: "Link",
        fn: () => {
          const link = `https://originchats.mistium.com/app/${sUrl}/${channel.name}`;
          navigator.clipboard.writeText(link);
        },
      },
      {
        label: "Copy Channel Name",
        icon: "Copy",
        fn: () => {
          navigator.clipboard.writeText(channel.name);
        },
      }
    );

    showContextMenu(e, menuItems);
  };

  const resizeRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.target === resizeRef.current) {
      isResizing.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = e.clientX - 72;
    channelListWidth.value = Math.max(200, Math.min(500, newWidth));
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isResizing.current) {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const checkForUnreadsOffscreen = useCallback(() => {
    const listEl = channelsListRef.current;
    if (!listEl) return;

    const channelItems = listEl.querySelectorAll(`.${styles.channelItem}`);
    if (channelItems.length === 0) {
      setHasUnreadsAbove(false);
      setHasUnreadsBelow(false);
      return;
    }

    const listRect = listEl.getBoundingClientRect();
    let hasAbove = false;
    let hasBelow = false;

    channelItems.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const channelName = item.getAttribute("data-channel-name");
      if (!channelName) return;

      const hasUnreadState = hasChannelUnreads(serverUrl.value, channelName);
      const hasUnreadClass = item.classList.contains(styles.hasUnread);

      if (hasUnreadState || hasUnreadClass) {
        if (rect.top < listRect.top - 5) {
          hasAbove = true;
        } else if (rect.bottom > listRect.bottom + 5) {
          hasBelow = true;
        }
      }
    });

    setHasUnreadsAbove(hasAbove);
    setHasUnreadsBelow(hasBelow);
  }, [serverUrl.value]);

  useEffect(() => {
    const timer = setTimeout(checkForUnreadsOffscreen, 100);
    const listEl = channelsListRef.current;
    if (listEl) {
      listEl.addEventListener("scroll", checkForUnreadsOffscreen);
      const observer = new MutationObserver(checkForUnreadsOffscreen);
      observer.observe(listEl, { childList: true, subtree: true });
      return () => {
        clearTimeout(timer);
        listEl.removeEventListener("scroll", checkForUnreadsOffscreen);
        observer.disconnect();
      };
    }
    return () => clearTimeout(timer);
  }, [checkForUnreadsOffscreen]);

  useSignalEffect(() => {
    serverUrl.value;
    checkForUnreadsOffscreen();
  });

  return (
    <div
      id="channels"
      className={`channels${mobileSidebarOpen.value ? " open" : ""}`}
      style={window.innerWidth > 768 ? { width: `${channelListWidth.value}px` } : undefined}
    >
      <div
        ref={resizeRef}
        className={styles.channelListResizeHandle}
        onMouseDown={handleMouseDown}
      />
      {!isDM && currentServer.value?.banner && (
        <div className={styles.serverBanner}>
          <img
            src={currentServer.value.banner}
            alt={`${currentServer.value.name} banner`}
            className={styles.serverBannerImage}
          />
        </div>
      )}
      <div className={styles.channelHeader}>
        <div className={styles.channelHeaderInfo}>
          <div className={styles.channelHeaderName}>
            {isDM ? "Direct Messages" : currentServer.value?.name || "Server"}
          </div>
          {!isDM && (
            <div className={styles.channelHeaderMemberCount}>
              {Object.keys(users.value).length} members
            </div>
          )}
        </div>
        {!isDM && (
          <button
            className={styles.channelHeaderShare}
            title="Copy invite link"
            onClick={() => {
              const url = `${window.location.protocol}//${window.location.host}?server=${encodeURIComponent(serverUrl.value)}`;
              navigator.clipboard.writeText(url);
            }}
          >
            <Icon name="Share2" size={16} />
          </button>
        )}
        {!isDM &&
          (() => {
            const myServerUser = users.value[currentUser.value?.username?.toLowerCase() || ""];
            const isOwner = myServerUser?.roles?.includes("owner");
            return (
              isOwner && (
                <button
                  className={styles.channelHeaderSettings}
                  onClick={() => (showServerSettingsModal.value = true)}
                  title="Server Settings"
                >
                  <Icon name="Settings" size={16} />
                </button>
              )
            );
          })()}
        <button className={styles.channelHeaderClose} onClick={closeMobileNav} aria-label="Close">
          <Icon name="X" size={18} />
        </button>
      </div>
      <div className={styles.channelsListWrapper}>
        {hasUnreadsAbove && (
          <div className={styles.scrollIndicatorAbove}>
            <Icon name="ChevronUp" size={14} />
            <span>New unreads</span>
          </div>
        )}
        <div className={styles.channelsList} ref={channelsListRef}>
          {isDM && (
            <>
              <div
                className={`${styles.channelItem}${currentChannel.value?.name === "home" ? ` ${styles.active}` : ""}`}
                onClick={selectHomeChannel}
              >
                <Icon name="Home" size={18} />
                <span>Home</span>
              </div>
              {hasToken && (
                <div
                  className={`${styles.channelItem}${currentChannel.value?.name === "relationships" ? ` ${styles.active}` : ""}`}
                  onClick={() => {
                    selectRelationshipsChannel();
                    closeMobileNav();
                  }}
                >
                  <Icon name="Users" size={18} />
                  <span>Friends</span>
                </div>
              )}
              <div
                className={`${styles.channelItem}${currentChannel.value?.name === "notes" ? ` ${styles.active}` : ""}`}
                onClick={() => {
                  selectChannel({
                    name: "notes",
                    type: "text",
                    display_name: "Notes",
                  });
                  closeMobileNav();
                }}
              >
                <Icon name="FileText" size={18} />
                <span>Notes</span>
              </div>
              <div
                className={`${styles.channelItem}${currentChannel.value?.name === "new_message" ? ` ${styles.active}` : ""}`}
                onClick={() => {
                  selectChannel({
                    name: "new_message",
                    type: "new_message",
                    display_name: "New Message",
                  });
                  closeMobileNav();
                }}
              >
                <Icon name="PenSquare" size={16} />
                <span>New Message</span>
              </div>
              <div className={styles.channelSeparator} />
            </>
          )}
          {!isDM &&
            (() => {
              const caps = serverCapabilitiesByServer.read(sUrl) ?? [];
              if (!caps.includes("self_roles_list")) return null;
              const allRoles = rolesByServer.read(sUrl) ?? {};
              const selfAssignableRoles = Object.entries(allRoles).filter(
                ([, role]) => (role as any).self_assignable === true
              );
              if (selfAssignableRoles.length === 0) return null;
              return (
                <div className={styles.specialChannelsSection}>
                  <div
                    className={`${styles.channelItem}${currentChannel.value?.name === "roles" ? ` ${styles.active}` : ""}`}
                    onClick={() => {
                      selectRolesChannel();
                      closeMobileNav();
                    }}
                  >
                    <Icon name="Shield" size={18} />
                    <span>Roles</span>
                  </div>
                  <div className={styles.channelSeparator} />
                </div>
              );
            })()}
          {chs.map((channel) => {
            if (isDM && channel.name === "cmds") return null;
            if (isDM && channel.type === "separator") return null;

            if (channel.type === "separator") {
              separatorIndex++;
              return (
                <div key={`separator-${separatorIndex}`} className={styles.channelSeparator} />
              );
            }

            const isVoice = channel.type === "voice";
            const displayName = (channel as any).display_name || channel.name;
            const notifLevel = getChannelNotifLevel(serverUrl.value, channel.name);
            const isMuted = notifLevel === "none";
            const pingCount = isMuted ? 0 : getChannelPingCount(serverUrl.value, channel.name);
            const unreadCount = isMuted ? 0 : getChannelUnreadCount(serverUrl.value, channel.name);
            const hasUnread = !isMuted && (unreadCount > 0 || pingCount > 0);
            const displayPingCount = isDM ? unreadCount : pingCount;
            const hasPing = displayPingCount > 0;

            const voiceUsers: VoiceUser[] = (channel as any).voice_state || [];

            if (isVoice) {
              return (
                <div key={`${sUrl}:${channel.name}`} className={styles.voiceChannelWrapper}>
                  <div
                    className={`${styles.channelItem}${voice.currentChannel === channel.name ? ` ${styles.active}` : ""}`}
                    onClick={() => handleChannelClick(channel)}
                    onContextMenu={(e: any) => handleChannelContextMenu(e, channel)}
                  >
                    <Icon name="Mic" size={18} />
                    {(channel as any).icon && (
                      <img src={(channel as any).icon} className={styles.channelItemIcon} />
                    )}
                    <span>{displayName}</span>
                    {voiceUsers.length > 0 && (
                      <span className={styles.voiceUserCount}>{voiceUsers.length}</span>
                    )}
                  </div>
                  {voiceUsers.length > 0 && (
                    <div className={styles.voiceChannelUserList}>
                      {voiceUsers.map((vu) => (
                        <div
                          key={vu.username}
                          className={`${styles.voiceChannelUser}${vu.muted ? ` ${styles.muted}` : ""}`}
                          onClick={(e: any) => openUserPopout(e, vu.username)}
                        >
                          <div className={styles.voiceChannelUserAvatar}>
                            <UserAvatar
                              username={vu.username}
                              nickname={users.value[vu.username?.toLowerCase()]?.nickname}
                              pfp={vu.pfp}
                              cracked={users.value[vu.username?.toLowerCase()]?.cracked}
                            />
                          </div>
                          <span className={styles.voiceChannelUsername}>{vu.username}</span>
                          {vu.muted && <Icon name="MicOff" size={14} />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const isForum = channel.type === "forum";
            const forumThreads = isForum
              ? threadsByServer.read(serverUrl.value)?.[channel.name] || []
              : [];

            const visibleThreads = forumThreads.filter((t: any) => {
              const isParticipant = t.participants?.includes(myUsername);
              const isCurrentThread = currentThread.value?.id === t.id;
              return isParticipant || isCurrentThread;
            });

            if (isForum) {
              const ch = currentChannel.value as any;
              const isThreadSelected = currentThread.value?.id !== undefined;
              const isForumSelected = !isThreadSelected && ch?.name === channel.name;

              const newThreadCount = newThreadCounts.read(serverUrl.value)?.[channel.name] || 0;

              const channelKey = `${serverUrl.value}:${channel.name}`;
              const isCollapsed = collapsedForumChannels.value.has(channelKey);
              const threadCount = visibleThreads.length;

              const toggleCollapse = (e: MouseEvent) => {
                e.stopPropagation();
                const newSet = new Set(collapsedForumChannels.value);
                if (newSet.has(channelKey)) {
                  newSet.delete(channelKey);
                } else {
                  newSet.add(channelKey);
                }
                collapsedForumChannels.value = newSet;
              };

              return (
                <div key={`${sUrl}:${channel.name}`}>
                  <div
                    className={`${styles.channelItem}${!voiceChannelActive && isForumSelected ? ` ${styles.active}` : ""}`}
                    data-channel-name={channel.name}
                    onClick={() => {
                      handleChannelClick(channel);
                      clearNewThreadCount(serverUrl.value, channel.name);
                    }}
                    onContextMenu={(e: any) => handleChannelContextMenu(e, channel)}
                  >
                    <button
                      className={styles.collapseToggle}
                      onClick={toggleCollapse}
                      title={isCollapsed ? "Expand threads" : "Collapse threads"}
                    >
                      <Icon name={isCollapsed ? "ChevronRight" : "ChevronDown"} size={14} />
                    </button>
                    <Icon name="MessageCircle" size={18} />
                    <span>{displayName}</span>
                    {threadCount > 0 && isCollapsed && (
                      <span className={styles.threadCount}>{threadCount}</span>
                    )}
                    {newThreadCount > 0 && (
                      <span className={styles.newThreadBadge}>+{newThreadCount}</span>
                    )}
                  </div>
                  {!isCollapsed &&
                    visibleThreads.map((thread: any) => {
                      const threadPingCount = getChannelPingCount(
                        serverUrl.value,
                        `thread:${thread.id}`
                      );
                      const threadUnreadCount = getChannelUnreadCount(
                        serverUrl.value,
                        `thread:${thread.id}`
                      );
                      const threadHasPing = threadPingCount > 0;
                      const threadHasUnread = !threadHasPing && threadUnreadCount > 0;

                      return (
                        <div
                          key={`${sUrl}:thread:${thread.id}`}
                          className={`${styles.channelItem} ${styles.threadItem}${!voiceChannelActive && currentThread.value?.id === thread.id ? ` ${styles.active}` : ""}${threadHasUnread ? ` ${styles.hasUnread}` : ""}`}
                          onClick={(e: any) => {
                            e.stopPropagation();
                            selectThread(thread);
                            closeMobileNav();
                          }}
                          onContextMenu={(e: any) => showThreadMenu(e, thread)}
                        >
                          <Icon name="CornerDownRight" size={15} />
                          <span className={styles.threadName}>{thread.name}</span>
                          {thread.locked && (
                            <span className={styles.threadLockedIcon}>
                              <Icon name="Lock" size={12} />
                            </span>
                          )}
                          {threadHasPing && (
                            <span className={styles.pingBadge}>{threadPingCount}</span>
                          )}
                          {threadHasUnread && <span className={styles.unreadIndicator}></span>}
                        </div>
                      );
                    })}
                </div>
              );
            }

            const channelDescription = (channel as any).description;
            const dmVoiceUsers = isDM ? dmVoiceStates.get(channel.name) : undefined;

            return (
              <div
                key={`${sUrl}:${channel.name}`}
                className={`${styles.channelItem}${!voiceChannelActive && currentChannel.value?.name === channel.name ? ` ${styles.active}` : ""}${hasUnread ? ` ${styles.hasUnread}` : ""}${isMuted ? ` ${styles.muted}` : ""}`}
                data-channel-name={channel.name}
                onClick={() => handleChannelClick(channel)}
                onContextMenu={(e: any) => handleChannelContextMenu(e, channel)}
                title={channelDescription || undefined}
              >
                {isDM && channel.icon ? (
                  <div className={styles.dmAvatarWrapper}>
                    <img
                      src={channel.icon}
                      alt={channel.display_name || channel.name}
                      className={styles.channelItemDmAvatar}
                    />
                    {dmVoiceUsers && dmVoiceUsers.length > 0 && (
                      <div className={styles.dmVoiceIndicator}>
                        <Icon name="Phone" size={12} />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <Icon name="Hash" size={18} />
                    {channel.icon && <img src={channel.icon} className={styles.channelItemIcon} />}
                  </>
                )}
                <span>{displayName}</span>
                {isMuted && !hasPing && (
                  <span
                    style={{
                      marginLeft: "auto",
                      opacity: 0.4,
                      display: "flex",
                    }}
                  >
                    <Icon name="BellOff" size={14} />
                  </span>
                )}
                {hasPing && <span className={styles.pingBadge}>{displayPingCount}</span>}
                {hasUnread && !hasPing && <span className={styles.unreadIndicator}></span>}
              </div>
            );
          })}
        </div>
        {hasUnreadsBelow && (
          <div className={styles.scrollIndicatorBelow}>
            <Icon name="ChevronDown" size={14} />
            <span>New unreads</span>
          </div>
        )}
      </div>

      {isInVoice && (
        <div className={`${styles.voicePanel} ${styles.active}`}>
          <div className={styles.voicePanelInfo}>
            <div className={styles.voicePanelStatus}>
              <Icon name="Wifi" size={14} />
              <span>Voice Connected</span>
            </div>
            <div className={styles.voicePanelChannel}>{voice.currentChannel}</div>
          </div>
          <div className={styles.voicePanelControls}>
            <button
              className={`${styles.voiceControlBtn}${voice.isMuted ? ` ${styles.muted}` : ""}`}
              onClick={() => voiceManager.toggleMute()}
              title={voice.isMuted ? "Unmute" : "Mute"}
            >
              <Icon name={voice.isMuted ? "MicOff" : "Mic"} size={18} />
            </button>
            <button
              className={`${styles.voiceControlBtn}${voice.isCameraOn ? ` ${styles.active}` : ""}`}
              onClick={() => voiceManager.toggleCamera()}
              title={voice.isCameraOn ? "Turn Off Camera" : "Turn On Camera"}
            >
              <Icon name={voice.isCameraOn ? "VideoOff" : "Video"} size={18} />
            </button>
            <button
              className={`${styles.voiceControlBtn}${voice.isScreenSharing ? ` ${styles.active}` : ""}`}
              onClick={() => voiceManager.toggleScreenShare()}
              title={voice.isScreenSharing ? "Stop Sharing" : "Share Screen"}
            >
              <Icon name={voice.isScreenSharing ? "MonitorOff" : "Monitor"} size={18} />
            </button>
            <button
              className={`${styles.voiceControlBtn} ${styles.voiceLeaveBtn}`}
              onClick={() => voiceManager.leaveChannel()}
              title="Disconnect"
            >
              <Icon name="PhoneOff" size={18} />
            </button>
          </div>
        </div>
      )}

      <UserPanel />
      {threadMenu && (
        <ThreadContextMenu
          thread={threadMenu.thread}
          x={threadMenu.x}
          y={threadMenu.y}
          onClose={closeThreadMenu}
        />
      )}
    </div>
  );
}

function UserPanel() {
  const sUrl = serverUrl.value;
  const username = currentUserByServer.read(sUrl)?.username;
  const displayName = useDisplayName(username || "");
  const [showStatusSelector, setShowStatusSelector] = useState(false);

  if (!username) return null;

  const caps = serverCapabilitiesByServer.read(sUrl) ?? [];
  const supportsStatus = caps.includes("status_set");

  const statusColorMap: Record<string, string> = {
    online: "#23a55a",
    idle: "#f0b232",
    dnd: "#f23f43",
    offline: "#80848e",
  };

  const statusColor = statusColorMap[myStatus.value.status] || statusColorMap.online;

  return (
    <>
      <div className={styles.channelUserPanel}>
        <div
          className={styles.channelUserPanelIdentity}
          onClick={() => setShowStatusSelector(!showStatusSelector)}
        >
          <div className={styles.channelUserPanelAvatar}>
            <UserAvatar username={username} alt={displayName} />
            {supportsStatus && (
              <div
                className={styles.channelUserPanelStatusDot}
                style={{ background: statusColor }}
              />
            )}
          </div>
          <div className={styles.channelUserPanelInfo}>
            <div className={styles.channelUserPanelName}>{displayName}</div>
            {supportsStatus && myStatus.value.text && (
              <div className={styles.channelUserPanelStatusText}>{myStatus.value.text}</div>
            )}
          </div>
        </div>
        <button
          className={styles.channelUserPanelBtn}
          title="Open Settings"
          onClick={() => (showSettingsModal.value = true)}
        >
          <Icon name="Settings" size={16} />
        </button>
      </div>
      {showStatusSelector && (
        <div className={styles.statusSelectorPanel}>
          <StatusSelector />
        </div>
      )}
    </>
  );
}

// ── Status modal ──────────────────────────────────────────────────────────────

function StatusModal({
  username,
  current,
  onClose,
}: {
  username: string;
  current: { content?: string } | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState(current?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setMsg("");
    try {
      await updateStatus(content.trim());
      roturStatuses.value = {
        ...roturStatuses.value,
        [username.toLowerCase()]: { content: content.trim() },
      };
      onClose();
    } catch (e: any) {
      setMsg(e.message || "Failed to save");
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setMsg("");
    try {
      await clearStatus();
      const updated = { ...roturStatuses.value };
      delete updated[username.toLowerCase()];
      roturStatuses.value = updated;
      onClose();
    } catch (e: any) {
      setMsg(e.message || "Failed to clear");
      setSaving(false);
    }
  };

  return (
    <div
      className={styles.statusModalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.statusModal}>
        <div className={styles.statusModalHeader}>
          <span>Set Status</span>
          <button className={styles.statusModalClose} onClick={onClose}>
            <Icon name="X" size={16} />
          </button>
        </div>
        <div className={styles.statusModalBody}>
          <input
            className={styles.statusModalText}
            type="text"
            placeholder="What's on your mind? (emoji welcome 😊)"
            value={content}
            onInput={(e) => setContent((e.target as HTMLInputElement).value)}
            maxLength={250}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            autoFocus
          />
          {msg && <div className={styles.statusModalError}>{msg}</div>}
        </div>
        <div className={styles.statusModalFooter}>
          <button
            className={`${styles.statusModalBtn} ${styles.secondary}`}
            onClick={handleClear}
            disabled={saving}
          >
            Clear
          </button>
          <button
            className={`${styles.statusModalBtn} ${styles.primary}`}
            onClick={handleSave}
            disabled={saving || !content.trim()}
          >
            {saving ? "Saving…" : "Set Status"}
          </button>
        </div>
      </div>
    </div>
  );
}
