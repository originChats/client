export const TRUSTED_DOMAINS = [
  "avatars.rotur.dev",
  "photos.rotur.dev",
  "roturcdn.milosantos.com",
  "img.youtube.com",
  "media.tenor.com",
  "media.discordapp.net",
  "cdn.discordapp.com",
  "i.ytimg.com",
  "avatars.githubusercontent.com",
] as const;

export const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "avif",
] as const;

export const VIDEO_EXTENSIONS = [
  "mp4",
  "webm",
  "mov",
  "avi",
  "mkv",
  "gifv",
] as const;

const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "flac", "aac"] as const;

export function proxyImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (TRUSTED_DOMAINS.some((d) => parsed.hostname.endsWith(d))) {
      return url;
    }
    return `https://images.rotur.dev/${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export function hasExtension(
  url: string,
  extensions: readonly string[],
): boolean {
  const lower = url.toLowerCase().split(/[?#]/)[0];
  return extensions.some((ext) => lower.endsWith(`.${ext}`));
}

function isImageUrl(url: string): boolean {
  return hasExtension(url, IMAGE_EXTENSIONS);
}

function isVideoUrl(url: string): boolean {
  return hasExtension(url, VIDEO_EXTENSIONS);
}

function isAudioUrl(url: string): boolean {
  return hasExtension(url, AUDIO_EXTENSIONS);
}

function getMediaType(url: string): "image" | "video" | "audio" | "unknown" {
  if (isImageUrl(url)) return "image";
  if (isVideoUrl(url)) return "video";
  if (isAudioUrl(url)) return "audio";
  return "unknown";
}
