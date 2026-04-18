import { Fragment } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { ConfirmDialog } from "../Modal";
import {
  serverUrl,
  servers,
  serverFolders,
  dmServers,
  wsStatus,
  getServerPingCount,
  getServerUnreadCount,
  getChannelUnreadCount,
  DM_SERVER_URL,
  serverNotifSettings,
  type NotificationLevel,
  currentChannel,
} from "../../state";
import type { ServerFolder } from "../../types";
import { wsSend } from "../../lib/websocket";
import { switchServer, markServerAsRead, removeServer, openDMWith } from "../../lib/actions";
import {
  showDiscoveryModal,
  mobileSidebarOpen,
  showContextMenu,
  showInfo,
} from "../../lib/ui-signals";
import { unreadState } from "../../lib/state";
import { Icon, ServerIcon } from "../Icon";
import { UserAvatar } from "../UserAvatar";
import { reloadServerIcon } from "../../utils";
import { useDisplayName } from "../../lib/useDisplayName";
import { saveNotifSettings, saveFolders } from "../../lib/persistence";
import styles from "./GuildSidebar.module.css";

const ITEM_HEIGHT = 48;
const DRAG_THRESHOLD = 30;

export function GuildSidebar() {
  const [drag, setDrag] = useState<{
    index: number;
    url: string;
    y: number;
    dropIndex: number;
    listTop: number;
    serverListOffset: number;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [isDropping, setIsDropping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<typeof drag>(null);
  const dragListenersRef = useRef<{
    onMove: (e: MouseEvent) => void;
    onUp: () => void;
  } | null>(null);
  const dropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getConnectionClass = (url: string) => {
    const status = wsStatus[url];
    if (status === "connecting") return styles.serverConnecting;
    if (status === "disconnected" || status === "error") return styles.serverDisconnected;
    return "";
  };

  const handleServerMouseDown = (index: number, url: string, e: MouseEvent) => {
    if (e.button === 2) return;
    e.preventDefault();
    if (!listRef.current) return;

    const rect = listRef.current.getBoundingClientRect();
    const dmCount = dmServers.value.filter((dm) => {
      const unread = getChannelUnreadCount(DM_SERVER_URL, dm.channel);
      return unread > 0;
    }).length;
    const serverListOffset = 1 + dmCount + 1; // home + dms + divider

    const startY = e.clientY;
    let hasDragged = false;

    const onMove = (moveEvent: MouseEvent) => {
      if (!hasDragged && Math.abs(moveEvent.clientY - startY) > DRAG_THRESHOLD) {
        hasDragged = true;
        const initialDrag = {
          index,
          url,
          y: moveEvent.clientY,
          dropIndex: index,
          listTop: rect.top,
          serverListOffset,
        };
        setDrag(initialDrag);
        dragRef.current = initialDrag;
      }
      if (!hasDragged) return;

      const relativeY = moveEvent.clientY - rect.top;
      const adjustedY = relativeY - serverListOffset * ITEM_HEIGHT - 4;
      const newDropIndex = Math.max(0, Math.floor(adjustedY / ITEM_HEIGHT));
      const newDrag = {
        index,
        url,
        y: moveEvent.clientY,
        dropIndex: newDropIndex,
        listTop: rect.top,
        serverListOffset,
      };
      setDrag(newDrag);
      dragRef.current = newDrag;
    };

    const onUp = async () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      dragListenersRef.current = null;

      if (!hasDragged) {
        switchServer(url);
        return;
      }

      const currentDrag = dragRef.current;
      const from = currentDrag?.index;
      const to = currentDrag?.dropIndex;

      if (from == null || to == null || from === to) {
        setDrag(null);
        dragRef.current = null;
        return;
      }

      setIsDropping(true);
      dropTimeoutRef.current = setTimeout(async () => {
        const serversNotInFolders = servers.value.filter(
          (s) => !serverFolders.value.some((f) => f.serverUrls.includes(s.url))
        );

        const reordered = [...serversNotInFolders];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);

        const newOrder = reordered.map((s) => s.url);
        const updatedServers = [...servers.value].sort((a, b) => {
          const aInFolder = serverFolders.value.some((f) => f.serverUrls.includes(a.url));
          const bInFolder = serverFolders.value.some((f) => f.serverUrls.includes(b.url));
          if (aInFolder !== bInFolder) return aInFolder ? 1 : -1;
          if (!aInFolder && !bInFolder) return newOrder.indexOf(a.url) - newOrder.indexOf(b.url);
          return 0;
        });

        servers.value = updatedServers;
        setDrag(null);
        dragRef.current = null;
        setIsDropping(false);

        try {
          const { saveServers } = await import("../../lib/persistence");
          await saveServers();
        } catch (err) {
          console.error("Failed to save servers:", err);
        }
        dropTimeoutRef.current = null;
      }, 150);
    };

    dragListenersRef.current = { onMove, onUp };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    return () => {
      if (dragListenersRef.current) {
        document.removeEventListener("mousemove", dragListenersRef.current.onMove);
        document.removeEventListener("mouseup", dragListenersRef.current.onUp);
      }
      if (dropTimeoutRef.current) {
        clearTimeout(dropTimeoutRef.current);
      }
    };
  }, []);

  const handleServerContextMenu = (e: MouseEvent, server: { url: string; name: string }) => {
    e.preventDefault();
    const currentLevel: NotificationLevel = serverNotifSettings.value[server.url] ?? "mentions";
    const folderContainingServer = serverFolders.value.find((f) =>
      f.serverUrls.includes(server.url)
    );

    const setServerNotif = (level: NotificationLevel) => {
      if (level === "mentions") {
        const next = { ...serverNotifSettings.value };
        delete next[server.url];
        serverNotifSettings.value = next;
      } else {
        serverNotifSettings.value = {
          ...serverNotifSettings.value,
          [server.url]: level,
        };
      }
      saveNotifSettings()
        .then(() => showInfo("Notification settings saved", { autoDismissMs: 2000 }))
        .catch(console.error);
    };

    showContextMenu(
      e,
      [
        {
          label: "Mark as Read",
          icon: "CheckCircle",
          fn: () => markServerAsRead(server.url),
        },
        folderContainingServer
          ? {
              label: "Remove from Folder",
              icon: "FolderMinus",
              fn: () => {
                serverFolders.value = serverFolders.value
                  .map((f) =>
                    f.id === folderContainingServer.id
                      ? {
                          ...f,
                          serverUrls: f.serverUrls.filter((u) => u !== server.url),
                        }
                      : f
                  )
                  .filter((f) => f.serverUrls.length > 0);
                saveFolders().catch(() => {});
              },
            }
          : null,
        { separator: true, label: "", fn: () => {} },
        {
          label: "Notifications",
          icon: "Bell",
          fn: () => {},
          children: [
            {
              label: `All Messages${currentLevel === "all" ? " ✓" : ""}`,
              icon: "Bell",
              fn: () => setServerNotif("all"),
            },
            {
              label: `Mentions Only${currentLevel === "mentions" ? " ✓" : ""}`,
              icon: "BellDot",
              fn: () => setServerNotif("mentions"),
            },
            {
              label: `Mute Server${currentLevel === "none" ? " ✓" : ""}`,
              icon: "BellOff",
              fn: () => setServerNotif("none"),
            },
          ],
        },
        { separator: true, label: "", fn: () => {} },
        {
          label: "Reload Icon",
          icon: "RefreshCw",
          fn: () => reloadServerIcon(server.url),
        },
        { separator: true, label: "", fn: () => {} },
        {
          label: "Copy URL",
          icon: "Copy",
          fn: () => navigator.clipboard.writeText(server.url),
        },
        { separator: true, label: "", fn: () => {} },
        {
          label: "Leave Server",
          icon: "LogOut",
          danger: true,
          fn: () =>
            setConfirmDialog({
              isOpen: true,
              title: "Leave Server",
              message: `Are you sure you want to leave ${server.name}?`,
              onConfirm: () => {
                wsSend({ cmd: "user_leave" }, server.url);
                removeServer(server.url);
              },
            }),
        },
      ].filter(Boolean) as any[]
    );
  };

  const handleFolderContextMenu = (e: MouseEvent, folder: ServerFolder) => {
    e.preventDefault();
    e.stopPropagation();

    const colors = [
      { hex: "#5865f2", name: "Blurple" },
      { hex: "#3ba55c", name: "Green" },
      { hex: "#faa61a", name: "Yellow" },
      { hex: "#eb459e", name: "Pink" },
      { hex: "#ed4245", name: "Red" },
      { hex: "#9b59b6", name: "Purple" },
      { hex: "#1abc9c", name: "Teal" },
      { hex: "#e91e63", name: "Magenta" },
      { hex: "#00bcd4", name: "Cyan" },
      { hex: "#ff5722", name: "Orange" },
      { hex: "#795548", name: "Brown" },
      { hex: "#607d8b", name: "Grey" },
    ];

    showContextMenu(e, [
      {
        label: "Rename Folder",
        icon: "Edit3",
        fn: () => {
          const newName = prompt("Enter folder name:", folder.name);
          if (newName?.trim()) {
            serverFolders.value = serverFolders.value.map((f) =>
              f.id === folder.id ? { ...f, name: newName.trim() } : f
            );
            saveFolders().catch(() => {});
          }
        },
      },
      { separator: true, label: "", fn: () => {} },
      {
        label: "Folder Color",
        icon: "Palette",
        fn: () => {},
        children: colors.map((c) => ({
          label: `${c.hex === (folder.color || "") ? "✓ " : ""}${c.name}`,
          icon: "Circle",
          iconColor: c.hex,
          fn: () => {
            serverFolders.value = serverFolders.value.map((f) =>
              f.id === folder.id ? { ...f, color: c.hex } : f
            );
            saveFolders().catch(() => {});
          },
        })),
      },
      { separator: true, label: "", fn: () => {} },
      {
        label: "Clear Color",
        icon: "X",
        fn: () => {
          serverFolders.value = serverFolders.value.map((f) =>
            f.id === folder.id ? { ...f, color: undefined } : f
          );
          saveFolders().catch(() => {});
        },
      },
      { separator: true, label: "", fn: () => {} },
      {
        label: "Delete Folder",
        icon: "Trash2",
        danger: true,
        fn: () => {
          serverFolders.value = serverFolders.value.filter((f) => f.id !== folder.id);
          saveFolders().catch(() => {});
        },
      },
    ]);
  };

  const serversNotInFolders = servers.value.filter(
    (s) => !serverFolders.value.some((f) => f.serverUrls.includes(s.url))
  );
  const isDragging = drag !== null;
  const fromIdx = drag?.index;
  const toIdx = drag?.dropIndex;

  return (
    <>
      <div className={`${styles.guildSidebar}${mobileSidebarOpen.value ? ` ${styles.open}` : ""}`}>
        <div className={styles.guildList} ref={listRef}>
          <div
            className={`${styles.guildItem} ${styles.homeGuild} ${serverUrl.value === DM_SERVER_URL ? styles.active : ""} ${getConnectionClass(DM_SERVER_URL)}`}
            onClick={() => switchServer(DM_SERVER_URL)}
          >
            <div className={styles.guildIcon}>
              <Icon name="MessageCircle" size={24} />
            </div>
            <div className={styles.guildPill} />
          </div>

          {dmServers.value
            .filter((dm) => {
              const unread = getChannelUnreadCount(DM_SERVER_URL, dm.channel);
              return unread > 0;
            })
            .map((dm) => (
              <DMServerItem key={dm.channel} dm={dm} />
            ))}

          <div className={styles.guildDivider} />

          {serverFolders.value.map((folder) => {
            const folderServers = servers.value.filter((s) => folder.serverUrls.includes(s.url));
            const isCollapsed = folder.collapsed !== false;
            const pings = folderServers.reduce(
              (sum, s) =>
                sum + (serverNotifSettings.value[s.url] === "none" ? 0 : getServerPingCount(s.url)),
              0
            );
            const unreads = folderServers.reduce(
              (sum, s) =>
                sum +
                (serverNotifSettings.value[s.url] === "none" ? 0 : getServerUnreadCount(s.url)),
              0
            );
            const hasActive = folderServers.some((s) => serverUrl.value === s.url);

            return (
              <Fragment key={folder.id}>
                <div
                  className={`${styles.guildItem} ${styles.folderItem}${hasActive ? ` ${styles.active}` : ""}`}
                  onClick={() => {
                    serverFolders.value = serverFolders.value.map((f) =>
                      f.id === folder.id ? { ...f, collapsed: !isCollapsed } : f
                    );
                    saveFolders().catch(() => {});
                  }}
                  onContextMenu={(e) => handleFolderContextMenu(e, folder)}
                >
                  <div
                    className={styles.folderIcon}
                    style={folder.color ? { backgroundColor: folder.color } : {}}
                  >
                    <Icon name={isCollapsed ? "Folder" : "FolderOpen"} size={20} />
                  </div>
                  <div className={styles.guildPill} />
                  {unreads > 0 && pings === 0 && <div className={styles.guildUnreadDot} />}
                  {pings > 0 && <div className={styles.guildPingBadge}>{pings}</div>}
                </div>
                {!isCollapsed && (
                  <div className={styles.folderServers}>
                    {folderServers.map((server) => {
                      const muted = serverNotifSettings.value[server.url] === "none";
                      const unreads = muted ? 0 : getServerUnreadCount(server.url);
                      const pings = muted ? 0 : getServerPingCount(server.url);
                      return (
                        <div
                          key={server.url}
                          className={`${styles.guildItem} ${styles.folderServer}${serverUrl.value === server.url ? ` ${styles.active}` : ""} ${getConnectionClass(server.url)}`}
                          onClick={() => switchServer(server.url)}
                          onContextMenu={(e) => handleServerContextMenu(e, server)}
                        >
                          <div className={styles.guildIcon}>
                            <ServerIcon server={server} />
                          </div>
                          <div className={styles.guildPill} />
                          {unreads > 0 && pings === 0 && <div className={styles.guildUnreadDot} />}
                          {pings > 0 && <div className={styles.guildPingBadge}>{pings}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Fragment>
            );
          })}

          {serversNotInFolders.map((server, index) => {
            const muted = serverNotifSettings.value[server.url] === "none";
            const unreads = muted ? 0 : getServerUnreadCount(server.url);
            const pings = muted ? 0 : getServerPingCount(server.url);
            const isBeingDragged = fromIdx === index && (isDragging || isDropping);

            let shiftStyle: any;
            if (fromIdx != null && toIdx != null && fromIdx !== toIdx && !isBeingDragged) {
              if (fromIdx < toIdx && index > fromIdx && index <= toIdx)
                shiftStyle = {
                  transform: "translateY(-48px)",
                  transition: "transform 0.15s ease",
                };
              else if (fromIdx > toIdx && index >= toIdx && index < fromIdx)
                shiftStyle = {
                  transform: "translateY(48px)",
                  transition: "transform 0.15s ease",
                };
            }

            return (
              <div
                key={server.url}
                className={`${styles.guildItem} ${styles.server}${serverUrl.value === server.url ? ` ${styles.active}` : ""} ${getConnectionClass(server.url)}`}
                style={isBeingDragged ? { visibility: "hidden" } : shiftStyle}
                onMouseDown={(e) => handleServerMouseDown(index, server.url, e)}
                onContextMenu={(e) => handleServerContextMenu(e, server)}
              >
                <div className={styles.guildIcon}>
                  <ServerIcon server={server} />
                </div>
                <div className={styles.guildPill} />
                {unreads > 0 && pings === 0 && <div className={styles.guildUnreadDot} />}
                {pings > 0 && <div className={styles.guildPingBadge}>{pings}</div>}
              </div>
            );
          })}

          <div className={styles.guildDivider} />

          <div
            className={`${styles.guildItem} ${styles.addGuild}`}
            onClick={() => (showDiscoveryModal.value = true)}
          >
            <div className={styles.guildIcon}>
              <Icon name="Plus" size={24} />
            </div>
          </div>

          {(() => {
            if (!(isDragging || isDropping) || !drag) return null;
            const d = drag;
            return (
              <div
                className={`${styles.guildItem} ${styles.dragging}`}
                style={{
                  position: "fixed",
                  left: 12,
                  top: isDragging
                    ? d.y - 24
                    : d.listTop +
                      (d.serverListOffset || 0) * ITEM_HEIGHT +
                      (d.dropIndex ?? 0) * ITEM_HEIGHT +
                      4,
                  pointerEvents: "none",
                  zIndex: 1000,
                  transition: isDropping ? "top 0.15s ease" : undefined,
                }}
              >
                <div className={styles.guildIcon}>
                  <ServerIcon server={servers.value.find((s) => s.url === d.url)!} />
                </div>
              </div>
            );
          })()}
        </div>
      </div>
      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          danger={true}
        />
      )}
    </>
  );
}

function DMServerItem({ dm }: { dm: { channel: string; username: string; name: string } }) {
  const unread = getChannelUnreadCount(DM_SERVER_URL, dm.channel);
  const displayName = useDisplayName(dm.username);
  return (
    <div
      className={`${styles.guildItem} ${styles.dmServer}`}
      onClick={() => openDMWith(dm.username)}
      onContextMenu={(e) => {
        e.preventDefault();
        showContextMenu(e, [
          {
            label: "Mark as Read",
            icon: "CheckCircle",
            fn: () => markServerAsRead(DM_SERVER_URL),
          },
          { separator: true, label: "", fn: () => {} },
          {
            label: "Copy Username",
            icon: "Copy",
            fn: () => navigator.clipboard.writeText(dm.username),
          },
        ]);
      }}
    >
      <div className={styles.guildIcon}>
        <UserAvatar username={dm.username} alt={displayName} />
      </div>
      <div className={styles.guildPill} />
      {unread > 0 ? <div className={styles.guildPingBadge}>{unread}</div> : null}
    </div>
  );
}
