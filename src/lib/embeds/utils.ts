import { fetchLinkMetadata } from "./fetch-meta";
import {
  TRUSTED_DOMAINS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  hasExtension as hasExtensionUtil,
  proxyImageUrl as proxyImageUrlUtil,
} from "../media-utils";

const YOUTUBE_REGEX =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/;

function hasExtension(url: string, extensions: readonly string[]): boolean {
  return hasExtensionUtil(url, extensions);
}

function proxyImageUrl(url: string): string {
  return proxyImageUrlUtil(url);
}

export { proxyImageUrl };

export async function detectEmbedType(url: string) {
  const ytMatch = url.match(YOUTUBE_REGEX);
  if (ytMatch) return { type: "youtube", url, videoId: ytMatch[1] };

  const giftMatch = url.match(/rotur\.dev\/gift\?code=([A-Z0-9-]+)/i);
  if (giftMatch) {
    return { type: "gift", url, giftCode: giftMatch[1] };
  }

  const commitMatch = url.match(
    /github\.com\/([^/]+)\/([^/]+)\/commit\/([a-f0-9]{7,40})/i,
  );
  if (commitMatch) {
    return {
      type: "github_commit",
      url,
      owner: commitMatch[1],
      repo: commitMatch[2],
      sha: commitMatch[3],
    };
  }

  const prMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  if (prMatch) {
    return {
      type: "github_pr",
      url,
      owner: prMatch[1],
      repo: prMatch[2],
      prNumber: parseInt(prMatch[3], 10),
    };
  }

  if (/tenor\.com\/view\/[\w-]+-\d+(?:\?.*)?$/i.test(url)) {
    const id = url.match(/tenor\.com\/view\/[\w-]+-(\d+)/i)?.[1];
    return { type: "tenor", url, tenorId: id };
  }

  if (/github\.com\/([a-zA-Z0-9-]+(?:\/[a-zA-Z0-9._-]+)?)(?:\/)?$/i.test(url)) {
    const path = url.match(
      /github\.com\/([a-zA-Z0-9-]+(?:\/[a-zA-Z0-9._-]+)?)/i,
    )?.[1];
    const type = path?.includes("/") ? "github_repo" : "github_user";
    return { type, url, path };
  }

  const wikiMatch = url.match(
    /(?:^|\/\/)([a-z]{2,})\.wikipedia\.org\/wiki\/([^#?]+)/i,
  );
  if (wikiMatch) {
    return {
      type: "wikipedia",
      url,
      wikiLang: wikiMatch[1].toLowerCase(),
      articleTitle: decodeURIComponent(wikiMatch[2].replace(/_/g, " ")),
    };
  }

  if (
    /open\.spotify\.com\/(track|album|playlist|episode|artist)\/[A-Za-z0-9]+/i.test(
      url,
    )
  ) {
    return { type: "spotify", url, spotifyUrl: url };
  }

  const steamMatch = url.match(/store\.steampowered\.com\/app\/(\d+)/i);
  if (steamMatch) {
    return { type: "steam", url, steamAppId: steamMatch[1] };
  }

  const mistWarpMatch = url.match(/warp\.mistium\.com(?:\/(\d+)|[^#]*#(\d+))/i);
  if (mistWarpMatch) {
    return {
      type: "mistwarp",
      url,
      mistWarpId: mistWarpMatch[1] ?? mistWarpMatch[2],
    };
  }

  const originChatsMatch = url.match(
    /originchats\.mistium\.com\/?\?(?:.*&)?server=([^&]+)/i,
  );
  if (originChatsMatch) {
    return {
      type: "originchats_server",
      url,
      originChatsHost: originChatsMatch[1],
    };
  }

  if (hasExtension(url, VIDEO_EXTENSIONS) || url.startsWith("data:video/")) {
    return { type: "video", url };
  }
  if (hasExtension(url, IMAGE_EXTENSIONS) || url.startsWith("data:image/")) {
    return { type: "image", url };
  }

  try {
    const urlObj = new URL(url);
    // Skip HEAD request for invalid/unsupported protocols
    if (
      !["http:", "https:"].includes(urlObj.protocol) ||
      urlObj.hostname === "localhost" ||
      urlObj.hostname === "127.0.0.1"
    ) {
      return { type: "unknown", url };
    }
  } catch {
    // Invalid URL structure, return unknown
    return { type: "unknown", url };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "HEAD",
      mode: "cors",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const ct = res.headers.get("Content-Type") || "";
      if (ct.startsWith("video/")) return { type: "video", url };
      if (ct.startsWith("image/")) return { type: "image", url };
    }
  } catch (err) {
    console.debug("HEAD request failed for", url, err);
  }

  const metadata = await fetchLinkMetadata(url);
  if (metadata) {
    return {
      type: "link_preview",
      url,
      title: metadata.title,
      description: metadata.description,
      image: metadata.image,
      siteName: metadata.siteName,
      favicon: metadata.favicon,
    };
  }

  return { type: "unknown", url };
}

export function formatNumber(num: number): string {
  if (num == null) return "?";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
  return num.toString();
}

export function formatDate(date: Date): string {
  if (isNaN(date.getTime())) {
    return "Unknown";
  }
  const diff = Date.now() - date.getTime();
  if (isNaN(diff) || diff < 0) return "Just now";
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

export function isTenorOnlyMessage(
  embedLinks: string[],
  content: string,
): boolean {
  return (
    embedLinks.length === 1 &&
    /tenor\.com\/view\/[\w-]+-\d+(?:\?.*)?$/i.test(embedLinks[0]) &&
    content.trim() === embedLinks[0]
  );
}
