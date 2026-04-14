import { signal, computed, effect } from "@preact/signals";
import type {
  Channel,
  ServerUser,
  Message,
  Server,
  ServerFolder,
  DMServer,
  Role,
  SelfAssignableRole,
  RoturAccount,
  SlashCommand,
  RoturGroup,
  RoturStatusUpdate,
  Thread,
  CustomEmoji,
} from "./types";
import { settings as dbSettings } from "./lib/db";
export { unreadState } from "./lib/state";

export const token = signal<string | null>(null);
export const DM_SERVER_URL = "dms.mistium.com";
export const SPECIAL_CHANNELS = new Set([
  "home",
  "relationships",
  "notes",
  "cmds",
  "new_message",
  "discovery",
  "roles",
]);

export function isSpecialChannel(name: string, url: string): boolean {
  return SPECIAL_CHANNELS.has(name) && url === DM_SERVER_URL;
}
export const serverUrl = signal(DM_SERVER_URL);
const priorityServer = signal<string | null>(null);
export const currentChannel = signal<Channel | null>(null);
export const currentThread = signal<Thread | null>(null);
export const servers = signal<Server[]>([]);
export const serverFolders = signal<ServerFolder[]>([]);
export const dmServers = signal<DMServer[]>([]);
export const friends = signal<string[]>([]);
export const friendRequests = signal<string[]>([]);
export const blockedUsers = signal<string[]>([]);
export const friendNicknames = signal<Record<string, string>>({});
export const replyTo = signal<Message | null>(null);
export const replyPing = signal<boolean>(true);

export const channelsByServer = signal<Record<string, Channel[]>>({});
export const threadsByServer = signal<Record<string, Record<string, Thread[]>>>(
  {},
);
export const threadMessagesByServer = signal<
  Record<string, Record<string, Message[]>>
>({});

export const newThreadCounts = signal<Record<string, Record<string, number>>>(
  {},
);

export { messagesByServer } from "./lib/state/messages";
import { messagesByServer } from "./lib/state/messages";

export const loadedChannelsByServer: Record<string, Set<string>> = {};
export const reachedOldestByServer: Record<string, Set<string>> = {};
export const usersByServer = signal<Record<string, Record<string, ServerUser>>>(
  {},
);
export const currentUserByServer = signal<Record<string, RoturAccount>>({});
export const rolesByServer = signal<Record<string, Record<string, Role>>>({});
const selfAssignableRolesByServer = signal<
  Record<string, SelfAssignableRole[]>
>({});
export const slashCommandsByServer = signal<Record<string, SlashCommand[]>>({});
export const readTimesByServer = signal<Record<string, Record<string, number>>>(
  {},
);
export const lastChannelByServer = signal<Record<string, string>>({});

import { unreadState } from "./lib/state";
const unreadByChannel = unreadState.unreads;
const unreadPings = unreadState.pings;
export const typingUsersByServer = signal<
  Record<string, Record<string, Map<string, number>>>
>({});

export function getServerPingCount(sUrl: string): number {
  return unreadState.getServerPing(sUrl);
}

export function getServerUnreadCount(sUrl: string): number {
  return unreadState.getServerUnread(sUrl);
}

export function getChannelPingCount(sUrl: string, channelName: string): number {
  return unreadState.getChannelPing(sUrl, channelName);
}

export function getChannelUnreadCount(
  sUrl: string,
  channelName: string,
): number {
  return unreadState.getChannelUnread(sUrl, channelName);
}

export function clearChannelPings(sUrl: string, channelName: string): void {
  unreadState.clearChannel(sUrl, channelName);
}

export function clearServerPings(sUrl: string): void {
  unreadState.clearServer(sUrl);
}

export function hasChannelUnreads(sUrl: string, channelName: string): boolean {
  return unreadState.hasUnreads(sUrl, channelName);
}

function isChannelUnreadByLastMessage(
  sUrl: string,
  channelName: string,
  lastMessageId?: string,
): boolean {
  return unreadState.isChannelUnreadByLastMessage(
    sUrl,
    channelName,
    lastMessageId,
  );
}

interface PingMessage {
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

interface WSConnection {
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

type AuthMode = "rotur" | "cracked" | "cracked-only";

export const serverAuthModeByServer = signal<Record<string, AuthMode>>({});

/**
 * Capabilities advertised by each server in their handshake payload.
 * Servers that don't send a capabilities array are stored as an empty array,
 * so callers can treat missing capabilities as "not supported".
 */
export const serverCapabilitiesByServer = signal<Record<string, string[]>>({});

interface ServerPermission {
  id: string;
  name: string;
  description: string;
  category: string;
}

export const serverPermissionsByServer = signal<
  Record<string, ServerPermission[]>
>({});

export const DEFAULT_PERMISSIONS: ServerPermission[] = [
  {
    id: "administrator",
    name: "Administrator",
    description: "Full permissions (bypasses all checks except owner)",
    category: "Server",
  },
  {
    id: "manage_server",
    name: "Manage Server",
    description: "Update server settings, emojis, and webhooks",
    category: "Server",
  },
  {
    id: "view_audit_log",
    name: "View Audit Log",
    description: "View server audit logs",
    category: "Server",
  },
  {
    id: "manage_roles",
    name: "Manage Roles",
    description: "Create, delete, and assign roles below own position",
    category: "Roles",
  },
  {
    id: "manage_channels",
    name: "Manage Channels",
    description: "Create, delete, and configure channels",
    category: "Channels",
  },
  {
    id: "manage_threads",
    name: "Manage Threads",
    description: "Lock, archive, and delete threads",
    category: "Channels",
  },
  {
    id: "manage_users",
    name: "Manage Users",
    description: "Ban, unban, timeout, and manage user nicknames",
    category: "Moderation",
  },
  {
    id: "kick_members",
    name: "Kick Members",
    description: "Kick users from the server",
    category: "Moderation",
  },
  {
    id: "manage_nicknames",
    name: "Manage Nicknames",
    description: "Change other users' nicknames",
    category: "Moderation",
  },
  {
    id: "change_nickname",
    name: "Change Nickname",
    description: "Change own nickname",
    category: "Moderation",
  },
  {
    id: "manage_messages",
    name: "Manage Messages",
    description: "Delete and pin any message across all channels",
    category: "Messages",
  },
  {
    id: "read_message_history",
    name: "Read History",
    description: "View previous messages in channel",
    category: "Messages",
  },
  {
    id: "send_messages",
    name: "Send Messages",
    description: "Send messages in text channels",
    category: "Messages",
  },
  {
    id: "send_tts",
    name: "Send TTS",
    description: "Send text-to-speech messages",
    category: "Messages",
  },
  {
    id: "embed_links",
    name: "Embed Links",
    description: "Embed links in messages",
    category: "Messages",
  },
  {
    id: "attach_files",
    name: "Attach Files",
    description: "Attach files to messages",
    category: "Messages",
  },
  {
    id: "add_reactions",
    name: "Add Reactions",
    description: "Add reactions to messages",
    category: "Messages",
  },
  {
    id: "external_emojis",
    name: "External Emojis",
    description: "Use external/custom emojis",
    category: "Messages",
  },
  {
    id: "mention_everyone",
    name: "Mention Everyone",
    description: "Mention the @everyone role",
    category: "Special",
  },
  {
    id: "use_slash_commands",
    name: "Use Slash Commands",
    description: "Use slash commands in chat",
    category: "Special",
  },
  {
    id: "create_invite",
    name: "Create Invite",
    description: "Create channel invites",
    category: "Invites",
  },
  {
    id: "manage_invites",
    name: "Manage Invites",
    description: "Manage and revoke invites",
    category: "Invites",
  },
  {
    id: "connect",
    name: "Connect",
    description: "Connect to voice channels",
    category: "Voice",
  },
  {
    id: "speak",
    name: "Speak",
    description: "Speak in voice channels",
    category: "Voice",
  },
  {
    id: "stream",
    name: "Stream",
    description: "Stream video in voice channels",
    category: "Voice",
  },
  {
    id: "mute_members",
    name: "Mute Members",
    description: "Mute users in voice channels",
    category: "Voice",
  },
  {
    id: "deafen_members",
    name: "Deafen Members",
    description: "Deafen users in voice channels",
    category: "Voice",
  },
  {
    id: "move_members",
    name: "Move Members",
    description: "Move users between voice channels",
    category: "Voice",
  },
  {
    id: "use_voice_activity",
    name: "Voice Activity",
    description: "Use voice activity detection",
    category: "Voice",
  },
  {
    id: "priority_speaker",
    name: "Priority Speaker",
    description: "Be heard over other speakers",
    category: "Voice",
  },
];

interface AttachmentConfig {
  enabled: boolean;
  max_size: number;
  allowed_types: string[];
  max_attachments_per_user: number;
  permanent_tiers: string[];
}

export const attachmentConfigByServer = signal<
  Record<string, AttachmentConfig>
>({});
const authRetries: Record<string, number> = {};
const authRetryTimeouts: Record<string, number> = {};
export const reconnectAttempts: Record<string, number> = {};
export const reconnectTimeouts: Record<string, number> = {};
const pendingReplyTimeouts: Record<string, number> = {};

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

export function clearServersAttempted(): void {
  serversAttempted.clear();
}

let originFS: any = null;
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

/**
 * Capabilities for the currently viewed server.
 * Returns an empty array if the server hasn't sent (or doesn't support) capabilities.
 */
export const serverCapabilities = computed(
  () => serverCapabilitiesByServer.value[serverUrl.value] ?? [],
);

/**
 * Check whether the currently viewed server advertises a capability.
 * If the server sent an empty capabilities array or no capabilities at all,
 * this returns false — UI features should be hidden/disabled accordingly.
 */
export function hasCapability(cap: string): boolean {
  return serverCapabilities.value.includes(cap);
}

function setChannelsForServer(url: string, ch: Channel[]) {
  channelsByServer.value = { ...channelsByServer.value, [url]: ch };
}

function setThreadsForServer(url: string, threads: Record<string, Thread[]>) {
  threadsByServer.value = { ...threadsByServer.value, [url]: threads };
}

export function addThreadToChannel(
  url: string,
  channelName: string,
  thread: Thread,
) {
  const current = threadsByServer.value[url] || {};
  const channelThreads = current[channelName] || [];
  threadsByServer.value = {
    ...threadsByServer.value,
    [url]: {
      ...current,
      [channelName]: [...channelThreads, thread],
    },
  };
  const currentCounts = newThreadCounts.value[url] || {};
  newThreadCounts.value = {
    ...newThreadCounts.value,
    [url]: {
      ...currentCounts,
      [channelName]: (currentCounts[channelName] || 0) + 1,
    },
  };
}

export function removeThreadFromChannel(
  url: string,
  channelName: string,
  threadId: string,
) {
  const current = threadsByServer.value[url] || {};
  const channelThreads = current[channelName] || [];
  threadsByServer.value = {
    ...threadsByServer.value,
    [url]: {
      ...current,
      [channelName]: channelThreads.filter((t) => t.id !== threadId),
    },
  };
}

export function updateThreadInChannel(
  url: string,
  channelName: string,
  threadId: string,
  update: Partial<Thread>,
) {
  const current = threadsByServer.value[url] || {};
  const channelThreads = current[channelName] || [];
  const idx = channelThreads.findIndex((t) => t.id === threadId);
  if (idx !== -1) {
    const updated = [...channelThreads];
    updated[idx] = { ...updated[idx], ...update };
    threadsByServer.value = {
      ...threadsByServer.value,
      [url]: {
        ...current,
        [channelName]: updated,
      },
    };
  }
}

export function clearNewThreadCount(url: string, channelName: string) {
  const currentCounts = newThreadCounts.value[url] || {};
  if (currentCounts[channelName]) {
    const { [channelName]: _, ...rest } = currentCounts;
    newThreadCounts.value = {
      ...newThreadCounts.value,
      [url]: rest,
    };
  }
}

function setThreadMessagesForServer(
  url: string,
  threadId: string,
  msgs: Message[],
) {
  threadMessagesByServer.value = {
    ...threadMessagesByServer.value,
    [url]: {
      ...threadMessagesByServer.value[url],
      [threadId]: msgs,
    },
  };
}

function setMessagesForServer(url: string, msgs: Record<string, Message[]>) {
  messagesByServer.value = { ...messagesByServer.value, [url]: msgs };
}

function setUsersForServer(url: string, usrs: Record<string, ServerUser>) {
  usersByServer.value = { ...usersByServer.value, [url]: usrs };
}

function setCurrentUserForServer(url: string, user: RoturAccount) {
  currentUserByServer.value = { ...currentUserByServer.value, [url]: user };
}

function addMessage(channelName: string, msg: Message) {
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

function updateMessage(
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

function addUser(url: string, username: string, user: ServerUser) {
  const current = usersByServer.value[url] || {};
  usersByServer.value = {
    ...usersByServer.value,
    [url]: { ...current, [username.toLowerCase()]: user },
  };
}

export const DEFAULT_SERVERS: Server[] = [];

export const recentEmojis = signal<string[]>([]);

export const customEmojisByServer = signal<
  Record<string, Record<string, CustomEmoji>>
>({});

function getCustomEmojiByName(
  name: string,
): { emoji: CustomEmoji; serverUrl: string } | null {
  const lowerName = name.toLowerCase();
  for (const [sUrl, emojis] of Object.entries(customEmojisByServer.value)) {
    for (const [, emoji] of Object.entries(emojis)) {
      if (emoji.name.toLowerCase() === lowerName) {
        return { emoji, serverUrl: sUrl };
      }
    }
  }
  return null;
}

function getCustomEmojiUrl(serverUrlStr: string, emoji: CustomEmoji): string {
  const baseUrl = serverUrlStr.startsWith("http")
    ? serverUrlStr
    : `https://${serverUrlStr}`;
  return `${baseUrl}/emojis/${emoji.fileName}`;
}

// ── Rotur social state ────────────────────────────────────────────────────────

/** Cached custom statuses keyed by username (fetched on demand). */
export const roturStatuses = signal<Record<string, RoturStatusUpdate>>({});

/** Groups the current user belongs to. */
export const roturMyGroups = signal<RoturGroup[]>([]);

/** Usernames that the current user follows on Rotur. */
export const roturFollowing = signal<Set<string>>(new Set());

export const sendTypingIndicators = signal<boolean>(true);

export const dmMessageSound = signal<boolean>(true);

export type UserStatus = "online" | "idle" | "dnd" | "offline";
interface MyStatus {
  status: UserStatus;
  text?: string;
}
export const myStatus = signal<MyStatus>({ status: "online" });

export const autoIdleOnUnfocus = signal<boolean>(true);

export const savedStatusText = signal<string | undefined>(undefined);

// ─── Offline / Push notification settings ─────────────────────────────────────
/**
 * True when the app shell has loaded but all network attempts (token
 * validation, WebSocket connections) have failed — device is offline.
 */
export const isOffline = signal<boolean>(false);

/**
 * Per-server offline push notification opt-in.
 * keyed by serverUrl → boolean (true = user has enabled Web Push for this server).
 * Persisted in IDB settings under "offlinePushSettings".
 */
export const offlinePushServers = signal<Record<string, boolean>>({});

/**
 * Stored Web Push subscriptions per server.
 * keyed by serverUrl → serialised PushSubscriptionJSON.
 * Kept in memory only; subscription objects are fetched from PushManager on demand.
 */
export const pushSubscriptionsByServer: Record<string, PushSubscriptionJSON> =
  {};

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

export const appTheme = signal<AppTheme>("dim");

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

export const notificationPromptDismissed = signal<boolean>(false);

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

function applyTheme(theme: AppTheme) {
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

function applyFont(font: AppFont) {
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

function applyAvatarShape(shape: AvatarShape) {
  const r = shape === "circle" ? "50%" : shape === "rounded" ? "22%" : "6px";
  document.documentElement.style.setProperty("--avatar-radius", r);
}

function applyBubbleRadius(px: number) {
  document.documentElement.style.setProperty("--chat-radius", `${px}px`);
  document.documentElement.style.setProperty("--border-radius", `${px}px`);
}

function applyAccentColor(hex: string) {
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

function applyPingHighlightColor(hex: string) {
  if (!hex) {
    // restore default mention colour
    document.documentElement.style.setProperty("--mention", "#9b87f5");
    return;
  }
  document.documentElement.style.setProperty("--mention", hex);
}

function applyMessageFontSize(px: number) {
  document.documentElement.style.setProperty("--message-font-size", `${px}px`);
}

function applyCompactMode(on: boolean) {
  document.body.classList.toggle("compact-mode", on);
}

function applyMaxImageWidth(px: number) {
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
  const bool = async (key: string, def: boolean) => {
    const v = await s.get<string | undefined>(key, undefined);
    return v === undefined ? def : v !== "false";
  };
  const num = async (key: string, def: number) => {
    const v = await s.get<string | undefined>(key, undefined);
    return v === undefined ? def : parseFloat(v);
  };
  const str = async <T extends string>(key: string, def: T): Promise<T> => {
    const v = await s.get<string | undefined>(key, undefined);
    return (v ?? def) as T;
  };

  recentEmojis.value = await s.get<string[]>("recentEmojis", []);
  sendTypingIndicators.value = await bool("sendTypingIndicators", true);
  dmMessageSound.value = await bool("dmMessageSound", true);
  pingSound.value = await str<PingSoundType>("pingSound", "default");
  pingVolume.value = await num("pingVolume", 0.3);
  customPingSound.value = await s.get<string | null>("customPingSound", null);
  blockedMessageDisplay.value = await str<BlockedMessageDisplay>(
    "blockedMessageDisplay",
    "collapse",
  );
  appTheme.value = await str<AppTheme>("theme", "dim");
  appFont.value = await str<AppFont>("font", "default");
  hideScrollbars.value = await bool("hideScrollbars", false);
  hideAvatarBorders.value = await bool("hideAvatarBorders", false);
  reduceMotion.value = await bool("reduceMotion", false);
  avatarShape.value = await str<AvatarShape>("avatarShape", "circle");
  bubbleRadius.value = await num("bubbleRadius", 10);
  accentColor.value = await s.get<string>("accentColor", "");
  pingHighlightColor.value = await s.get<string>("pingHighlightColor", "");
  messageFontSize.value = await num("messageFontSize", 15);
  compactMode.value = await bool("compactMode", false);
  showTimestamps.value = await bool("showTimestamps", true);
  notificationPromptDismissed.value = await bool(
    "notificationPromptDismissed",
    false,
  );
  showEditedIndicator.value = await bool("showEdited", true);
  maxInlineImageWidth.value = await num("maxInlineImageWidth", 400);
  useSystemEmojis.value = await bool("useSystemEmojis", false);
  micThreshold.value = await num("micThreshold", 30);
  voiceVideoRes.value = await num("vcRes", 720);
  voiceVideoFps.value = await num("vcFps", 30);
  serverNotifSettings.value = await s.get<Record<string, NotificationLevel>>(
    "serverNotifSettings",
    {},
  );
  channelNotifSettings.value = await s.get<Record<string, NotificationLevel>>(
    "channelNotifSettings",
    {},
  );
  offlinePushServers.value = await s.get<Record<string, boolean>>(
    "offlinePushSettings",
    {},
  );
  autoIdleOnUnfocus.value = await bool("autoIdleOnUnfocus", true);
  savedStatusText.value = await s.get<string | undefined>(
    "savedStatusText",
    undefined,
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
  const v = notificationPromptDismissed.value;
  if (_settingsLoaded) dbSettings.set("notificationPromptDismissed", String(v));
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
effect(() => {
  if (_settingsLoaded)
    dbSettings.set("offlinePushSettings", offlinePushServers.value);
});
effect(() => {
  const v = autoIdleOnUnfocus.value;
  if (_settingsLoaded) dbSettings.set("autoIdleOnUnfocus", String(v));
});
effect(() => {
  const v = savedStatusText.value;
  if (_settingsLoaded) {
    if (v === undefined) {
      dbSettings.del("savedStatusText");
    } else {
      dbSettings.set("savedStatusText", v);
    }
  }
});
