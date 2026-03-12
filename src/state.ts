import { signal, computed, effect } from "@preact/signals";
import type {
  Channel,
  ServerUser,
  Message,
  Server,
  DMServer,
  Role,
  RoturAccount,
  SlashCommand,
  RoturGroup,
  RoturStatusUpdate,
} from "./types";
import { settings as dbSettings } from "./lib/db";

export const token = signal<string | null>(null);
export const DM_SERVER_URL = "dms.mistium.com";
export const SPECIAL_CHANNELS = new Set([
  "home",
  "relationships",
  "notes",
  "cmds",
  "new_message",
  "discovery",
]);
export const serverUrl = signal(DM_SERVER_URL);
export const priorityServer = signal<string | null>(null);
export const currentChannel = signal<Channel | null>(null);
export const servers = signal<Server[]>([]);
export const dmServers = signal<DMServer[]>([]);
export const friends = signal<string[]>([]);
export const friendRequests = signal<string[]>([]);
export const blockedUsers = signal<string[]>([]);
export const replyTo = signal<Message | null>(null);
export const replyPing = signal<boolean>(true);

export const channelsByServer = signal<Record<string, Channel[]>>({});
export const messagesByServer = signal<
  Record<string, Record<string, Message[]>>
>({});
// Tracks which channels have had at least one successful messages_get response.
// message_new events for channels not in this set are not stored in messagesByServer
// so that opening the channel always triggers a fresh messages_get fetch.
export const loadedChannelsByServer: Record<string, Set<string>> = {};
// Tracks channels where all historical messages have been loaded (server returned
// fewer messages than the pagination limit, meaning the beginning has been reached).
export const reachedOldestByServer: Record<string, Set<string>> = {};
export const usersByServer = signal<Record<string, Record<string, ServerUser>>>(
  {},
);
export const currentUserByServer = signal<Record<string, RoturAccount>>({});
export const rolesByServer = signal<Record<string, Record<string, Role>>>({});
export const slashCommandsByServer = signal<Record<string, SlashCommand[]>>({});
export const readTimesByServer = signal<Record<string, Record<string, number>>>(
  {},
);
export const lastChannelByServer = signal<Record<string, string>>({});
export const unreadByChannel = signal<Record<string, number>>({});
export const unreadPings = signal<Record<string, number>>({});
export const typingUsersByServer = signal<
  Record<string, Record<string, Map<string, number>>>
>({});
export const serverPingsByServer = signal<Record<string, number>>({});

export interface PingMessage {
  id: string;
  user: string;
  content: string;
  timestamp: number;
  type: string;
  pinned: boolean;
  channel: string;
  reply_to?: { id: string; user: string; content?: string };
}

export const pingsInboxMessages = signal<PingMessage[]>([]);
export const pingsInboxTotal = signal<number>(0);
export const pingsInboxLoading = signal<boolean>(false);
export const pingsInboxOffset = signal<number>(0);
export const PINGS_INBOX_LIMIT = 50;

export interface WSConnection {
  socket: WebSocket | null;
  status: "connecting" | "connected" | "disconnected" | "error";
  closeHandler?: () => void;
  errorHandler?: () => void;
}

export const wsConnections: Record<string, WSConnection> = {};
export const wsStatus: Record<
  string,
  "connecting" | "connected" | "disconnected" | "error"
> = {};
export const serverValidatorKeys: Record<string, string> = {};
export const authRetries: Record<string, number> = {};
export const authRetryTimeouts: Record<string, number> = {};
export const reconnectAttempts: Record<string, number> = {};
export const reconnectTimeouts: Record<string, number> = {};
export const pendingReplyTimeouts: Record<string, number> = {};

/**
 * Set to the username being added via `dm add` while we wait for the DMS
 * server response.  Cleared by the websocket handler once the response
 * (success or error) arrives.
 */
export let pendingDMAddUsername: string | null = null;
export function setPendingDMAddUsername(username: string | null) {
  pendingDMAddUsername = username;
}

export const serversAttempted: Set<string> = new Set();

export let originFS: any = null;
export function setOriginFS(fs: any) {
  originFS = fs;
}
export function getOriginFS() {
  return originFS;
}

export const channels = computed(
  () => channelsByServer.value[serverUrl.value] || [],
);
export const messages = computed(
  () => messagesByServer.value[serverUrl.value] || {},
);
export const users = computed(() => usersByServer.value[serverUrl.value] || {});
export const currentUser = computed(
  () => currentUserByServer.value[serverUrl.value],
);
export const currentServer = computed(() =>
  servers.value.find((s) => s.url === serverUrl.value),
);
export const slashCommands = computed(
  () => slashCommandsByServer.value[serverUrl.value] || [],
);

export function setChannelsForServer(url: string, ch: Channel[]) {
  channelsByServer.value = { ...channelsByServer.value, [url]: ch };
}

export function setMessagesForServer(
  url: string,
  msgs: Record<string, Message[]>,
) {
  messagesByServer.value = { ...messagesByServer.value, [url]: msgs };
}

export function setUsersForServer(
  url: string,
  usrs: Record<string, ServerUser>,
) {
  usersByServer.value = { ...usersByServer.value, [url]: usrs };
}

export function setCurrentUserForServer(url: string, user: RoturAccount) {
  currentUserByServer.value = { ...currentUserByServer.value, [url]: user };
}

export function addMessage(channelName: string, msg: Message) {
  const current = messagesByServer.value[serverUrl.value] || {};
  const channelMsgs = current[channelName] || [];
  messagesByServer.value = {
    ...messagesByServer.value,
    [serverUrl.value]: {
      ...current,
      [channelName]: [...channelMsgs, msg],
    },
  };
}

export function updateMessage(
  channelName: string,
  msgId: string,
  update: Partial<Message>,
) {
  const current = messagesByServer.value[serverUrl.value] || {};
  const channelMsgs = current[channelName] || [];
  const idx = channelMsgs.findIndex((m) => m.id === msgId);
  if (idx !== -1) {
    const updated = [...channelMsgs];
    updated[idx] = { ...updated[idx], ...update };
    messagesByServer.value = {
      ...messagesByServer.value,
      [serverUrl.value]: {
        ...current,
        [channelName]: updated,
      },
    };
  }
}

export function addUser(url: string, username: string, user: ServerUser) {
  const current = usersByServer.value[url] || {};
  usersByServer.value = {
    ...usersByServer.value,
    [url]: { ...current, [username.toLowerCase()]: user },
  };
}

export const DEFAULT_SERVERS: Server[] = [
  { name: "OriginChats", url: "chats.mistium.com", icon: null },
];

export const recentEmojis = signal<string[]>([]);

// ── Rotur social state ────────────────────────────────────────────────────────

/** Cached custom statuses keyed by username (fetched on demand). */
export const roturStatuses = signal<Record<string, RoturStatusUpdate>>({});

/** Groups the current user belongs to. */
export const roturMyGroups = signal<RoturGroup[]>([]);

/** Usernames that the current user follows on Rotur. */
export const roturFollowing = signal<Set<string>>(new Set());

export const sendTypingIndicators = signal<boolean>(true);

export const dmMessageSound = signal<boolean>(true);

// ─── Notification settings ─────────────────────────────────────────────────────
// Per-server and per-channel notification level overrides.
// "all"      — ping (sound + badge) for every message
// "mentions" — default; only @mentions and reply pings
// "none"     — muted; no pings, no sound, messages still shown
export type NotificationLevel = "all" | "mentions" | "none";

/** Overrides keyed by serverUrl. */
export const serverNotifSettings = signal<Record<string, NotificationLevel>>(
  {},
);

/** Overrides keyed by "serverUrl:channelName". Channel settings take priority over server settings. */
export const channelNotifSettings = signal<Record<string, NotificationLevel>>(
  {},
);

/** Resolve the effective notification level for a channel, applying server → channel override order. */
export function getChannelNotifLevel(
  sUrl: string,
  channelName: string,
): NotificationLevel {
  const channelKey = `${sUrl}:${channelName}`;
  if (channelNotifSettings.value[channelKey] !== undefined) {
    return channelNotifSettings.value[channelKey];
  }
  if (serverNotifSettings.value[sUrl] !== undefined) {
    return serverNotifSettings.value[sUrl];
  }
  return "mentions";
}

// --- Client Appearance / Notification Settings ---

export type PingSoundType =
  | "default"
  | "soft"
  | "bell"
  | "pop"
  | "custom"
  | "none";
export type BlockedMessageDisplay = "hide" | "collapse" | "show";
export type AppTheme =
  | "dark"
  | "midnight"
  | "dim"
  | "light"
  | "amoled"
  | "ocean"
  | "forest";
export type AppFont =
  | "default"
  | "system"
  | "geometric"
  | "humanist"
  | "mono"
  | "serif";
export type AvatarShape = "circle" | "rounded" | "square";

export const pingSound = signal<PingSoundType>("default");

export const pingVolume = signal<number>(0.3);

// custom ping MP3 stored as a data-URI
export const customPingSound = signal<string | null>(null);

export const blockedMessageDisplay = signal<BlockedMessageDisplay>("collapse");

export const appTheme = signal<AppTheme>("dark");

export const appFont = signal<AppFont>("default");

export const hideScrollbars = signal<boolean>(false);

export const hideAvatarBorders = signal<boolean>(false);

export const reduceMotion = signal<boolean>(false);

// Appearance extras
export const avatarShape = signal<AvatarShape>("circle");

export const bubbleRadius = signal<number>(10);

export const accentColor = signal<string>("");

export const pingHighlightColor = signal<string>("");

// Emoji rendering
export const useSystemEmojis = signal<boolean>(false);

// Chat display settings
export const messageFontSize = signal<number>(15);

export const compactMode = signal<boolean>(false);

export const showTimestamps = signal<boolean>(true);

export const showEditedIndicator = signal<boolean>(true);

export const maxInlineImageWidth = signal<number>(400);

// Voice & Video settings
export const micThreshold = signal<number>(30);

export const voiceVideoRes = signal<number>(720);

export const voiceVideoFps = signal<number>(30);

// ─── Theme / font helpers (must be declared before the effects that call them) ─

const THEME_VARS: Record<AppTheme, Record<string, string>> = {
  dark: {
    "--bg": "#050505",
    "--surface": "#0a0a0c",
    "--surface-light": "#141419",
    "--surface-hover": "#1f1f26",
    "--border": "#2a2a33",
    "--text": "#ededed",
    "--text-dim": "#a0a0a0",
    "--primary": "#4e5058",
    "--primary-hover": "#586068",
  },
  midnight: {
    "--bg": "#000000",
    "--surface": "#060611",
    "--surface-light": "#0d0d1f",
    "--surface-hover": "#16162e",
    "--border": "#23233a",
    "--text": "#e8e8f4",
    "--text-dim": "#8888aa",
    "--primary": "#5865f2",
    "--primary-hover": "#4752c4",
  },
  dim: {
    "--bg": "#1a1a1f",
    "--surface": "#212128",
    "--surface-light": "#2a2a33",
    "--surface-hover": "#33333d",
    "--border": "#3a3a47",
    "--text": "#e0e0e8",
    "--text-dim": "#909099",
    "--primary": "#5865f2",
    "--primary-hover": "#4752c4",
  },
  light: {
    "--bg": "#f2f3f5",
    "--surface": "#ffffff",
    "--surface-light": "#f2f3f5",
    "--surface-hover": "#e8e9ec",
    "--border": "#e3e5e8",
    "--text": "#060607",
    "--text-dim": "#4e5058",
    "--primary": "#5865f2",
    "--primary-hover": "#4752c4",
  },
  amoled: {
    "--bg": "#000000",
    "--surface": "#000000",
    "--surface-light": "#0a0a0a",
    "--surface-hover": "#141414",
    "--border": "#1e1e1e",
    "--text": "#ffffff",
    "--text-dim": "#888888",
    "--primary": "#5865f2",
    "--primary-hover": "#4752c4",
  },
  ocean: {
    "--bg": "#040d1a",
    "--surface": "#081428",
    "--surface-light": "#0e1e38",
    "--surface-hover": "#162848",
    "--border": "#1e3258",
    "--text": "#e0f0ff",
    "--text-dim": "#7a9fc0",
    "--primary": "#00a8fc",
    "--primary-hover": "#0090d4",
  },
  forest: {
    "--bg": "#060d06",
    "--surface": "#0a140a",
    "--surface-light": "#111e11",
    "--surface-hover": "#192819",
    "--border": "#243424",
    "--text": "#e0f0e0",
    "--text-dim": "#7a9f7a",
    "--primary": "#3ba55c",
    "--primary-hover": "#2d8049",
  },
};

export function applyTheme(theme: AppTheme) {
  const vars = THEME_VARS[theme] || THEME_VARS.dark;
  const root = document.documentElement;
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val);
  }
  // Re-apply accent override on top if one is set
  const accent = accentColor.value;
  if (accent) applyAccentColor(accent);
  // Re-apply ping highlight colour override
  applyPingHighlightColor(pingHighlightColor.value);
}

export function applyFont(font: AppFont) {
  const fontClasses: AppFont[] = [
    "system",
    "geometric",
    "humanist",
    "mono",
    "serif",
  ];
  for (const cls of fontClasses) {
    document.body.classList.remove(`font-${cls}`);
  }
  if (font !== "default") {
    document.body.classList.add(`font-${font}`);
  }
}

export function applyAvatarShape(shape: AvatarShape) {
  const r = shape === "circle" ? "50%" : shape === "rounded" ? "22%" : "6px";
  document.documentElement.style.setProperty("--avatar-radius", r);
}

export function applyBubbleRadius(px: number) {
  document.documentElement.style.setProperty("--chat-radius", `${px}px`);
  document.documentElement.style.setProperty("--border-radius", `${px}px`);
}

export function applyAccentColor(hex: string) {
  if (!hex) {
    // clear override — re-apply theme defaults
    const vars = THEME_VARS[appTheme.value] || THEME_VARS.dark;
    document.documentElement.style.setProperty("--primary", vars["--primary"]);
    document.documentElement.style.setProperty(
      "--primary-hover",
      vars["--primary-hover"],
    );
    return;
  }
  document.documentElement.style.setProperty("--primary", hex);
  // darken ~10% for hover
  document.documentElement.style.setProperty("--primary-hover", hex + "cc");
}

export function applyPingHighlightColor(hex: string) {
  if (!hex) {
    // restore default mention colour
    document.documentElement.style.setProperty("--mention", "#9b87f5");
    return;
  }
  document.documentElement.style.setProperty("--mention", hex);
}

export function applyMessageFontSize(px: number) {
  document.documentElement.style.setProperty("--message-font-size", `${px}px`);
}

export function applyCompactMode(on: boolean) {
  document.body.classList.toggle("compact-mode", on);
}

export function applyMaxImageWidth(px: number) {
  document.documentElement.style.setProperty(
    "--max-inline-image-width",
    `${px}px`,
  );
}

// Apply saved settings on initial load (before any reactive effects)
applyTheme(appTheme.value);
applyFont(appFont.value);
applyAvatarShape(avatarShape.value);
applyBubbleRadius(bubbleRadius.value);
if (accentColor.value) applyAccentColor(accentColor.value);
applyPingHighlightColor(pingHighlightColor.value);
applyMessageFontSize(messageFontSize.value);
applyCompactMode(compactMode.value);
applyMaxImageWidth(maxInlineImageWidth.value);
document.body.classList.toggle("hide-scrollbars", hideScrollbars.value);
document.body.classList.toggle("hide-avatar-borders", hideAvatarBorders.value);
document.body.classList.toggle("reduce-motion", reduceMotion.value);
document.body.classList.toggle("hide-timestamps", !showTimestamps.value);
document.body.classList.toggle(
  "hide-edited-indicator",
  !showEditedIndicator.value,
);

// ─── Hydrate signals from IDB ─────────────────────────────────────────────────
// Called once at app startup (before rendering) to load persisted settings.

let _settingsLoaded = false;

export async function initSettingsFromDb(): Promise<void> {
  const s = dbSettings;
  const bool = (v: string | undefined, def: boolean) =>
    v === undefined ? def : v !== "false";
  const num = (v: string | undefined, def: number) =>
    v === undefined ? def : parseFloat(v);
  const str = <T extends string>(v: string | undefined, def: T) =>
    (v ?? def) as T;

  recentEmojis.value = await s.get<string[]>("recentEmojis", []);
  sendTypingIndicators.value = bool(
    await s.get<string>("sendTypingIndicators", undefined),
    true,
  );
  dmMessageSound.value = bool(
    await s.get<string>("dmMessageSound", undefined),
    true,
  );
  pingSound.value = str(
    await s.get<string>("pingSound", undefined),
    "default",
  ) as PingSoundType;
  pingVolume.value = num(await s.get<string>("pingVolume", undefined), 0.3);
  customPingSound.value = await s.get<string | null>("customPingSound", null);
  blockedMessageDisplay.value = str(
    await s.get<string>("blockedMessageDisplay", undefined),
    "collapse",
  ) as BlockedMessageDisplay;
  appTheme.value = str(
    await s.get<string>("theme", undefined),
    "dark",
  ) as AppTheme;
  appFont.value = str(
    await s.get<string>("font", undefined),
    "default",
  ) as AppFont;
  hideScrollbars.value = bool(
    await s.get<string>("hideScrollbars", undefined),
    false,
  );
  hideAvatarBorders.value = bool(
    await s.get<string>("hideAvatarBorders", undefined),
    false,
  );
  reduceMotion.value = bool(
    await s.get<string>("reduceMotion", undefined),
    false,
  );
  avatarShape.value = str(
    await s.get<string>("avatarShape", undefined),
    "circle",
  ) as AvatarShape;
  bubbleRadius.value = num(await s.get<string>("bubbleRadius", undefined), 10);
  accentColor.value = await s.get<string>("accentColor", "");
  pingHighlightColor.value = await s.get<string>("pingHighlightColor", "");
  messageFontSize.value = num(
    await s.get<string>("messageFontSize", undefined),
    15,
  );
  compactMode.value = bool(
    await s.get<string>("compactMode", undefined),
    false,
  );
  showTimestamps.value = bool(
    await s.get<string>("showTimestamps", undefined),
    true,
  );
  showEditedIndicator.value = bool(
    await s.get<string>("showEdited", undefined),
    true,
  );
  maxInlineImageWidth.value = num(
    await s.get<string>("maxInlineImageWidth", undefined),
    400,
  );
  useSystemEmojis.value = bool(
    await s.get<string>("useSystemEmojis", undefined),
    false,
  );
  micThreshold.value = num(await s.get<string>("micThreshold", undefined), 30);
  voiceVideoRes.value = num(await s.get<string>("vcRes", undefined), 720);
  voiceVideoFps.value = num(await s.get<string>("vcFps", undefined), 30);
  serverNotifSettings.value = await s.get<Record<string, NotificationLevel>>(
    "serverNotifSettings",
    {},
  );
  channelNotifSettings.value = await s.get<Record<string, NotificationLevel>>(
    "channelNotifSettings",
    {},
  );

  _settingsLoaded = true;
}

// ─── Persistence effects ───────────────────────────────────────────────────────
// Guard: don't write defaults to IDB before initSettingsFromDb() has loaded them.

effect(() => {
  const v = recentEmojis.value;
  if (_settingsLoaded) dbSettings.set("recentEmojis", v);
});
effect(() => {
  const v = sendTypingIndicators.value;
  if (_settingsLoaded) dbSettings.set("sendTypingIndicators", String(v));
});
effect(() => {
  const v = dmMessageSound.value;
  if (_settingsLoaded) dbSettings.set("dmMessageSound", String(v));
});
effect(() => {
  const v = pingSound.value;
  if (_settingsLoaded) dbSettings.set("pingSound", v);
});
effect(() => {
  const v = pingVolume.value;
  if (_settingsLoaded) dbSettings.set("pingVolume", String(v));
});
effect(() => {
  const v = customPingSound.value;
  if (_settingsLoaded) {
    if (v) {
      dbSettings.set("customPingSound", v);
    } else {
      dbSettings.del("customPingSound");
    }
  }
});
effect(() => {
  const v = blockedMessageDisplay.value;
  if (_settingsLoaded) dbSettings.set("blockedMessageDisplay", v);
});

effect(() => {
  if (_settingsLoaded) dbSettings.set("theme", appTheme.value);
  applyTheme(appTheme.value);
});

effect(() => {
  if (_settingsLoaded) dbSettings.set("font", appFont.value);
  applyFont(appFont.value);
});

effect(() => {
  if (_settingsLoaded) dbSettings.set("avatarShape", avatarShape.value);
  applyAvatarShape(avatarShape.value);
});

effect(() => {
  if (_settingsLoaded)
    dbSettings.set("bubbleRadius", String(bubbleRadius.value));
  applyBubbleRadius(bubbleRadius.value);
});

effect(() => {
  if (_settingsLoaded) dbSettings.set("accentColor", accentColor.value);
  applyAccentColor(accentColor.value);
});

effect(() => {
  if (_settingsLoaded)
    dbSettings.set("pingHighlightColor", pingHighlightColor.value);
  applyPingHighlightColor(pingHighlightColor.value);
});

effect(() => {
  if (_settingsLoaded)
    dbSettings.set("messageFontSize", String(messageFontSize.value));
  applyMessageFontSize(messageFontSize.value);
});

effect(() => {
  if (_settingsLoaded) dbSettings.set("compactMode", String(compactMode.value));
  applyCompactMode(compactMode.value);
});

effect(() => {
  if (_settingsLoaded)
    dbSettings.set("showTimestamps", String(showTimestamps.value));
  document.body.classList.toggle("hide-timestamps", !showTimestamps.value);
});

effect(() => {
  if (_settingsLoaded)
    dbSettings.set("showEdited", String(showEditedIndicator.value));
  document.body.classList.toggle(
    "hide-edited-indicator",
    !showEditedIndicator.value,
  );
});

effect(() => {
  if (_settingsLoaded)
    dbSettings.set("maxInlineImageWidth", String(maxInlineImageWidth.value));
  applyMaxImageWidth(maxInlineImageWidth.value);
});

effect(() => {
  if (_settingsLoaded)
    dbSettings.set("useSystemEmojis", String(useSystemEmojis.value));
});

effect(() => {
  if (_settingsLoaded)
    dbSettings.set("hideScrollbars", String(hideScrollbars.value));
  document.body.classList.toggle("hide-scrollbars", hideScrollbars.value);
});

effect(() => {
  if (_settingsLoaded)
    dbSettings.set("hideAvatarBorders", String(hideAvatarBorders.value));
  document.body.classList.toggle(
    "hide-avatar-borders",
    hideAvatarBorders.value,
  );
});

effect(() => {
  if (_settingsLoaded)
    dbSettings.set("reduceMotion", String(reduceMotion.value));
  document.body.classList.toggle("reduce-motion", reduceMotion.value);
});

effect(() => {
  const v = micThreshold.value;
  if (_settingsLoaded) dbSettings.set("micThreshold", String(v));
});
effect(() => {
  const v = voiceVideoRes.value;
  if (_settingsLoaded) dbSettings.set("vcRes", String(v));
});
effect(() => {
  const v = voiceVideoFps.value;
  if (_settingsLoaded) dbSettings.set("vcFps", String(v));
});
effect(() => {
  if (_settingsLoaded)
    dbSettings.set("serverNotifSettings", serverNotifSettings.value);
});
effect(() => {
  if (_settingsLoaded)
    dbSettings.set("channelNotifSettings", channelNotifSettings.value);
});
