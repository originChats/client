import { customEmojisByServer, servers, serverUrl } from "../state";

export interface EmojiEntry {
  label: string;
  hexcode: string;
  emoji: string;
  shortcodes?: string[];
  tags?: string[];
  order?: number;
  group?: number;
}

export interface CustomEmojiItem {
  id: string;
  name: string;
  fileName: string;
  serverUrl: string;
  serverName: string;
}

interface SearchIndexEntry {
  emoji: EmojiEntry;
  matchPriority: number;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  entries: Set<EmojiEntry>;
}

class EmojiDataCache {
  private categories: Map<string, EmojiEntry[]> | null = null;
  private allEmojis: EmojiEntry[] | null = null;
  private searchTrie: TrieNode | null = null;
  private customEmojiCache: Map<string, CustomEmojiItem[]> | null = null;
  private customEmojiFlatCache: CustomEmojiItem[] | null = null;
  private shortcodeMap: Map<string, string> | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private initStarted = false;

  CATEGORY_ORDER = [
    "Faces",
    "Hearts",
    "Animals",
    "Food",
    "Sports",
    "Hands",
    "Other",
  ];

  CATEGORY_RULES: Record<string, (label: string) => boolean> = {
    Faces: (l) =>
      l.includes("smile") ||
      l.includes("grin") ||
      l.includes("laugh") ||
      l.includes("cry") ||
      l.includes("tear") ||
      l.includes("sad") ||
      l.includes("angry") ||
      l.includes("face"),
    Hearts: (l) =>
      l.includes("heart") || l.includes("love") || l.includes("kiss"),
    Animals: (l) =>
      l.includes("cat") ||
      l.includes("dog") ||
      l.includes("bear") ||
      l.includes("animal") ||
      l.includes("monkey") ||
      l.includes("bird"),
    Food: (l) =>
      l.includes("food") ||
      l.includes("fruit") ||
      l.includes("drink") ||
      l.includes("pizza") ||
      l.includes("burger") ||
      l.includes("cake"),
    Sports: (l) =>
      l.includes("ball") ||
      l.includes("sport") ||
      l.includes("game") ||
      l.includes("soccer") ||
      l.includes("basketball"),
    Hands: (l) =>
      l.includes("hand") || l.includes("finger") || l.includes("wave"),
  };

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  startBackgroundInit(): void {
    if (this.initStarted) return;
    this.initStarted = true;

    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(() => {
        this.initialize();
      });
    } else {
      setTimeout(() => {
        this.initialize();
      }, 1000);
    }
  }

  private async doInitialize(): Promise<void> {
    if (!this.allEmojis) {
      await this.loadEmojiData();
    }

    this.buildCategories();
    this.buildSearchIndex();

    this.initialized = true;
  }

  async loadEmojiData(): Promise<void> {
    if (this.allEmojis) return;

    try {
      const response = await fetch("/shortcodes.json");
      if (!response.ok) return;
      const data = await response.json();
      this.allEmojis = data.filter((e: EmojiEntry) => e.emoji && e.label);
      this.shortcodeMap = new Map();

      for (const item of data) {
        this.shortcodeMap.set(item.emoji, item.emoji);

        if (item.label) {
          this.shortcodeMap.set(`:${item.label}:`, item.emoji);
          const underscoreKey = `:${item.label.replace(/ /g, "_")}:`;
          if (underscoreKey !== `:${item.label}:`) {
            this.shortcodeMap.set(underscoreKey, item.emoji);
          }
        }

        if (item.shortcodes) {
          for (const shortcode of item.shortcodes) {
            this.shortcodeMap.set(shortcode, item.emoji);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load emoji data:", error);
      this.allEmojis = [];
      this.shortcodeMap = new Map();
    }
  }

  private buildCategories(): void {
    if (!this.allEmojis) return;

    this.categories = new Map();

    for (const entry of this.allEmojis) {
      const label = entry.label.toLowerCase();
      let category = "Other";

      for (const [cat, check] of Object.entries(this.CATEGORY_RULES)) {
        if (check(label)) {
          category = cat;
          break;
        }
      }

      if (!this.categories.has(category)) {
        this.categories.set(category, []);
      }
      this.categories.get(category)!.push(entry);
    }
  }

  private buildSearchIndex(): void {
    if (!this.allEmojis) return;

    this.searchTrie = { children: new Map(), entries: new Set() };

    for (const entry of this.allEmojis) {
      this.indexEntry(entry);
    }
  }

  private indexEntry(entry: EmojiEntry): void {
    if (!this.searchTrie) return;

    const terms = new Set<string>();

    const labelWords = entry.label.toLowerCase().split(/[\s_]+/);
    for (const word of labelWords) {
      if (word) terms.add(word);
    }

    if (entry.tags) {
      for (const tag of entry.tags) {
        const tagWords = tag.toLowerCase().split(/\s+/);
        for (const word of tagWords) {
          if (word) terms.add(word);
        }
      }
    }

    if (entry.shortcodes) {
      for (const sc of entry.shortcodes) {
        const clean = sc.replace(/:/g, "").toLowerCase();
        const words = clean.split(/[\s_]+/);
        for (const word of words) {
          if (word) terms.add(word);
        }
      }
    }

    for (const term of terms) {
      this.insertIntoTrie(term, entry);
    }
  }

  private insertIntoTrie(term: string, entry: EmojiEntry): void {
    if (!this.searchTrie) return;

    let node = this.searchTrie;
    for (const char of term) {
      if (!node.children.has(char)) {
        node.children.set(char, { children: new Map(), entries: new Set() });
      }
      node = node.children.get(char)!;
    }
    node.entries.add(entry);
  }

  private searchTrieForPrefix(prefix: string): Set<EmojiEntry> {
    if (!this.searchTrie) return new Set();

    let node = this.searchTrie;
    for (const char of prefix) {
      if (!node.children.has(char)) {
        return new Set();
      }
      node = node.children.get(char)!;
    }

    return this.collectAllEntries(node);
  }

  private collectAllEntries(node: TrieNode): Set<EmojiEntry> {
    const entries = new Set<EmojiEntry>(node.entries);

    for (const child of node.children.values()) {
      const childEntries = this.collectAllEntries(child);
      for (const entry of childEntries) {
        entries.add(entry);
      }
    }

    return entries;
  }

  search(query: string, limit = 50): EmojiEntry[] {
    if (!this.searchTrie || !this.allEmojis) return [];

    const q = query.toLowerCase().trim();
    if (!q) return this.allEmojis.slice(0, limit);

    const exact: EmojiEntry[] = [];
    const prefix: EmojiEntry[] = [];
    const contains: EmojiEntry[] = [];

    const words = q.split(/\s+/).filter((w) => w);

    const matchingEntries = new Map<EmojiEntry, number>();

    for (const word of words) {
      const wordMatches = this.searchTrieForPrefix(word);
      for (const entry of wordMatches) {
        const current = matchingEntries.get(entry) || 0;
        matchingEntries.set(entry, current + 1);
      }
    }

    const labelCache = new Map<EmojiEntry, string>();
    for (const [entry] of matchingEntries) {
      const label = entry.label.toLowerCase().replace(/ /g, "_");
      labelCache.set(entry, label);
    }

    for (const [entry, matchCount] of matchingEntries) {
      if (matchCount < words.length) continue;

      const label = labelCache.get(entry)!;

      if (label === q) {
        exact.push(entry);
      } else if (
        label.startsWith(q) ||
        label.startsWith(q.replace(/ /g, "_"))
      ) {
        prefix.push(entry);
      } else {
        contains.push(entry);
      }
    }

    const sortByName = (a: EmojiEntry, b: EmojiEntry) => {
      const aOrder = a.order ?? 999999;
      const bOrder = b.order ?? 999999;
      return aOrder - bOrder;
    };

    return [
      ...exact.sort(sortByName),
      ...prefix.sort(sortByName),
      ...contains.sort(sortByName),
    ].slice(0, limit);
  }

  searchCustomEmojis(query: string, limit = 50): CustomEmojiItem[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getCustomEmojisFlat();

    const allCustom = this.getCustomEmojisFlat();
    const prefix: CustomEmojiItem[] = [];
    const contains: CustomEmojiItem[] = [];

    for (const emoji of allCustom) {
      const name = emoji.name.toLowerCase();
      if (name === q) {
        prefix.unshift(emoji);
      } else if (name.startsWith(q)) {
        prefix.push(emoji);
      } else if (name.includes(q)) {
        contains.push(emoji);
      }
    }

    return [...prefix, ...contains].slice(0, limit);
  }

  getCategories(): Map<string, EmojiEntry[]> {
    if (!this.categories) {
      this.buildCategories();
    }
    return this.categories || new Map();
  }

  getAllEmojis(): EmojiEntry[] {
    return this.allEmojis || [];
  }

  getShortcodeMap(): Map<string, string> {
    return this.shortcodeMap || new Map();
  }

  lookupShortcode(key: string): string | undefined {
    return this.shortcodeMap?.get(key);
  }

  getCustomEmojisByServer(): Map<string, CustomEmojiItem[]> {
    if (this.customEmojiCache) {
      return this.customEmojiCache;
    }

    const currentCustomEmojis = customEmojisByServer.value;
    const currentServers = servers.value;

    const result = new Map<string, CustomEmojiItem[]>();

    for (const [sUrl, emojis] of Object.entries(currentCustomEmojis)) {
      const server = currentServers.find((s) => s.url === sUrl);
      const serverName = server?.name || sUrl;
      const items: CustomEmojiItem[] = [];

      for (const [id, emoji] of Object.entries(emojis)) {
        items.push({
          id,
          name: emoji.name,
          fileName: emoji.fileName,
          serverUrl: sUrl,
          serverName,
        });
      }

      if (items.length > 0) {
        result.set(sUrl, items);
      }
    }

    this.customEmojiCache = result;
    return result;
  }

  invalidateCustomEmojiCache(): void {
    this.customEmojiCache = null;
    this.customEmojiFlatCache = null;
  }

  getCustomEmojisFlat(): CustomEmojiItem[] {
    if (this.customEmojiFlatCache) {
      return this.customEmojiFlatCache;
    }

    const byServer = this.getCustomEmojisByServer();
    const currentSUrl = serverUrl.value;
    const currentServers = servers.value;

    const sortedUrls = Array.from(byServer.keys()).sort((a, b) => {
      if (a === currentSUrl) return -1;
      if (b === currentSUrl) return 1;
      const serverA = currentServers.find((s) => s.url === a);
      const serverB = currentServers.find((s) => s.url === b);
      return (serverA?.name || a).localeCompare(serverB?.name || b);
    });

    this.customEmojiFlatCache = sortedUrls.flatMap(
      (url) => byServer.get(url) || [],
    );
    return this.customEmojiFlatCache;
  }

  getSections(): Array<{
    id: string;
    type: "custom" | "category";
    label: string;
    icon: string;
    serverData?: { url: string; name: string; icon?: string };
  }> {
    const sections: Array<{
      id: string;
      type: "custom" | "category";
      label: string;
      icon: string;
      serverData?: { url: string; name: string; icon?: string };
    }> = [];

    const currentSUrl = serverUrl.value;
    const customEmojiData = this.getCustomEmojisByServer();
    const currentServers = servers.value;

    const sortedServerUrls = Array.from(customEmojiData.keys()).sort((a, b) => {
      if (a === currentSUrl) return -1;
      if (b === currentSUrl) return 1;
      const serverA = currentServers.find((s) => s.url === a);
      const serverB = currentServers.find((s) => s.url === b);
      return (serverA?.name || a).localeCompare(serverB?.name || b);
    });

    for (const sUrl of sortedServerUrls) {
      const server = currentServers.find((s) => s.url === sUrl);
      sections.push({
        id: `custom-${sUrl}`,
        type: "custom",
        label: server?.name || sUrl,
        icon: server?.icon || "",
        serverData: {
          url: sUrl,
          name: server?.name || sUrl,
          icon: server?.icon || undefined,
        },
      });
    }

    const CATEGORY_ICONS: Record<string, string> = {
      Faces: "😀",
      Hearts: "❤️",
      Animals: "🐶",
      Food: "🍕",
      Sports: "⚽",
      Hands: "👋",
      Other: "📋",
    };

    for (const cat of this.CATEGORY_ORDER) {
      const catEmojis = this.categories?.get(cat);
      if (catEmojis && catEmojis.length > 0) {
        sections.push({
          id: `category-${cat}`,
          type: "category",
          label: cat,
          icon: CATEGORY_ICONS[cat] || "📋",
        });
      }
    }

    return sections;
  }
}

export const emojiCache = new EmojiDataCache();
