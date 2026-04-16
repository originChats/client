import { useRef, useEffect, useState, useMemo, useCallback } from "preact/hooks";
import { memo } from "preact/compat";
import { emojiImgUrl } from "../../lib/emoji";
import { useSystemEmojis } from "../../state";
import type { CustomEmojiItem } from "../../lib/emoji-data-cache";

const EMOJI_SIZE = 32;
const EMOJI_PADDING = 8;
const HEADER_HEIGHT = 28;
const GRID_COLUMNS = 8;

interface EmojiItem {
  type: "standard" | "custom";
  emoji: string;
  hexcode?: string;
  label: string;
  customUrl?: string;
  data?: CustomEmojiItem;
}

interface EmojiSection {
  header?: string;
  items: EmojiItem[];
}

interface VirtualizedEmojiGridProps {
  sections: EmojiSection[];
  onSelect: (item: EmojiItem) => void;
}

function VirtualizedEmojiGrid({ sections, onSelect }: VirtualizedEmojiGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const useSystemEmojisFlag = useSystemEmojis.value;

  const cellSize = EMOJI_SIZE + EMOJI_PADDING;

  // Calculate section positions
  const sectionLayouts = useMemo(() => {
    return sections.map((section) => {
      const rows = Math.ceil(section.items.length / GRID_COLUMNS);
      const headerSpace = section.header ? HEADER_HEIGHT : 0;
      const height = headerSpace + rows * cellSize;
      return { rows, headerSpace, height };
    });
  }, [sections, cellSize]);

  const totalHeight = useMemo(() => {
    return sectionLayouts.reduce((sum, layout) => sum + layout.height, 0);
  }, [sectionLayouts]);

  // Track scroll and viewport size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Calculate exactly which emojis are visible
  const visibleContent = useMemo(() => {
    const visible: Array<{
      sectionIndex: number;
      header?: string;
      items: Array<{ item: EmojiItem; row: number; col: number }>;
    }> = [];

    let currentY = 0;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const layout = sectionLayouts[sectionIndex];
      const sectionTop = currentY;
      const sectionBottom = sectionTop + layout.height;

      // Check if section is visible
      if (sectionBottom >= scrollTop && sectionTop <= scrollTop + viewportHeight) {
        const visibleSection: (typeof visible)[0] = {
          sectionIndex,
          header: section.header,
          items: [],
        };

        // If there's a header, check if it's visible
        if (section.header && layout.headerSpace > 0) {
          const headerTop = sectionTop;
          const headerBottom = sectionTop + HEADER_HEIGHT;
          // Header is always included if section is visible
        }

        // Calculate which rows are visible
        const itemsStartY = sectionTop + layout.headerSpace;
        const visibleTop = Math.max(0, scrollTop - itemsStartY);
        const visibleBottom = Math.min(
          layout.height - layout.headerSpace,
          scrollTop + viewportHeight - itemsStartY
        );

        const startRow = Math.floor(visibleTop / cellSize);
        const endRow = Math.min(layout.rows - 1, Math.ceil(visibleBottom / cellSize));

        // Only render items in visible rows
        for (let row = startRow; row <= endRow; row++) {
          for (let col = 0; col < GRID_COLUMNS; col++) {
            const itemIndex = row * GRID_COLUMNS + col;
            if (itemIndex < section.items.length) {
              visibleSection.items.push({
                item: section.items[itemIndex],
                row,
                col,
              });
            }
          }
        }

        visible.push(visibleSection);
      }

      currentY += layout.height;
    }

    return visible;
  }, [sections, sectionLayouts, scrollTop, viewportHeight, cellSize]);

  return (
    <div
      ref={containerRef}
      style={{
        height: "100%",
        overflow: "auto",
        position: "relative",
      }}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleContent.map(({ sectionIndex, header, items }) => {
          const layout = sectionLayouts[sectionIndex];
          const sectionTop = sectionLayouts
            .slice(0, sectionIndex)
            .reduce((sum, l) => sum + l.height, 0);

          return (
            <div key={sectionIndex}>
              {/* Header - only render if visible */}
              {header &&
                sectionTop + HEADER_HEIGHT > scrollTop &&
                sectionTop < scrollTop + viewportHeight && (
                  <div
                    style={{
                      position: "absolute",
                      top: sectionTop,
                      left: 0,
                      right: 0,
                      height: HEADER_HEIGHT,
                      paddingLeft: "8px",
                      display: "flex",
                      alignItems: "center",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--text-dim)",
                    }}
                  >
                    {header}
                  </div>
                )}

              {/* Only render visible emoji items */}
              {items.map(({ item, row, col }) => {
                const x = col * cellSize + EMOJI_PADDING / 2;
                const y = sectionTop + layout.headerSpace + row * cellSize + EMOJI_PADDING / 2;

                return (
                  <EmojiButton
                    key={`${sectionIndex}-${row}-${col}`}
                    item={item}
                    useSystemEmojis={useSystemEmojisFlag}
                    onClick={() => onSelect(item)}
                    style={{
                      position: "absolute",
                      left: x,
                      top: y,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface EmojiButtonProps {
  item: EmojiItem;
  useSystemEmojis: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
}

interface EmojiFromUrlProps {
  url: string;
  label: string;
  onClick: () => void;
  style?: React.CSSProperties;
}

const EmojiFromUrl = function EmojiFromUrl({ url, label, onClick, style }: EmojiFromUrlProps) {
  const cellSize = EMOJI_SIZE + EMOJI_PADDING;
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: cellSize,
        height: cellSize,
        padding: `${EMOJI_PADDING / 2}px`,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <img
        src={url}
        alt={label}
        style={{ width: EMOJI_SIZE, height: EMOJI_SIZE }}
        draggable={false}
      />
    </button>
  );
};

const EmojiButton = memo(function EmojiButton({
  item,
  useSystemEmojis,
  onClick,
  style,
}: EmojiButtonProps) {
  const cellSize = EMOJI_SIZE + EMOJI_PADDING;

  if (item.type === "custom" && item.customUrl) {
    return <EmojiFromUrl url={item.customUrl} label={item.label} onClick={onClick} style={style} />;
  }

  const url = emojiImgUrl(item.hexcode || "");
  if (useSystemEmojis || !item.hexcode || !url) {
    return (
      <button
        onClick={onClick}
        title={item.label}
        style={{
          width: cellSize,
          height: cellSize,
          padding: `${EMOJI_PADDING / 2}px`,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: `${EMOJI_SIZE}px`,
          lineHeight: 1,
          ...style,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "var(--surface-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        {item.emoji}
      </button>
    );
  }

  return <EmojiFromUrl url={url} label={item.label} onClick={onClick} style={style} />;
});

export const MemoVirtualizedEmojiGrid = memo(VirtualizedEmojiGrid);

export function standardEmojiToItem(emoji: string, hexcode: string, label: string): EmojiItem {
  return {
    type: "standard",
    emoji,
    hexcode,
    label,
  };
}

export function customEmojiToItem(emoji: CustomEmojiItem): EmojiItem {
  const baseUrl = emoji.serverUrl.startsWith("http")
    ? emoji.serverUrl
    : `https://${emoji.serverUrl}`;
  return {
    type: "custom",
    emoji: `:${emoji.name}:`,
    label: `:${emoji.name}:`,
    customUrl: `${baseUrl}/emojis/${emoji.fileName}`,
    data: emoji,
  };
}

export type { EmojiItem, EmojiSection };
