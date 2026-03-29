import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "preact/hooks";
import { memo } from "preact/compat";
import type { TargetedInputEvent } from "preact";
import {
  recentEmojis,
  customEmojisByServer,
  servers,
  serverUrl,
} from "../../state";
import { Icon } from "../Icon";
import { favGifs as dbFavGifs } from "../../lib/db";
import { emojiImgUrl } from "../../lib/emoji";
import {
  emojiCache,
  type EmojiEntry,
  type CustomEmojiItem,
} from "../../lib/emoji-data-cache";

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

export interface UnifiedPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onEmojiSelect: (emoji: string) => void;
  onGifSelect: (gifUrl: string) => void;
  anchorRef?: { current: HTMLElement | null };
  initialTab?: "emoji" | "gif";
}

function hexcodeToEmoji(hexcode: string): string {
  return String.fromCodePoint(
    ...hexcode.split("-").map((h) => parseInt(h, 16)),
  );
}

function TwemojiImg({
  hexcode,
  alt,
  emoji,
}: {
  hexcode: string;
  alt: string;
  emoji?: string;
}) {
  const url = emojiImgUrl(hexcode);
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        className="twemoji-picker-img"
        draggable={false}
      />
    );
  }
  const char = emoji ?? hexcodeToEmoji(hexcode);
  return (
    <span className="twemoji-picker-img twemoji-picker-system">{char}</span>
  );
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

const QUICK_REACTIONS = [
  "😭",
  "😔",
  "💀",
  "👍",
  "👎",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🔥",
];

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
    <div ref={pickerRef} className="unified-picker">
      <div className="unified-picker-header">
        <div className="unified-picker-tabs">
          <button
            className={`unified-tab ${activeTab === "emoji" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("emoji");
              setSearchTerm("");
            }}
          >
            <Icon name="Smile" size={16} />
            Emoji
          </button>
          <button
            className={`unified-tab ${activeTab === "gif" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("gif");
              setSearchTerm("");
            }}
          >
            <Icon name="Image" size={16} />
            GIFs
          </button>
        </div>
        <button className="unified-picker-close" onClick={onClose}>
          <Icon name="X" size={16} />
        </button>
      </div>
      <div className="unified-picker-search">
        <Icon name="Search" size={14} />
        <input
          type="text"
          placeholder={
            activeTab === "emoji" ? "Search emoji..." : "Search Tenor GIFs..."
          }
          value={searchTerm}
          onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
          autoFocus
        />
      </div>
      {activeTab === "emoji" ? (
        <EmojiPanel
          searchTerm={searchTerm}
          onSelect={onEmojiSelect}
          onClose={onClose}
        />
      ) : (
        <GifPanel
          searchTerm={searchTerm}
          onSelect={onGifSelect}
          onClose={onClose}
        />
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

const EmojiButtonImpl = ({
  hexcode,
  emoji,
  label,
  onClick,
}: EmojiButtonProps) => (
  <button
    className="emoji-button"
    onClick={onClick}
    title={label}
    type="button"
  >
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

const CustomEmojiButtonImpl = ({
  name,
  fileName,
  serverUrl,
  onClick,
}: CustomEmojiButtonProps) => {
  const baseUrl = serverUrl.startsWith("http")
    ? serverUrl
    : `https://${serverUrl}`;
  const url = `${baseUrl}/emojis/${fileName}`;

  return (
    <button
      className="emoji-button"
      onClick={onClick}
      title={`:${name}:`}
      type="button"
    >
      <img
        src={url}
        alt={name}
        className="emoji-custom-img"
        loading="lazy"
        draggable={false}
      />
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
      const sectionEl = contentRef.current.querySelector(
        `[data-section="${activeCategory}"]`,
      );
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

  const addRecent = useCallback(
    (emoji: string) => {
      const current = recentEmojis.value;
      const updated = [emoji, ...current.filter((e) => e !== emoji)].slice(
        0,
        50,
      );
      recentEmojis.value = updated;
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose],
  );

  const addCustomEmoji = useCallback(
    (emoji: CustomEmojiItem) => {
      onSelect(`:${emoji.name}:`);
      onClose();
    },
    [onSelect, onClose],
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
    [],
  );

  const isServerCategory = (cat: string | null): boolean => {
    return cat?.startsWith("server:") ?? false;
  };

  const getServerUrlFromCategory = (cat: string): string => {
    return cat.replace("server:", "");
  };

  const findHexcode = useCallback(
    (emoji: string): string | null => {
      const entry = emojis.find((e) => e.emoji === emoji);
      return entry?.hexcode ?? null;
    },
    [emojis],
  );

  if (searchTerm.trim()) {
    const query = searchTerm.toLowerCase();
    const filtered = emojis
      .filter(
        (e) =>
          e.label.toLowerCase().includes(query) ||
          e.emoji.includes(searchTerm) ||
          (e.tags && e.tags.some((t) => t.toLowerCase().includes(query))),
      )
      .slice(0, 200);
    const filteredCustom = allCustomEmojis.filter((e) =>
      e.name.toLowerCase().includes(query),
    );
    const hasResults = filtered.length > 0 || filteredCustom.length > 0;

    return (
      <div className="unified-picker-body">
        {!hasResults ? (
          <div className="picker-empty">
            <Icon name="Search" size={32} />
            <p>No emoji found</p>
          </div>
        ) : (
          <div className="emoji-list-scroll">
            {filteredCustom.length > 0 && (
              <div className="emoji-section">
                <div className="emoji-section-label">Server Emojis</div>
                <div className="emoji-grid">
                  {filteredCustom.map((emoji) => (
                    <MemoCustomEmojiButton
                      key={emoji.id}
                      id={emoji.id}
                      name={emoji.name}
                      fileName={emoji.fileName}
                      serverUrl={emoji.serverUrl}
                      serverName={emoji.serverName}
                      onClick={() => addCustomEmoji(emoji)}
                    />
                  ))}
                </div>
              </div>
            )}
            {filtered.length > 0 && (
              <div className="emoji-section">
                <div className="emoji-section-label">Standard Emojis</div>
                <div className="emoji-grid">
                  {filtered.map((entry, i) => (
                    <MemoEmojiButton
                      key={`${entry.hexcode}-${i}`}
                      hexcode={entry.hexcode}
                      emoji={entry.emoji}
                      label={entry.label}
                      onClick={() => addRecent(entry.emoji)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="unified-picker-body">
      <div className="emoji-sidebar">
        <button
          className={`emoji-sidebar-btn ${activeCategory === null ? "active" : ""}`}
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
              className={`emoji-sidebar-btn ${isActive ? "active" : ""}`}
              onClick={() => setActiveCategory(`server:${sUrl}`)}
              title={server?.name || sUrl}
              type="button"
            >
              {server?.icon ? (
                <img
                  src={server.icon}
                  alt={server.name || sUrl}
                  className="emoji-sidebar-server-icon"
                />
              ) : (
                <span className="emoji-sidebar-server-letter">
                  {(server?.name || sUrl).charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          );
        })}
        <div className="emoji-sidebar-divider" />
        {DISPLAY_GROUPS.map((groupId) => (
          <button
            key={groupId}
            className={`emoji-sidebar-btn ${activeCategory === String(groupId) ? "active" : ""}`}
            onClick={() => setActiveCategory(String(groupId))}
            title={EMOJI_GROUP_NAMES[groupId]}
            type="button"
          >
            <MemoTwemojiImg
              hexcode={EMOJI_GROUP_ICONS[groupId]}
              alt={EMOJI_GROUP_NAMES[groupId]}
            />
          </button>
        ))}
      </div>
      <div ref={contentRef} className="emoji-content">
        {isServerCategory(activeCategory) && (
          <div className="emoji-section" data-section={activeCategory!}>
            <div className="emoji-section-header">
              {getServerForUrl(getServerUrlFromCategory(activeCategory!))
                ?.name || activeCategory}
            </div>
            <div className="emoji-grid">
              {(
                customEmojiData.get(
                  getServerUrlFromCategory(activeCategory!),
                ) || []
              ).map((emoji) => (
                <MemoCustomEmojiButton
                  key={emoji.id}
                  id={emoji.id}
                  name={emoji.name}
                  fileName={emoji.fileName}
                  serverUrl={emoji.serverUrl}
                  serverName={emoji.serverName}
                  onClick={() => addCustomEmoji(emoji)}
                />
              ))}
            </div>
          </div>
        )}
        {activeCategory === null && (
          <>
            {sortedServerUrls.map((sUrl) => {
              const server = getServerForUrl(sUrl);
              const emojis = customEmojiData.get(sUrl) || [];
              if (emojis.length === 0) return null;
              return (
                <div
                  key={sUrl}
                  className="emoji-section"
                  data-section={`server:${sUrl}`}
                >
                  <div className="emoji-section-header">
                    <span>{server?.name || sUrl}</span>
                  </div>
                  <div className="emoji-grid">
                    {emojis.map((emoji) => (
                      <MemoCustomEmojiButton
                        key={emoji.id}
                        id={emoji.id}
                        name={emoji.name}
                        fileName={emoji.fileName}
                        serverUrl={emoji.serverUrl}
                        serverName={emoji.serverName}
                        onClick={() => addCustomEmoji(emoji)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="emoji-section" data-section="recent">
              <div className="emoji-section-header">Recent</div>
              <div className="emoji-grid">
                {(recentEmojis.value.length > 0
                  ? recentEmojis.value
                  : QUICK_REACTIONS
                ).map((emoji, i) => {
                  const hex = findHexcode(emoji);
                  if (!hex) return null;
                  return (
                    <MemoEmojiButton
                      key={`recent-${hex}-${i}`}
                      hexcode={hex}
                      emoji={emoji}
                      label={emoji}
                      onClick={() => addRecent(emoji)}
                    />
                  );
                })}
              </div>
            </div>
            {DISPLAY_GROUPS.map((groupId) => {
              const groupEmojis = groupedEmojis[groupId] || [];
              if (groupEmojis.length === 0) return null;
              return (
                <div
                  key={groupId}
                  className="emoji-section"
                  data-section={String(groupId)}
                >
                  <div className="emoji-section-header">
                    {EMOJI_GROUP_NAMES[groupId]}
                  </div>
                  <div className="emoji-grid">
                    {groupEmojis.map((entry) => (
                      <MemoEmojiButton
                        key={entry.hexcode}
                        hexcode={entry.hexcode}
                        emoji={entry.emoji}
                        label={entry.label}
                        onClick={() => addRecent(entry.emoji)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
        {!isServerCategory(activeCategory) && activeCategory !== null && (
          <div className="emoji-section" data-section={activeCategory}>
            <div className="emoji-section-header">
              {EMOJI_GROUP_NAMES[parseInt(activeCategory, 10)]}
            </div>
            <div className="emoji-grid">
              {(groupedEmojis[parseInt(activeCategory, 10)] || []).map(
                (entry) => (
                  <MemoEmojiButton
                    key={entry.hexcode}
                    hexcode={entry.hexcode}
                    emoji={entry.emoji}
                    label={entry.label}
                    onClick={() => addRecent(entry.emoji)}
                  />
                ),
              )}
            </div>
          </div>
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
        setSavedGifs(
          saved.map((url) =>
            typeof url === "string" ? { url, savedAt: 0 } : url,
          ),
        );
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
        `https://apps.mistium.com/tenor/search?query=${encodeURIComponent(query)}`,
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
    <div className="unified-picker-body">
      {showFavorites && (
        <div className="gif-section-label">
          <Icon name="Star" size={14} />
          Favorites
        </div>
      )}
      {loading ? (
        <div className="picker-loading">
          <div
            className="account-loading-spinner"
            style={{ width: 32, height: 32 }}
          ></div>
          <span>Searching...</span>
        </div>
      ) : displayGifs.length === 0 ? (
        <div className="picker-empty">
          {showFavorites ? (
            <>
              <Icon name="Star" size={32} />
              <p>No favorite GIFs yet</p>
              <p className="picker-empty-hint">
                Search for GIFs and star them to save
              </p>
            </>
          ) : (
            <>
              <Icon name="Search" size={32} />
              <p>No results found</p>
            </>
          )}
        </div>
      ) : (
        <div className="gif-grid">
          {displayGifs.slice(0, 50).map((gif) => (
            <div
              key={gif.id || gif.fullUrl}
              className="gif-item"
              onClick={() => handleSelect(gif.fullUrl)}
            >
              <img src={gif.previewUrl} alt={gif.title} loading="lazy" />
              <button
                className={`gif-fav-btn ${isFavorite(gif.fullUrl) ? "active" : ""}`}
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
