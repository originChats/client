import { signal } from "@preact/signals";

export const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
];
export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "ogg", "avi", "mkv"];

export const YOUTUBE_REGEX =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/;

export function hasExtension(url: string, extensions: string[]): boolean {
  const urlLower = url.toLowerCase();
  return extensions.some(
    (ext) =>
      urlLower.endsWith(`.${ext}`) ||
      urlLower.includes(`.${ext}?`) ||
      urlLower.includes(`.${ext}#`),
  );
}

export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export const TRUSTED_DOMAINS = [
  "avatars.rotur.dev",
  "photos.rotur.dev",
  "roturcdn.milosantos.com",
  "img.youtube.com",
  "media.tenor.com",
  "media.discordapp.net",
  "cdn.discordapp.com",
];

export function proxyImageUrl(url: string): string {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const urlObj = new URL(url);
    if (TRUSTED_DOMAINS.includes(urlObj.hostname)) return url;
  } catch {
    console.debug("URL parsing failed for proxy:", url);
  }
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
}

export const avatarBust = signal<Record<string, number>>({});

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

export function getUserAvatar(
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

export function formatJoinDate(timestamp: number | string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
