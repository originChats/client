import { signal } from "@preact/signals";
import type { Message } from "../types";
import type { ContextMenuItem } from "../components/ContextMenu";
import type { Webhook } from "../types";

export type BannerKind = "error" | "warning" | "info";

export interface Banner {
  id: string;
  kind: BannerKind;
  message: string;
  /** If set, the banner is only shown when the user is viewing this server URL. Omit for global banners. */
  serverUrl?: string;
  /** If set, the banner shows a button that triggers this callback */
  action?: { label: string; fn: () => void };
  /** Auto-dismiss after this many ms. Omit for persistent banners. */
  autoDismissMs?: number;
}

/** Live queue of banners to display. Push to show, filter-out to dismiss. */
export const banners = signal<Banner[]>([]);

let _bannerIdCounter = 0;

export function showBanner(opts: Omit<Banner, "id">): string {
  const id = `banner-${++_bannerIdCounter}`;
  banners.value = [...banners.value, { ...opts, id }];
  if (opts.autoDismissMs && opts.autoDismissMs > 0) {
    setTimeout(() => dismissBanner(id), opts.autoDismissMs);
  }
  return id;
}

/** Show an error banner with optional retry action */
export function showError(
  message: string,
  opts?: {
    severity?: "error" | "warning";
    serverUrl?: string;
    actionLabel?: string;
    onAction?: () => void;
    autoDismissMs?: number;
  },
): string {
  return showBanner({
    kind: opts?.severity || "error",
    message,
    serverUrl: opts?.serverUrl,
    action:
      opts?.onAction && opts?.actionLabel
        ? { label: opts.actionLabel, fn: opts.onAction }
        : undefined,
    autoDismissMs: opts?.autoDismissMs,
  });
}

/** Show an info/warning banner */
export function showInfo(
  message: string,
  opts?: {
    serverUrl?: string;
    autoDismissMs?: number;
  },
): string {
  return showBanner({
    kind: "info",
    message,
    serverUrl: opts?.serverUrl,
    autoDismissMs: opts?.autoDismissMs,
  });
}

/** Log error and show user-friendly error banner */
export function handleError(
  error: unknown,
  userMessage: string,
  opts?: {
    serverUrl?: string;
    actionLabel?: string;
    onAction?: () => void;
    logToConsole?: boolean;
    autoDismissMs?: number;
  },
): string {
  if (opts?.logToConsole !== false) {
    console.error(`[Error] ${userMessage}:`, error);
  }
  return showError(userMessage, opts);
}

export function dismissBanner(id: string): void {
  banners.value = banners.value.filter((b) => b.id !== id);
}

/** Replace an existing banner (same id) or add as new if not found. */
export function upsertBanner(id: string, opts: Omit<Banner, "id">): void {
  const existing = banners.value.find((b) => b.id === id);
  if (existing) {
    banners.value = banners.value.map((b) =>
      b.id === id ? { ...opts, id } : b,
    );
  } else {
    banners.value = [...banners.value, { ...opts, id }];
  }
  if (opts.autoDismissMs && opts.autoDismissMs > 0) {
    setTimeout(() => dismissBanner(id), opts.autoDismissMs);
  }
}

export const renderGuildSidebarSignal = signal(0);
export const renderChannelsSignal = signal(0);
export const renderMessagesSignal = signal(0);
export const renderMembersSignal = signal(0);
export const renderVoiceSignal = signal(0);
export const showSettingsModal = signal(false);
export const showAccountModal = signal<string | null>(null);
export const showDiscoveryModal = signal(false);
export const showServerSettingsModal = signal(false);
export const currentDMTab = signal<
  "friends" | "requests" | "blocked" | "groups"
>("friends");

export const showVoiceCallView = signal(false);

export const rightPanelView = signal<
  "members" | "pinned" | "search" | "inbox" | "threads" | null
>("members");

export const showThreadPanel = signal(false);
export const pinnedMessages = signal<Message[]>([]);
export const searchResults = signal<Message[]>([]);
export const searchLoading = signal(false);
export const pinnedLoading = signal(false);

export const userPopout = signal<{
  username: string;
  x: number;
  y: number;
  anchorRight?: boolean;
  anchorEl?: HTMLElement;
} | null>(null);

/** Mobile navigation state */
export const mobileSidebarOpen = signal(false);
export const mobilePanelOpen = signal(false);

export function closeMobileNav() {
  mobileSidebarOpen.value = false;
  mobilePanelOpen.value = false;
}

/** Global context menu — set this to show a menu, null to close. */
export interface GlobalContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}
export const globalContextMenu = signal<GlobalContextMenuState | null>(null);

export function showContextMenu(e: MouseEvent, items: ContextMenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  globalContextMenu.value = { x: e.clientX, y: e.clientY, items };
}

export function closeContextMenu() {
  globalContextMenu.value = null;
}

export const showNotificationPrompt = signal(false);

export const imageViewerUrl = signal<string>("");

export const channelListWidth = signal(340);

export const showChannelEditModal = signal<string | null>(null);
export const channelEditFromSettings = signal(false);
export const bannedUsersByServer = signal<Record<string, string[]>>({});
export const webhooksByServer = signal<Record<string, Webhook[]>>({});
export const webhooksLoading = signal<Record<string, boolean>>({});
