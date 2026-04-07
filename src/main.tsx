import "preact/debug";
import { render, h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { registerSW } from "virtual:pwa-register";
import "./style.css";
import "./settings.css";
import "./components/Modals/ChannelEditModal/ChannelEditModal.css";
import "./components/UpdatePopup/style.css";

import {
  token,
  serverUrl,
  currentChannel,
  servers,
  serverFolders,
  channelsByServer,
  readTimesByServer,
  setOriginFS,
  DM_SERVER_URL,
  friends,
  friendRequests,
  blockedUsers,
  friendNicknames,
  roturFollowing,
  roturStatuses,
  isOffline,
  serverNotifSettings,
  channelNotifSettings,
  notificationPromptDismissed,
} from "./state";

import {
  showSettingsModal,
  showAccountModal,
  showDiscoveryModal,
  showServerSettingsModal,
  showChannelEditModal,
  showVoiceCallView,
  mobileSidebarOpen,
  mobilePanelOpen,
  closeMobileNav,
  showNotificationPrompt,
  showUIError,
} from "./lib/ui-signals";
import {
  loadServers,
  loadReadTimes,
  loadNotifSettings,
  loadFolders,
  loadFriendNicknames,
} from "./lib/persistence";
import { OriginFSClientClass } from "./originFSKit";
import { LocalOriginFSClass } from "./localOriginFSKit";
import {
  connectToServer,
  setupVisibilityHandler,
  cleanupVisibilityHandler,
  cleanupAudioContext,
} from "./lib/websocket";
import { cleanupWsSenderAudio } from "./lib/ws-sender";
import {
  selectHomeChannel,
  selectChannel,
  switchServer,
  navigateFromUrl,
} from "./lib/actions";
import { loadShortcodes } from "./lib/shortcodes";
import { prewarmCommonEmojis } from "./lib/emoji";
import { emojiCache } from "./lib/emoji-data-cache";
import { session as dbSession, readTimes as dbReadTimes } from "./lib/db";
import { initSettingsFromDb } from "./state";
import {
  validateToken,
  getAuthRedirectUrl,
  getFollowing,
  getStatus,
} from "./lib/rotur-api";
import { showLoginChoiceModal } from "./lib/ui-signals";

import { GuildSidebar } from "./components/GuildSidebar";
import { ChannelList } from "./components/ChannelList";
import { MessageArea } from "./components/MessageArea";
import {
  SettingsModal,
  AccountModal,
  DiscoveryModal,
  NotificationPromptModal,
  CrackedAuthModal,
} from "./components/Modals";
import { LoginChoiceModal } from "./components/LoginChoiceModal";
import { RoturRequiredModal } from "./components/RoturRequiredModal";
import { ServerSettingsModal } from "./components/ServerSettings";
import { ChannelEditModal } from "./components/Modals/ChannelEditModal";
import { UserPopout } from "./components/UserPopout";
import { DMFriendsTab } from "./components/DMFriendsTab";
import { DMHomeTab } from "./components/DMHomeTab";
import { NewMessageTab } from "./components/NewMessageTab";
import { NotesTab } from "./components/NotesTab";
import { RolesTab } from "./components/RolesTab";
import { VoiceCallView } from "./components/VoiceCallView";
import { GlobalContextMenu } from "./components/ContextMenu";
import { DiscoveryPage } from "./components/DiscoveryPage";

import { OfflineScreen } from "./components/OfflineScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { ThreadPanel } from "./components/ThreadPanel";
import { useFavicon } from "./lib/useFavicon";
import { UpdatePopup, updateAvailable } from "./components/UpdatePopup";

registerSW({
  onNeedRefresh() {
    updateAvailable.value = true;
  },
});

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
    }

    // If we have a token, validate it; otherwise use local storage
    let meData: any = null;
    let hasValidToken = false;

    if (token.value) {
      try {
        meData = await validateToken();
        hasValidToken = !!meData;
      } catch {
        meData = null;
        hasValidToken = false;
      }
    }

    if (!hasValidToken) {
      if (!navigator.onLine && !token.value) {
        isOffline.value = true;
        setIsLoading(false);
        return;
      }
      // No valid token — use local storage and show login choice
      const localFS = new LocalOriginFSClass();
      setOriginFS(localFS);

      const loadedServers = await loadServers();
      servers.value = loadedServers;

      const loadedFolders = await loadFolders();
      serverFolders.value = loadedFolders;

      const savedServerUrl =
        (await dbSession.get<string>("serverUrl", "")) || DM_SERVER_URL;
      serverUrl.value = savedServerUrl;

      const localReadTimes: Record<string, Record<string, number>> = {};
      localReadTimes[DM_SERVER_URL] = await dbReadTimes.get(DM_SERVER_URL);
      for (const server of loadedServers) {
        localReadTimes[server.url] = await dbReadTimes.get(server.url);
      }
      readTimesByServer.value = localReadTimes;

      showLoginChoiceModal.value = true;
      setIsLoading(false);
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
      .catch((err) => {
        console.warn("Failed to load follow state:", err);
      });

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
      .catch((err) => {
        console.warn("Failed to load status:", err);
      });

    const originFS = new OriginFSClientClass(token.value!);
    setOriginFS(originFS);

    const loadedServers = await loadServers();
    servers.value = loadedServers;

    const loadedFolders = await loadFolders();
    serverFolders.value = loadedFolders;

    const loadedNicknames = await loadFriendNicknames();
    friendNicknames.value = loadedNicknames;

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
      showUIError(e, "Failed to load message read status from cloud", {
        autoDismissMs: 5000,
      });
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
      showUIError(e, "Failed to load notification settings", {
        autoDismissMs: 5000,
      });
    }

    const hasRoturToken = !!token.value;
    if (hasRoturToken) {
      connectToServer(DM_SERVER_URL);
    }
    loadedServers.forEach((s) => {
      if (s.url !== DM_SERVER_URL) connectToServer(s.url);
    });

    await loadShortcodes();
    prewarmCommonEmojis();
    emojiCache.startBackgroundInit();

    // Show notification prompt on new device if notifications are disabled and user hasn't dismissed
    if (
      "Notification" in window &&
      Notification.permission === "default" &&
      !notificationPromptDismissed.value
    ) {
      showNotificationPrompt.value = true;
    }

    setupVisibilityHandler();

    window.addEventListener("beforeunload", () => {
      cleanupVisibilityHandler();
      cleanupAudioContext();
      cleanupWsSenderAudio();
    });

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

  if (isLoading) return <LoadingScreen />;

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
  const showRoles =
    currentChannel.value?.name === "roles" && serverUrl.value !== DM_SERVER_URL;
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
          ) : showRoles ? (
            <RolesTab />
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
      {showChannelEditModal.value && <ChannelEditModal />}
      <NotificationPromptModal />
      <LoginChoiceModal />
      <CrackedAuthModal />
      <RoturRequiredModal />
      <UserPopout />
      <GlobalContextMenu />
      <UpdatePopup />
    </div>
  );
}

render(<App />, document.getElementById("app")!);
