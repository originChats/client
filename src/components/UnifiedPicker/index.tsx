import { useState, useEffect, useRef, useMemo, useCallback } from "preact/hooks";
import { memo } from "preact/compat";
import type { TargetedInputEvent } from "preact";
import { recentEmojis, customEmojisByServer, servers, serverUrl } from "../../state";
import { Icon } from "../Icon";
import { favGifs as dbFavGifs } from "../../lib/db";
import { emojiImgUrl } from "../../lib/emoji";
import { emojiCache, type EmojiEntry, type CustomEmojiItem } from "../../lib/emoji-data-cache";
import {
  MemoVirtualizedEmojiGrid,
  standardEmojiToItem,
  customEmojiToItem,
  type EmojiSection,
  type EmojiItem,
} from "./VirtualizedEmojiGrid";
import styles from "./UnifiedPicker.module.css";

interface GifResult {
  id: string;
  media: {
    tinygif?: { url: string };
    gif?: { url: string };
    nanogif?: { url: string };
    preview?: string;
  }[];
  title: string;
  itemurl: string;
}

interface SavedGif {
  url: string;
  savedAt: number;
}

interface UnifiedPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onEmojiSelect: (emoji: string) => void;
  onGifSelect: (gifUrl: string) => void;
  anchorRef?: { current: HTMLElement | null };
  initialTab?: "emoji" | "gif";
}

function hexcodeToEmoji(hexcode: string): string {
  return String.fromCodePoint(...hexcode.split("-").map((h) => parseInt(h, 16)));
}

function TwemojiImg({ hexcode, alt, emoji }: { hexcode: string; alt: string; emoji?: string }) {
  const url = emojiImgUrl(hexcode);
  if (url) {
    return <img src={url} alt={alt} className={styles.twemojiPickerImg} draggable={false} />;
  }
  const char = emoji ?? hexcodeToEmoji(hexcode);
  return <span className={`${styles.twemojiPickerImg} ${styles.twemojiPickerSystem}`}>{char}</span>;
}

const MemoTwemojiImg = memo(TwemojiImg);

const EMOJI_GROUP_NAMES: Record<number, string> = {
  0: "Smileys & Emotion",
  1: "People & Body",
  3: "Animals & Nature",
  4: "Food & Drink",
  5: "Travel & Places",
  6: "Activities",
  7: "Objects",
  8: "Symbols",
  9: "Flags",
};

const EMOJI_GROUP_ICONS: Record<number, string> = {
  0: "1f600",
  1: "1f44b",
  3: "1f435",
  4: "1f347",
  5: "1f30d",
  6: "1f383",
  7: "1f4bc",
  8: "1f3e7",
  9: "1f3c1",
};

const QUICK_REACTIONS = ["😭", "😔", "💀", "👍", "👎", "❤️", "😂", "😮", "😢", "🔥"];

const DISPLAY_GROUPS = [0, 1, 3, 4, 5, 6, 7, 8, 9];

export function UnifiedPicker({
  isOpen,
  onClose,
  onEmojiSelect,
  onGifSelect,
  anchorRef,
  initialTab = "emoji",
}: UnifiedPickerProps) {
  const [activeTab, setActiveTab] = useState<"emoji" | "gif">(initialTab);
  const [searchTerm, setSearchTerm] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (isOpen && !initRef.current) {
      initRef.current = true;
      emojiCache.initialize();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      if (initialTab) setActiveTab(initialTab);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    positionPicker();

    const handleClickOutside = (e: Event) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        !anchorRef?.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleResize = () => positionPicker();

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, anchorRef, onClose]);

  const positionPicker = () => {
    if (!anchorRef?.current || !pickerRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const picker = pickerRef.current;
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      picker.style.left = "0";
      picker.style.right = "0";
      picker.style.bottom = "0";
      picker.style.top = "auto";
      picker.style.width = "100%";
      picker.style.maxHeight = "60vh";
    } else {
      const pickerRect = picker.getBoundingClientRect();
      let x = rect.right - pickerRect.width;
      let y = rect.top - pickerRect.height - 8;
      if (x < 10) x = 10;
      if (y < 10) y = rect.bottom + 8;
      picker.style.left = `${x}px`;
      picker.style.top = `${y}px`;
    }
  };

  if (!isOpen) return null;

  return (
    <div ref={pickerRef} className={styles.unifiedPicker}>
      <div className={styles.unifiedPickerHeader}>
        <div className={styles.unifiedPickerTabs}>
          <button
            className={`${styles.unifiedTab} ${activeTab === "emoji" ? styles.active : ""}`}
            onClick={() => {
              setActiveTab("emoji");
              setSearchTerm("");
            }}
          >
            <Icon name="Smile" size={16} />
            Emoji
          </button>
          <button
            className={`${styles.unifiedTab} ${activeTab === "gif" ? styles.active : ""}`}
            onClick={() => {
              setActiveTab("gif");
              setSearchTerm("");
            }}
          >
            <Icon name="Image" size={16} />
            GIFs
          </button>
        </div>
        <button className={styles.unifiedPickerClose} onClick={onClose}>
          <Icon name="X" size={16} />
        </button>
      </div>
      <div className={styles.unifiedPickerSearch}>
        <Icon name="Search" size={14} />
        <input
          type="text"
          placeholder={activeTab === "emoji" ? "Search emoji..." : "Search Tenor GIFs..."}
          value={searchTerm}
          onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
          autoFocus
        />
      </div>
      {activeTab === "emoji" ? (
        <EmojiPanel searchTerm={searchTerm} onSelect={onEmojiSelect} onClose={onClose} />
      ) : (
        <GifPanel searchTerm={searchTerm} onSelect={onGifSelect} onClose={onClose} />
      )}
    </div>
  );
}

interface EmojiButtonProps {
  hexcode: string;
  emoji: string;
  label: string;
  onClick: () => void;
}

const EmojiButtonImpl = ({ hexcode, emoji, label, onClick }: EmojiButtonProps) => (
  <button className="emoji-button" onClick={onClick} title={label} type="button">
    <MemoTwemojiImg hexcode={hexcode} alt={emoji} />
  </button>
);

const MemoEmojiButton = memo(EmojiButtonImpl);

interface CustomEmojiButtonProps {
  id: string;
  name: string;
  fileName: string;
  serverUrl: string;
  serverName: string;
  onClick: () => void;
}

const CustomEmojiButtonImpl = ({ name, fileName, serverUrl, onClick }: CustomEmojiButtonProps) => {
  const baseUrl = serverUrl.startsWith("http") ? serverUrl : `https://${serverUrl}`;
  const url = `${baseUrl}/emojis/${fileName}`;

  return (
    <button className="emoji-button" onClick={onClick} title={`:${name}:`} type="button">
      <img src={url} alt={name} className="emoji-custom-img" loading="lazy" draggable={false} />
    </button>
  );
};

const MemoCustomEmojiButton = memo(CustomEmojiButtonImpl);

function EmojiPanel({
  searchTerm,
  onSelect,
  onClose,
}: {
  searchTerm: string;
  onSelect: (e: string) => void;
  onClose: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [emojis, setEmojis] = useState<EmojiEntry[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    emojiCache.initialize().then(() => {
      setEmojis(emojiCache.getAllEmojis());
    });
  }, []);

  useEffect(() => {
    if (activeCategory && contentRef.current) {
      const sectionEl = contentRef.current.querySelector(`[data-section="${activeCategory}"]`);
      if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: "instant", block: "start" });
      }
    }
  }, [activeCategory]);

  const groupedEmojis = useMemo(() => {
    const groups: Record<number, EmojiEntry[]> = {};
    for (const groupId of DISPLAY_GROUPS) {
      groups[groupId] = emojis.filter((e) => (e.group ?? -1) === groupId);
    }
    return groups;
  }, [emojis]);

  const isServerCategory = useCallback((cat: string | null): boolean => {
    return cat?.startsWith("server:") ?? false;
  }, []);

  const getServerUrlFromCategory = useCallback((cat: string): string => {
    return cat.replace("server:", "");
  }, []);

  const addRecent = useCallback(
    (emoji: string) => {
      const current = recentEmojis.value;
      const updated = [emoji, ...current.filter((e) => e !== emoji)].slice(0, 50);
      recentEmojis.value = updated;
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose]
  );

  const addCustomEmoji = useCallback(
    (emoji: CustomEmojiItem) => {
      onSelect(`:${emoji.name}:`);
      onClose();
    },
    [onSelect, onClose]
  );

  const customEmojiData = useMemo(() => {
    const result = new Map<string, CustomEmojiItem[]>();
    const emojiData = customEmojisByServer.value;

    for (const [sUrl, emojis] of Object.entries(emojiData)) {
      const server = servers.value.find((s) => s.url === sUrl);
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

    return result;
  }, []);

  const currentSUrl = serverUrl.value;
  const sortedServerUrls = useMemo(() => {
    return Array.from(customEmojiData.keys()).sort((a, b) => {
      if (a === currentSUrl) return -1;
      if (b === currentSUrl) return 1;
      const serverA = servers.value.find((s) => s.url === a);
      const serverB = servers.value.find((s) => s.url === b);
      return (serverA?.name || a).localeCompare(serverB?.name || b);
    });
  }, [customEmojiData, currentSUrl]);

  const allCustomEmojis = useMemo(() => {
    return sortedServerUrls.flatMap((sUrl) => customEmojiData.get(sUrl) || []);
  }, [sortedServerUrls, customEmojiData]);

  const getServerForUrl = useCallback(
    (sUrl: string) => servers.value.find((s) => s.url === sUrl),
    []
  );

  const activeGroupEmojis = useMemo(() => {
    if (activeCategory === null || isServerCategory(activeCategory)) {
      return [];
    }
    return groupedEmojis[parseInt(activeCategory, 10)] || [];
  }, [activeCategory, groupedEmojis]);

  const activeGroupItems = useMemo(() => {
    return activeGroupEmojis.map((entry) =>
      standardEmojiToItem(entry.emoji, entry.hexcode, entry.label)
    );
  }, [activeGroupEmojis]);

  const activeGroupSections = useMemo((): EmojiSection[] => {
    if (activeGroupItems.length === 0) return [];
    return [
      {
        header: EMOJI_GROUP_NAMES[parseInt(activeCategory || "0", 10)],
        items: activeGroupItems,
      },
    ];
  }, [activeGroupItems, activeCategory]);

  const allEmojiItems = useMemo(() => {
    const sections: EmojiSection[] = [];

    // Add custom emojis by server
    for (const sUrl of sortedServerUrls) {
      const server = getServerForUrl(sUrl);
      const serverEmojis = customEmojiData.get(sUrl) || [];
      if (serverEmojis.length > 0) {
        sections.push({
          header: server?.name || sUrl,
          items: serverEmojis.map(customEmojiToItem),
        });
      }
    }

    // Add standard emojis by group
    for (const groupId of DISPLAY_GROUPS) {
      const groupEmojis = groupedEmojis[groupId] || [];
      if (groupEmojis.length > 0) {
        sections.push({
          header: EMOJI_GROUP_NAMES[groupId],
          items: groupEmojis.map((entry) =>
            standardEmojiToItem(entry.emoji, entry.hexcode, entry.label)
          ),
        });
      }
    }

    return sections;
  }, [sortedServerUrls, customEmojiData, groupedEmojis, getServerForUrl]);

  const serverEmojiItems = useMemo((): EmojiSection[] => {
    if (!isServerCategory(activeCategory)) return [];
    const sUrl = activeCategory ? getServerUrlFromCategory(activeCategory) : "";
    if (!sUrl) return [];
    const emojis = customEmojiData.get(sUrl) || [];
    return [
      {
        header: undefined,
        items: emojis.map(customEmojiToItem),
      },
    ];
  }, [activeCategory, customEmojiData, isServerCategory, getServerUrlFromCategory]);

  const findHexcode = useCallback(
    (emoji: string): string | null => {
      const entry = emojis.find((e) => e.emoji === emoji);
      return entry?.hexcode ?? null;
    },
    [emojis]
  );

  // Filter function for search
  const filterItems = useCallback(
    (items: EmojiItem[]): EmojiItem[] => {
      if (!searchTerm.trim()) return items;
      const query = searchTerm.toLowerCase().trim();
      return items.filter((item) => {
        const labelMatch = item.label.toLowerCase().includes(query);
        const emojiMatch = item.emoji.includes(searchTerm.trim());
        return labelMatch || emojiMatch;
      });
    },
    [searchTerm]
  );

  // Apply search filter to all sections
  const displaySections = useMemo(() => {
    if (!searchTerm.trim()) {
      // No search - show based on activeCategory
      if (isServerCategory(activeCategory)) {
        return serverEmojiItems;
      }
      if (activeCategory !== null) {
        return activeGroupSections;
      }
      return allEmojiItems;
    }

    // With search - filter all items
    const query = searchTerm.toLowerCase().trim();
    const sections: EmojiSection[] = [];

    // Filter custom emojis
    for (const sUrl of sortedServerUrls) {
      const serverEmojis = customEmojiData.get(sUrl) || [];
      const server = getServerForUrl(sUrl);
      const filtered = serverEmojis
        .filter((e) => e.name.toLowerCase().includes(query))
        .map(customEmojiToItem);
      if (filtered.length > 0) {
        sections.push({
          header: server?.name || sUrl,
          items: filtered,
        });
      }
    }

    // Filter standard emojis by group
    for (const groupId of DISPLAY_GROUPS) {
      const groupEmojis = groupedEmojis[groupId] || [];
      const filtered = groupEmojis
        .filter((e) => {
          const labelMatch = e.label.toLowerCase().includes(query);
          const emojiMatch = e.emoji.includes(searchTerm.trim());
          const tagMatch = e.tags && e.tags.some((t) => t.toLowerCase().includes(query));
          return labelMatch || emojiMatch || tagMatch;
        })
        .map((entry) => standardEmojiToItem(entry.emoji, entry.hexcode, entry.label));
      if (filtered.length > 0) {
        sections.push({
          header: EMOJI_GROUP_NAMES[groupId],
          items: filtered,
        });
      }
    }

    return sections;
  }, [
    searchTerm,
    activeCategory,
    isServerCategory,
    serverEmojiItems,
    activeGroupSections,
    allEmojiItems,
    sortedServerUrls,
    customEmojiData,
    getServerForUrl,
    groupedEmojis,
  ]);

  const showSearchEmpty = searchTerm.trim() && displaySections.every((s) => s.items.length === 0);

  return (
    <div className={styles.unifiedPickerBody}>
      <div className={styles.emojiSidebar}>
        <button
          className={`${styles.emojiSidebarBtn} ${activeCategory === null ? styles.active : ""}`}
          onClick={() => setActiveCategory(null)}
          title="All"
          type="button"
        >
          <MemoTwemojiImg hexcode="1f552" alt="All" />
        </button>
        {sortedServerUrls.map((sUrl) => {
          const server = getServerForUrl(sUrl);
          const isActive = activeCategory === `server:${sUrl}`;
          return (
            <button
              key={sUrl}
              className={`${styles.emojiSidebarBtn} ${isActive ? styles.active : ""}`}
              onClick={() => setActiveCategory(`server:${sUrl}`)}
              title={server?.name || sUrl}
              type="button"
            >
              {server?.icon ? (
                <img
                  src={server.icon}
                  alt={server.name || sUrl}
                  className={styles.emojiSidebarServerIcon}
                />
              ) : (
                <span className={styles.emojiSidebarServerLetter}>
                  {(server?.name || sUrl).charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          );
        })}
        <div className={styles.emojiSidebarDivider} />
        {DISPLAY_GROUPS.map((groupId) => (
          <button
            key={groupId}
            className={`${styles.emojiSidebarBtn} ${activeCategory === String(groupId) ? styles.active : ""}`}
            onClick={() => setActiveCategory(String(groupId))}
            title={EMOJI_GROUP_NAMES[groupId]}
            type="button"
          >
            <MemoTwemojiImg hexcode={EMOJI_GROUP_ICONS[groupId]} alt={EMOJI_GROUP_NAMES[groupId]} />
          </button>
        ))}
      </div>
      <div ref={contentRef} className={styles.emojiContent}>
        {showSearchEmpty ? (
          <div className={styles.pickerEmpty}>
            <Icon name="Search" size={32} />
            <p>No emoji found</p>
          </div>
        ) : (
          <MemoVirtualizedEmojiGrid
            sections={displaySections}
            onSelect={(item) => {
              if (item.type === "custom" && item.data) {
                addCustomEmoji(item.data);
              } else {
                addRecent(item.emoji);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function GifPanel({
  searchTerm,
  onSelect,
  onClose,
}: {
  searchTerm: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedGifs, setSavedGifs] = useState<SavedGif[]>([]);
  const [showFavorites, setShowFavorites] = useState(true);
  const searchTimer = useRef<number | null>(null);

  useEffect(() => {
    dbFavGifs.get().then((saved) => {
      if (saved.length > 0) {
        setSavedGifs(saved.map((url) => (typeof url === "string" ? { url, savedAt: 0 } : url)));
      }
    });
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setShowFavorites(true);
      setResults([]);
      return;
    }
    setShowFavorites(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => searchGifs(searchTerm), 400);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchTerm]);

  const searchGifs = async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const response = await fetch(
        `https://apps.mistium.com/tenor/search?query=${encodeURIComponent(query)}`
      );
      const data = await response.json();
      setResults(data.results || data || []);
    } catch (error) {
      console.error("Failed to search GIFs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (gifUrl: string) => {
    onSelect(gifUrl);
    onClose();
  };

  const toggleFavorite = (gifUrl: string, e: Event) => {
    e.stopPropagation();
    const existingIndex = savedGifs.findIndex((g) => g.url === gifUrl);
    let updated: SavedGif[];
    if (existingIndex >= 0) {
      updated = savedGifs.filter((_, i) => i !== existingIndex);
    } else {
      updated = [...savedGifs, { url: gifUrl, savedAt: Date.now() }];
    }
    setSavedGifs(updated);
    dbFavGifs.set(updated);
  };

  const isFavorite = (url: string) => savedGifs.some((g) => g.url === url);

  const displayGifs = showFavorites
    ? savedGifs.map((g) => ({
        id: g.url,
        previewUrl: g.url,
        fullUrl: g.url,
        title: "",
      }))
    : results.map((g) => {
        const media = g.media?.[0];
        const previewUrl = media?.tinygif?.url || media?.preview || "";
        const fullUrl = media?.gif?.url || media?.nanogif?.url || g.itemurl;
        return { id: g.id, previewUrl, fullUrl, title: g.title || "" };
      });

  return (
    <div className={`${styles.unifiedPickerBody} ${styles.unifiedPickerBodyGif}`}>
      {showFavorites && (
        <div className={styles.gifSectionLabel}>
          <Icon name="Star" size={14} />
          Favorites
        </div>
      )}
      {loading ? (
        <div className={styles.gifLoading}>
          <div className={styles.accountLoadingSpinner} style={{ width: 32, height: 32 }}></div>
          <span>Searching...</span>
        </div>
      ) : displayGifs.length === 0 ? (
        <div className={styles.pickerEmpty}>
          {showFavorites ? (
            <>
              <Icon name="Star" size={32} />
              <p>No favorite GIFs yet</p>
              <p className={styles.pickerEmptyHint}>Search for GIFs and star them to save</p>
            </>
          ) : (
            <>
              <Icon name="Search" size={32} />
              <p>No results found</p>
            </>
          )}
        </div>
      ) : (
        <div className={styles.gifGrid}>
          {displayGifs.slice(0, 50).map((gif) => (
            <div
              key={gif.id || gif.fullUrl}
              className={styles.gifItem}
              onClick={() => handleSelect(gif.fullUrl)}
            >
              <img src={gif.previewUrl} alt={gif.title} loading="lazy" />
              <button
                className={`${styles.gifFavoriteBtn} ${isFavorite(gif.fullUrl) ? styles.favorited : ""}`}
                onClick={(e: any) => toggleFavorite(gif.fullUrl, e)}
              >
                <Icon
                  name="Star"
                  size={14}
                  fill={isFavorite(gif.fullUrl) ? "currentColor" : "none"}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
