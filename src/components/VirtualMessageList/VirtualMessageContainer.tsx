import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "preact/hooks";
import { memo } from "preact/compat";

interface VirtualContainerProps {
  children: React.ReactNode;
  className?: string;
  onScroll?: (scrollTop: number) => void;
  onNearTop?: () => void;
  onNearBottom?: () => void;
  nearTopThreshold?: number;
  nearBottomThreshold?: number;
  scrollToBottom?: boolean;
  scrollToMessageId?: string | null;
  onStickToBottomChange?: (stuck: boolean) => void;
}

export function VirtualMessageContainer({
  children,
  className = "messages",
  onScroll,
  onNearTop,
  onNearBottom,
  nearTopThreshold = 150,
  nearBottomThreshold = 150,
  scrollToBottom = false,
  scrollToMessageId,
  onStickToBottomChange,
}: VirtualContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(800);
  const stickToBottomRef = useRef(true);
  const lastScrollHeightRef = useRef(0);
  const isScrollingProgrammaticallyRef = useRef(false);
  const scrollRAFRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (scrollToBottom && stickToBottomRef.current) {
      const scrollHeight = container.scrollHeight;
      if (scrollHeight !== lastScrollHeightRef.current) {
        lastScrollHeightRef.current = scrollHeight;
        isScrollingProgrammaticallyRef.current = true;
        scrollRAFRef.current = requestAnimationFrame(() => {
          container.scrollTop = scrollHeight;
          setTimeout(() => {
            isScrollingProgrammaticallyRef.current = false;
          }, 100);
        });
      }
    }
  });

  useEffect(() => {
    if (scrollToMessageId) {
      const container = containerRef.current;
      if (!container) return;

      requestAnimationFrame(() => {
        const el = container.querySelector(
          `[data-msg-id="${scrollToMessageId}"]`,
        );
        if (el) {
          isScrollingProgrammaticallyRef.current = true;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("highlight-flash");
          setTimeout(() => {
            el.classList.remove("highlight-flash");
            isScrollingProgrammaticallyRef.current = false;
          }, 2000);
        }
      });
    }
  }, [scrollToMessageId]);

  useEffect(() => {
    return () => {
      if (scrollRAFRef.current) {
        cancelAnimationFrame(scrollRAFRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(
    (e: Event) => {
      if (isScrollingProgrammaticallyRef.current) return;

      const target = e.currentTarget as HTMLDivElement;
      const newScrollTop = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;
      const distanceFromBottom = scrollHeight - newScrollTop - clientHeight;

      const wasStuckToBottom = stickToBottomRef.current;
      stickToBottomRef.current = distanceFromBottom < 50;

      if (wasStuckToBottom !== stickToBottomRef.current) {
        onStickToBottomChange?.(stickToBottomRef.current);
      }

      const isScrollingUp = newScrollTop < prevScrollTopRef.current;
      prevScrollTopRef.current = newScrollTop;

      onScroll?.(newScrollTop);

      if (newScrollTop < nearTopThreshold && onNearTop) {
        onNearTop();
      }

      if (distanceFromBottom < nearBottomThreshold && onNearBottom) {
        onNearBottom();
      }
    },
    [
      onScroll,
      onNearTop,
      onNearBottom,
      nearTopThreshold,
      nearBottomThreshold,
      onStickToBottomChange,
    ],
  );

  return (
    <div
      ref={containerRef}
      id="messages"
      className={className}
      onScroll={handleScroll}
      style={{
        contain: "content",
      }}
    >
      {children}
    </div>
  );
}

export const MemoVirtualMessageContainer = memo(VirtualMessageContainer);
