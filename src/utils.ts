import { signal } from "@preact/signals";
import {
  TRUSTED_DOMAINS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  hasExtension as hasExtensionUtil,
  proxyImageUrl as proxyImageUrlUtil,
} from "./lib/media-utils";

const YOUTUBE_REGEX =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/;

function hasExtension(url: string, extensions: readonly string[]): boolean {
  return hasExtensionUtil(url, extensions);
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function proxyImageUrl(url: string): string {
  return proxyImageUrlUtil(url);
}

const avatarBust = signal<Record<string, number>>({});

export function reloadAvatar(username: string): void {
  avatarBust.value = {
    ...avatarBust.value,
    [username]: (avatarBust.value[username] ?? 0) + 1,
  };
}

export const serverIconBust = signal<Record<string, number>>({});

export function reloadServerIcon(url: string): void {
  serverIconBust.value = {
    ...serverIconBust.value,
    [url]: (serverIconBust.value[url] ?? 0) + 1,
  };
}

export function isCrackedAccount(username: string): boolean {
  return username.startsWith("USR:");
}

export function avatarUrl(username: string): string {
  const bust = avatarBust.value[username];
  return `https://avatars.rotur.dev/${username}${bust ? `?v=${bust}` : ""}`;
}

function getUserAvatar(
  user: { username: string; pfp?: string; cracked?: boolean } | string,
): string | undefined {
  const username = typeof user === "string" ? user : user.username;
  const pfp = typeof user === "string" ? undefined : user.pfp;
  const cracked = typeof user === "string" ? false : user.cracked;

  if (pfp) return pfp;

  const isCracked = cracked || isCrackedAccount(username);
  if (isCracked) return undefined;

  return avatarUrl(username);
}

