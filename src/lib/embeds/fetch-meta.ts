const META_CACHE = new Map<
  string,
  { data: LinkMetadata | null; timestamp: number }
>();
const CACHE_TTL = 5 * 60 * 1000;
const MAX_META_CACHE_SIZE = 100;

export interface LinkMetadata {
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  url: string;
}

function parseMetaTags(html: string, originalUrl: string): LinkMetadata | null {
  const getMeta = (names: string[], property = false): string | undefined => {
    for (const name of names) {
      const attr = property ? "property" : "name";
      const regex = new RegExp(
        `<meta[^>]+${attr}=["']${escapeRegex(name)}["'][^>]*content=["']([^"']*)["']`,
        "i",
      );
      const match = html.match(regex);
      if (match?.[1]) return decodeHtmlEntities(match[1]);

      const reverseRegex = new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${escapeRegex(name)}["']`,
        "i",
      );
      const reverseMatch = html.match(reverseRegex);
      if (reverseMatch?.[1]) return decodeHtmlEntities(reverseMatch[1]);
    }
    return undefined;
  };

  const title =
    getMeta(["og:title", "twitter:title"], true) ||
    getMeta(["title"]) ||
    extractTitle(html);

  if (!title) return null;

  const description =
    getMeta(["og:description", "twitter:description"], true) ||
    getMeta(["description"]);

  let image =
    getMeta(["og:image", "twitter:image"], true) || getMeta(["image"]);
  if (image && !image.startsWith("data:") && !image.startsWith("http")) {
    try {
      const baseUrl = new URL(originalUrl);
      image = new URL(image, baseUrl.origin).href;
    } catch {
      image = undefined;
    }
  }

  const siteName =
    getMeta(["og:site_name"], true) ||
    getMeta(["application-name"]) ||
    extractSiteName(originalUrl);

  let favicon =
    getMeta(["og:image", "apple-touch-icon"]) || extractFavicon(html);

  if (favicon && !favicon.startsWith("data:") && !favicon.startsWith("http")) {
    try {
      const baseUrl = new URL(originalUrl);
      favicon = new URL(favicon, baseUrl.origin).href;
    } catch {
      favicon = undefined;
    }
  }

  return {
    title,
    description,
    image,
    siteName,
    favicon,
    url: originalUrl,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : undefined;
}

function extractFavicon(html: string): string | undefined {
  const patterns = [
    /<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function extractSiteName(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function fetchLinkMetadata(
  url: string,
): Promise<LinkMetadata | null> {
  const cached = META_CACHE.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  if (META_CACHE.size >= MAX_META_CACHE_SIZE) {
    const now = Date.now();
    const entries = [...META_CACHE.entries()];
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toDelete = entries.slice(
      0,
      META_CACHE.size - MAX_META_CACHE_SIZE + 1,
    );
    toDelete.forEach(([k]) => META_CACHE.delete(k));
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const proxyUrl = `https://proxy.mistium.com?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      META_CACHE.set(url, { data: null, timestamp: Date.now() });
      return null;
    }

    const html = await res.text();
    const metadata = parseMetaTags(html, url);

    META_CACHE.set(url, { data: metadata, timestamp: Date.now() });
    return metadata;
  } catch (err) {
    console.debug("Failed to fetch metadata for", url, err);
    META_CACHE.set(url, { data: null, timestamp: Date.now() });
    return null;
  }
}

function clearMetadataCache(): void {
  META_CACHE.clear();
}
