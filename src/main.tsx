import { render, h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import "./style.css";
import "./settings.css";

import {
  token,
  serverUrl,
  currentChannel,
  currentThread,
  servers,
  channelsByServer,
  messagesByServer,
  usersByServer,
  readTimesByServer,
  wsConnections,
  reconnectAttempts,
  reconnectTimeouts,
  setOriginFS,
  DEFAULT_SERVERS,
  DM_SERVER_URL,
  friends,
  friendRequests,
  blockedUsers,
  roturFollowing,
  roturStatuses,
  isOffline,
  offlinePushServers,
  serverNotifSettings,
  channelNotifSettings,
} from "./state";

import {
  showSettingsModal,
  showAccountModal,
  showDiscoveryModal,
  showServerSettingsModal,
  showVoiceCallView,
  mobileSidebarOpen,
  mobilePanelOpen,
  closeMobileNav,
  showThreadPanel,
} from "./lib/ui-signals";
import {
  loadServers,
  loadReadTimes,
  loadNotifSettings,
} from "./lib/persistence";
import { OriginFSClientClass } from "./originFSKit";
import { connectToServer } from "./lib/websocket";
import {
  requestNotificationPermission,
  setupVisibilityHandler,
} from "./lib/websocket";
import {
  selectHomeChannel,
  selectChannel,
  switchServer,
  navigateFromUrl,
} from "./lib/actions";
import { loadShortcodes } from "./lib/shortcodes";
import { session as dbSession, readTimes as dbReadTimes } from "./lib/db";
import { initSettingsFromDb } from "./state";
import {
  validateToken,
  getAuthRedirectUrl,
  getFollowing,
  getStatus,
} from "./lib/rotur-api";

import { Header } from "./components/Header/index";
import { GuildSidebar } from "./components/GuildSidebar";
import { ChannelList } from "./components/ChannelList";
import { MessageArea, ReplyBar } from "./components/MessageArea";
import {
  SettingsModal,
  AccountModal,
  DiscoveryModal,
} from "./components/Modals";
import { ServerSettingsModal } from "./components/ServerSettings";
import { UserPopout } from "./components/UserPopout";
import { DMFriendsTab } from "./components/DMFriendsTab";
import { DMHomeTab } from "./components/DMHomeTab";
import { NewMessageTab } from "./components/NewMessageTab";
import { NotesTab } from "./components/NotesTab";
import { VoiceCallView } from "./components/VoiceCallView";
import { GlobalContextMenu } from "./components/ContextMenu";
import { DiscoveryPage } from "./components/DiscoveryPage";
import { OfflineScreen } from "./components/OfflineScreen";
import { ThreadPanel, ThreadView } from "./components/ThreadPanel";
import { MembersList } from "./components/MembersList";
import { useFavicon } from "./lib/useFavicon";

function App() {
  const [isLoading, setIsLoading] = useState(true);
  useFavicon();

  useEffect(() => {
    const handlePopState = () => {
      navigateFromUrl();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const boot = async () => {
    isOffline.value = false;
    setIsLoading(true);

    // Load settings from IDB
    await initSettingsFromDb();

    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");
    const serverParam = urlParams.get("server");
    const savedToken = await dbSession.get<string>("token", "");

    const authRedirect = () => {
      dbSession.del("token");
      window.location.href = getAuthRedirectUrl(window.location.href);
    };

    // Persist the ?server= param across the auth redirect via sessionStorage
    if (serverParam) {
      sessionStorage.setItem("pendingServerJoin", serverParam);
    }

    if (urlToken) {
      token.value = urlToken;
      await dbSession.set("token", urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (savedToken) {
      token.value = savedToken;
    } else {
      // No token at all — if offline, show offline screen; otherwise redirect
      if (!navigator.onLine) {
        isOffline.value = true;
        setIsLoading(false);
        return;
      }
      authRedirect();
      return;
    }

    // Validate the token before proceeding — fails when offline
    let meData: any;
    try {
      meData = await validateToken();
    } catch {
      meData = null;
    }

    if (!meData) {
      if (!navigator.onLine) {
        isOffline.value = true;
        setIsLoading(false);
        return;
      }
      authRedirect();
      return;
    }

    friends.value = meData["sys.friends"] || [];
    friendRequests.value = meData["sys.requests"] || [];
    blockedUsers.value = meData["sys.blocked"] || [];

    // Seed follow state in the background — non-blocking
    getFollowing(meData.username)
      .then((data) => {
        roturFollowing.value = new Set(
          (data.following || []).map((u: string) => u.toLowerCase()),
        );
      })
      .catch(() => {});

    // Seed own custom status — non-blocking
    getStatus(meData.username)
      .then((s) => {
        if (s?.content) {
          roturStatuses.value = {
            ...roturStatuses.value,
            [meData.username.toLowerCase()]: s,
          };
        }
      })
      .catch(() => {});

    const originFS = new OriginFSClientClass(token.value!);
    setOriginFS(originFS);

    const loadedServers = await loadServers();
    servers.value = loadedServers;

    const savedServerUrl =
      (await dbSession.get<string>("serverUrl", "")) || DM_SERVER_URL;
    serverUrl.value = savedServerUrl;

    // Load read times: merge IDB (local) with OriginFS (cloud)
    const localReadTimes: Record<string, Record<string, number>> = {};

    // Always load DM read times (DM_SERVER_URL is not in loadedServers)
    localReadTimes[DM_SERVER_URL] = await dbReadTimes.get(DM_SERVER_URL);

    for (const server of loadedServers) {
      localReadTimes[server.url] = await dbReadTimes.get(server.url);
    }

    try {
      const cloudReadTimes = await loadReadTimes();
      for (const serverUrlKey in cloudReadTimes) {
        if (!localReadTimes[serverUrlKey]) {
          localReadTimes[serverUrlKey] = cloudReadTimes[serverUrlKey];
        } else {
          for (const channelName in cloudReadTimes[serverUrlKey]) {
            if (!(channelName in localReadTimes[serverUrlKey])) {
              localReadTimes[serverUrlKey][channelName] =
                cloudReadTimes[serverUrlKey][channelName];
            }
          }
        }
      }
    } catch (e) {
      console.warn("[App] Failed to load cloud read times:", e);
    }

    readTimesByServer.value = localReadTimes;

    // Load notification settings from OriginFS and merge with IDB values.
    // Cloud entries win for keys not already set locally (same strategy as read times).
    try {
      const cloudNotif = await loadNotifSettings();
      const mergedServer = {
        ...cloudNotif.serverNotif,
        ...serverNotifSettings.value,
      };
      const mergedChannel = {
        ...cloudNotif.channelNotif,
        ...channelNotifSettings.value,
      };
      serverNotifSettings.value = mergedServer;
      channelNotifSettings.value = mergedChannel;
    } catch (e) {
      console.warn("[App] Failed to load cloud notif settings:", e);
    }

    connectToServer(DM_SERVER_URL);
    loadedServers.forEach((s) => {
      if (s.url !== DM_SERVER_URL) connectToServer(s.url);
    });

    await loadShortcodes();
    requestNotificationPermission();
    setupVisibilityHandler();

    const pendingServer = sessionStorage.getItem("pendingServerJoin") ?? null;

    if (pendingServer && pendingServer !== DM_SERVER_URL) {
      sessionStorage.removeItem("pendingServerJoin");

      const normalized = pendingServer.replace(/^wss?:\/\//, "");

      // Add to server list if not already present
      if (!servers.value.some((s) => s.url === normalized)) {
        servers.value = [
          ...servers.value,
          { name: normalized, url: normalized, icon: null },
        ];
        const { saveServers } = await import("./lib/persistence");
        await saveServers();
      }

      const connected = await switchServer(normalized);

      if (connected) {
        // switchServer lands on the first channel immediately if channels are
        // already loaded, but for a fresh connection they arrive via the
        // channels_get WS response shortly after. Poll until they appear.
        const waitForChannel = () =>
          new Promise<void>((resolve) => {
            const check = () => {
              const chs = channelsByServer.value[normalized] ?? [];
              const text = chs.find(
                (c) => c.type === "text" || c.type === "voice",
              );
              if (text) {
                selectChannel(text);
                resolve();
              } else {
                setTimeout(check, 100);
              }
            };
            // Give up after 10 s and fall back to home
            setTimeout(resolve, 10_000);
            check();
          });

        await waitForChannel();
        setIsLoading(false);
        navigateFromUrl();
        return;
      }
      // If connection failed fall through to the normal home landing
    } else if (pendingServer) {
      sessionStorage.removeItem("pendingServerJoin");
    }

    serverUrl.value = DM_SERVER_URL;
    selectHomeChannel();
    setIsLoading(false);
    navigateFromUrl();
  };

  useEffect(() => {
    boot();
  }, []);

  if (isLoading) return <div className="loading-screen">Loading...</div>;

  if (isOffline.value) {
    return <OfflineScreen onRetry={boot} />;
  }

  const showNotes =
    currentChannel.value?.name === "notes" && serverUrl.value === DM_SERVER_URL;
  const showHome =
    currentChannel.value?.name === "home" && serverUrl.value === DM_SERVER_URL;
  const showFriends = currentChannel.value?.name === "relationships";
  const showNewMessage =
    currentChannel.value?.name === "new_message" &&
    serverUrl.value === DM_SERVER_URL;
  const showDiscovery = currentChannel.value?.name === "discovery";
  const isForumChannel = currentChannel.value?.type === "forum";
  const isThreadSelected = currentChannel.value?.type === "thread";

  const voiceCallActive = showVoiceCallView.value;

  return (
    <div id="chat-screen" className="active">
      <div
        className={`overlay${mobileSidebarOpen.value || mobilePanelOpen.value ? " active" : ""}`}
        onClick={closeMobileNav}
      ></div>
      {showDiscovery ? (
        <DiscoveryPage />
      ) : (
        <div className="content">
          <GuildSidebar />
          <ChannelList />
          {voiceCallActive ? (
            <VoiceCallView />
          ) : showNotes ? (
            <NotesTab />
          ) : showHome ? (
            <DMHomeTab />
          ) : showFriends ? (
            <DMFriendsTab />
          ) : showNewMessage ? (
            <NewMessageTab />
          ) : isForumChannel && !isThreadSelected ? (
            <ThreadPanel />
          ) : (
            <MessageArea />
          )}
        </div>
      )}
      {showSettingsModal.value && <SettingsModal />}
      {showAccountModal.value && (
        <AccountModal username={showAccountModal.value} />
      )}
      {showDiscoveryModal.value && <DiscoveryModal />}
      {showServerSettingsModal.value && <ServerSettingsModal />}
      <UserPopout />
      <GlobalContextMenu />
    </div>
  );
}

render(<App />, document.getElementById("app")!);
