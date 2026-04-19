import twemoji from "@twemoji/api";
import { useSystemEmojis } from "../state";

const TWEMOJI_CDN_BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg";

const dataUriCache = new Map<string, string>();
const inflightRequests = new Map<string, Promise<void>>();
const MAX_EMOJI_CACHE_SIZE = 200;

const MAX_CONCURRENT_FETCHES = 6;
let activeFetches = 0;
const fetchQueue: Array<{ hexcode: string; resolve: () => void }> = [];

function processQueue(): void {
  while (activeFetches < MAX_CONCURRENT_FETCHES && fetchQueue.length > 0) {
    const item = fetchQueue.shift();
    if (item) {
      activeFetches++;
      fetch(`${TWEMOJI_CDN_BASE}/${item.hexcode}.svg`)
        .then((r) => r.text())
        .then((svg) => {
          const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
          dataUriCache.set(item.hexcode, dataUri);
          inflightRequests.delete(item.hexcode);
          item.resolve();
        })
        .catch(() => {
          inflightRequests.delete(item.hexcode);
          item.resolve();
        })
        .finally(() => {
          activeFetches--;
          processQueue();
        });
    }
  }
}

function ensureCached(hexcode: string): void {
  if (dataUriCache.has(hexcode) || inflightRequests.has(hexcode)) return;

  if (dataUriCache.size >= MAX_EMOJI_CACHE_SIZE) {
    const keysToDelete = [...dataUriCache.keys()].slice(
      0,
      dataUriCache.size - MAX_EMOJI_CACHE_SIZE + 1
    );
    keysToDelete.forEach((k) => dataUriCache.delete(k));
  }

  const promise = new Promise<void>((resolve) => {
    fetchQueue.push({ hexcode, resolve: () => resolve() });
    processQueue();
  });

  inflightRequests.set(hexcode, promise);
}

let pendingParse: {
  container: HTMLElement;
  timeout: ReturnType<typeof setTimeout> | null;
} | null = null;

function flushPendingParse() {
  if (pendingParse) {
    const { container } = pendingParse;
    pendingParse = null;
    twemoji.parse(container, {
      className: "emoji",
      folder: "svg",
      ext: ".svg",
      callback: (icon: string) => {
        ensureCached(icon);
        return dataUriCache.get(icon) || `${TWEMOJI_CDN_BASE}/${icon}.svg`;
      },
    });
  }
}

export function parseEmojisInContainer(container: HTMLElement): void {
  if (useSystemEmojis.value) return;

  if (pendingParse && pendingParse.container === container) {
    return;
  }

  if (pendingParse) {
    if (pendingParse.timeout) {
      clearTimeout(pendingParse.timeout);
    }
    pendingParse.container = container;
  } else {
    pendingParse = { container, timeout: null };
  }

  pendingParse.timeout = setTimeout(() => {
    flushPendingParse();
  }, 16);
}

export function emojiImgUrl(value: string, isChar = false): string | null {
  if (useSystemEmojis.value) return null;

  let hexcode: string;
  if (isChar) {
    hexcode = twemoji.convert.toCodePoint(value);
    if (!hexcode.includes("200d")) {
      hexcode = hexcode.replace(/-?fe0f/gi, "");
    }
  } else {
    hexcode = value.toLowerCase();
  }

  return `${TWEMOJI_CDN_BASE}/${hexcode}.svg`;
}

const COMMON_EMOJI_HEXCODES = [
  "1f600",
  "1f601",
  "1f602",
  "1f603",
  "1f604",
  "1f605",
  "1f606",
  "1f609",
  "1f60a",
  "1f60b",
  "1f60c",
  "1f60d",
  "1f60e",
  "1f60f",
  "1f610",
  "1f611",
  "1f612",
  "1f613",
  "1f614",
  "1f615",
  "1f616",
  "1f618",
  "1f619",
  "1f61a",
  "1f61b",
  "1f61c",
  "1f61d",
  "1f61e",
  "1f620",
  "1f621",
  "1f622",
  "1f623",
  "1f624",
  "1f625",
  "1f626",
  "1f627",
  "1f628",
  "1f629",
  "1f62a",
  "1f62b",
  "1f62c",
  "1f62d",
  "1f630",
  "1f631",
  "1f632",
  "1f633",
  "1f634",
  "1f635",
  "1f636",
  "1f638",
  "1f639",
  "1f63a",
  "1f63b",
  "1f63c",
  "1f63d",
  "1f63e",
  "2764",
  "1f494",
  "1f495",
  "1f496",
  "1f497",
  "1f498",
  "1f499",
  "1f49a",
  "1f49b",
  "1f49c",
  "1f49d",
  "1f49e",
  "1f49f",
  "1f44d",
  "1f44e",
  "1f44f",
  "1f450",
  "1f44a",
  "1f44b",
  "1f44c",
  "1f600",
  "1f602",
  "1f60d",
  "1f618",
  "1f621",
  "1f629",
  "1f633",
  "1f635",
  "1f636",
  "1f638",
  "1f63a",
  "1f44d",
  "1f44e",
  "2764",
];

let prewarmStarted = false;

export function prewarmCommonEmojis(): void {
  if (prewarmStarted || useSystemEmojis.value) return;
  prewarmStarted = true;

  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(() => {
      for (const hexcode of COMMON_EMOJI_HEXCODES) {
        ensureCached(hexcode);
      }
    });
  } else {
    setTimeout(() => {
      for (const hexcode of COMMON_EMOJI_HEXCODES) {
        ensureCached(hexcode);
      }
    }, 1000);
  }
}

const ORIGINCHATS_PREFIX = "originChats://";

export function isCustomEmoji(emoji: string): boolean {
  return emoji.startsWith(ORIGINCHATS_PREFIX);
}
export function getCustomEmojiUrl(emoji: string): string | null {
  if (!isCustomEmoji(emoji)) return null;
  const urlPart = emoji.slice(ORIGINCHATS_PREFIX.length);
  return `https://${urlPart}`;
}

export function parseEmojisInText(text: string): string {
  if (useSystemEmojis.value || !text) {
    return text;
  }
  return twemoji.parse(text, {
    className: "emoji",
    folder: "svg",
    ext: ".svg",
    callback: (icon: string) => {
      ensureCached(icon);
      return dataUriCache.get(icon) || `${TWEMOJI_CDN_BASE}/${icon}.svg`;
    },
  }) as string;
}
