import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "preact/hooks";
import { memo } from "preact/compat";
import { recentEmojis, servers, useSystemEmojis } from "../../state";
import {
  emojiCache,
  type EmojiEntry,
  type CustomEmojiItem,
} from "../../lib/emoji-data-cache";
import { EmojiButton, CustomEmojiButton } from "./EmojiButton";
import { getEmojiImgOrDataUri } from "../../lib/emoji";

export interface EmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (
    emoji: string,
    isCustom?: boolean,
    emojiData?: { name: string; serverUrl: string },
  ) => void;
  anchorRef?: React.RefObject<HTMLElement>;
  mode?: "emoji" | "reaction";
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

function SidebarButton({
  icon,
  label,
  isActive,
  onClick,
  serverIcon,
  serverLetter,
}: {
  icon?: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
  serverIcon?: string;
  serverLetter?: string;
}) {
  const useSystem = useSystemEmojis.value;

  return (
    <button
      className={`emoji-sidebar-item ${isActive ? "active" : ""}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {serverIcon ? (
        <img
          src={serverIcon}
          alt={label}
          className="emoji-sidebar-server-icon"
        />
      ) : serverLetter ? (
        <span className="emoji-sidebar-server-letter">{serverLetter}</span>
      ) : icon ? (
        useSystem ? (
          <span className="emoji-sidebar-emoji">{icon}</span>
        ) : (
          <img
            src={getEmojiImgOrDataUri(icon) || ""}
            alt={label}
            className="emoji-sidebar-emoji-img"
            draggable={false}
          />
        )
      ) : null}
    </button>
  );
}

const MemoSidebarButton = memo(SidebarButton);

let searchDebounceTimer: number | null = null;

export function EmojiPicker({
  isOpen,
  onClose,
  onSelect,
  anchorRef,
  mode = "emoji",
}: EmojiPickerProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<EmojiEntry[]>([]);
  const [customSearchResults, setCustomSearchResults] = useState<
    CustomEmojiItem[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [categories, setCategories] = useState<Map<string, EmojiEntry[]>>(
    new Map(),
  );
  const [customSections, setCustomSections] = useState<
    Array<{
      id: string;
      label: string;
      items: CustomEmojiItem[];
    }>
  >([]);
  const pickerRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (isOpen && !initRef.current) {
      initRef.current = true;
      emojiCache.initialize().then(() => {
        setCategories(emojiCache.getCategories());
        setCustomSections(
          Array.from(emojiCache.getCustomEmojisByServer().entries()).map(
            ([sUrl, items]) => ({
              id: `custom-${sUrl}`,
              label: items[0]?.serverName || sUrl,
              items,
            }),
          ),
        );
        setInitialized(true);
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && anchorRef?.current && pickerRef.current) {
      positionPicker();
    }
  }, [isOpen, anchorRef]);

  useEffect(() => {
    const handleClickOutside = (e: Event) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        !anchorRef?.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("resize", positionPicker);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("resize", positionPicker);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen, anchorRef, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const allSections = [
      ...customSections,
      ...Array.from(categories.entries()).map(([cat, items]) => ({
        id: `category-${cat}`,
        label: cat,
        items,
      })),
    ];
    const firstSection = allSections[0]?.id;
    if (firstSection && !activeSection) {
      setActiveSection(firstSection);
    }
  }, [isOpen, categories, customSections, activeSection]);

  const positionPicker = () => {
    if (!anchorRef?.current || !pickerRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();
    const pickerRect = pickerRef.current.getBoundingClientRect();

    const isMobile = window.innerWidth <= 768;
    let x = rect.left;
    let y = rect.bottom + 5;

    if (isMobile) {
      x = 0;
      y = window.innerHeight - pickerRect.height;
    } else {
      if (x + pickerRect.width > window.innerWidth - 10) {
        x = window.innerWidth - pickerRect.width - 10;
      }
      if (y + pickerRect.height > window.innerHeight - 10) {
        y = rect.top - pickerRect.height - 5;
      }
    }

    pickerRef.current.style.left = `${x}px`;
    pickerRef.current.style.top = `${y}px`;
  };

  const handleEmojiClick = useCallback(
    (emoji: string) => {
      const currentRecent = recentEmojis.value;
      const updated = currentRecent.includes(emoji)
        ? currentRecent.filter((e) => e !== emoji)
        : [emoji, ...currentRecent.slice(0, 49)];
      recentEmojis.value = updated;
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose],
  );

  const handleCustomEmojiClick = useCallback(
    (emoji: CustomEmojiItem) => {
      onSelect(`:${emoji.name}:`, true, {
        name: emoji.name,
        serverUrl: emoji.serverUrl,
      });
      onClose();
    },
    [onSelect, onClose],
  );

  const handleSearchInput = useCallback((e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setSearchTerm(value);

    if (searchDebounceTimer !== null) {
      clearTimeout(searchDebounceTimer);
    }

    if (!value.trim()) {
      setSearchResults([]);
      setCustomSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    searchDebounceTimer = window.setTimeout(() => {
      const results = emojiCache.search(value, 100);
      const customResults = emojiCache.searchCustomEmojis(value, 100);
      setSearchResults(results);
      setCustomSearchResults(customResults);
      setIsSearching(false);
    }, 150);
  }, []);

  const sidebarItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: "custom" | "category";
      label: string;
      icon: string;
      serverData?: { url: string; name: string; icon?: string };
    }> = [];

    for (const section of customSections) {
      const firstItem = section.items[0];
      if (firstItem) {
        const server = servers.value.find((s) => s.url === firstItem.serverUrl);
        items.push({
          id: section.id,
          type: "custom",
          label: section.label,
          icon: server?.icon || "",
          serverData: {
            url: firstItem.serverUrl,
            name: section.label,
            icon: server?.icon || undefined,
          },
        });
      }
    }

    for (const cat of emojiCache.CATEGORY_ORDER) {
      const catEmojis = categories.get(cat);
      if (catEmojis && catEmojis.length > 0) {
        items.push({
          id: `category-${cat}`,
          type: "category",
          label: cat,
          icon: CATEGORY_ICONS[cat] || "📋",
        });
      }
    }

    return items;
  }, [customSections, categories]);

  const allSections = useMemo(() => {
    const sections: Array<{
      id: string;
      label: string;
      items: EmojiEntry[] | CustomEmojiItem[];
    }> = [];

    for (const section of customSections) {
      if (section.items.length > 0) {
        sections.push({
          id: section.id,
          label: section.label,
          items: section.items,
        });
      }
    }

    for (const cat of emojiCache.CATEGORY_ORDER) {
      const catEmojis = categories.get(cat);
      if (catEmojis && catEmojis.length > 0) {
        sections.push({
          id: `category-${cat}`,
          label: cat,
          items: catEmojis,
        });
      }
    }

    return sections;
  }, [customSections, categories]);

  if (!isOpen) return null;

  const isSearchMode = searchTerm.trim().length > 0;

  return (
    <div ref={pickerRef} className={`emoji-picker emoji-picker-${mode}`}>
      <div className="emoji-picker-search">
        <input
          type="text"
          placeholder="Search emoji..."
          value={searchTerm}
          onInput={handleSearchInput}
        />
      </div>

      <div className="emoji-picker-body">
        <div className="emoji-picker-sidebar">
          {sidebarItems.map((item) => (
            <MemoSidebarButton
              key={item.id}
              icon={item.type === "category" ? item.icon : undefined}
              label={item.label}
              isActive={activeSection === item.id}
              onClick={() => setActiveSection(item.id)}
              serverIcon={item.serverData?.icon}
              serverLetter={
                item.type === "custom" && !item.serverData?.icon
                  ? item.label.charAt(0).toUpperCase()
                  : undefined
              }
            />
          ))}
        </div>

        <div className="emoji-picker-content">
          {isSearchMode ? (
            <SearchResultsView
              results={searchResults}
              customResults={customSearchResults}
              onEmojiClick={handleEmojiClick}
              onCustomEmojiClick={handleCustomEmojiClick}
              isSearching={isSearching}
            />
          ) : (
            <EmojiListView
              sections={allSections}
              activeSection={activeSection}
              onEmojiClick={handleEmojiClick}
              onCustomEmojiClick={handleCustomEmojiClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface EmojiListViewProps {
  sections: Array<{
    id: string;
    label: string;
    items: EmojiEntry[] | CustomEmojiItem[];
  }>;
  activeSection: string | null;
  onEmojiClick: (emoji: string) => void;
  onCustomEmojiClick: (emoji: CustomEmojiItem) => void;
}

function EmojiListView({
  sections,
  activeSection,
  onEmojiClick,
  onCustomEmojiClick,
}: EmojiListViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeSection && contentRef.current) {
      const sectionEl = contentRef.current.querySelector(
        `[data-section="${activeSection}"]`,
      );
      if (sectionEl) {
        sectionEl.scrollIntoView({ behavior: "instant", block: "start" });
      }
    }
  }, [activeSection]);

  return (
    <div ref={contentRef} className="emoji-list-scroll">
      {sections.map((section) => (
        <div
          key={section.id}
          data-section={section.id}
          className="emoji-section"
        >
          <div className="emoji-section-header">{section.label}</div>
          <div className="emoji-grid">
            {section.items.map((item, index) => {
              if ("hexcode" in item) {
                const entry = item as EmojiEntry;
                return (
                  <EmojiButton
                    key={`${entry.hexcode}-${index}`}
                    emoji={entry.emoji}
                    label={entry.label}
                    hexcode={entry.hexcode}
                    onClick={() => onEmojiClick(entry.emoji)}
                  />
                );
              }
              const custom = item as CustomEmojiItem;
              return (
                <CustomEmojiButton
                  key={`${custom.id}-${index}`}
                  id={custom.id}
                  name={custom.name}
                  fileName={custom.fileName}
                  serverUrl={custom.serverUrl}
                  serverName={custom.serverName}
                  onClick={() => onCustomEmojiClick(custom)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface SearchResultsViewProps {
  results: EmojiEntry[];
  customResults: CustomEmojiItem[];
  onEmojiClick: (emoji: string) => void;
  onCustomEmojiClick: (emoji: CustomEmojiItem) => void;
  isSearching: boolean;
}

const SearchResultsView = memo(function SearchResultsView({
  results,
  customResults,
  onEmojiClick,
  onCustomEmojiClick,
  isSearching,
}: SearchResultsViewProps) {
  if (isSearching) {
    return <div className="emoji-empty">Searching...</div>;
  }

  const hasResults = results.length > 0 || customResults.length > 0;

  if (!hasResults) {
    return <div className="emoji-empty">No emojis found</div>;
  }

  return (
    <div className="emoji-search-results">
      {customResults.length > 0 && (
        <div className="emoji-section">
          <div className="emoji-section-header">Server Emojis</div>
          <div className="emoji-grid">
            {customResults.map((emoji, i) => (
              <CustomEmojiButton
                key={`${emoji.id}-${i}`}
                id={emoji.id}
                name={emoji.name}
                fileName={emoji.fileName}
                serverUrl={emoji.serverUrl}
                serverName={emoji.serverName}
                onClick={() => onCustomEmojiClick(emoji)}
              />
            ))}
          </div>
        </div>
      )}
      {results.length > 0 && (
        <div className="emoji-section">
          <div className="emoji-section-header">Standard Emojis</div>
          <div className="emoji-grid">
            {results.map((emoji, i) => (
              <EmojiButton
                key={`${emoji.hexcode}-${i}`}
                emoji={emoji.emoji}
                label={emoji.label}
                hexcode={emoji.hexcode}
                onClick={() => onEmojiClick(emoji.emoji)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export const MemoEmojiPicker = memo(EmojiPicker) as typeof EmojiPicker;
