import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "preact/hooks";
import { memo } from "preact/compat";
import type { ComponentChildren } from "preact";

interface VirtualListProps<T> {
  items: T[];
  getItemKey: (item: T, index: number) => string;
  estimateHeight: number;
  overscan?: number;
  children: (item: T, index: number) => ComponentChildren;
  className?: string;
  onScroll?: (scrollTop: number) => void;
  onNearTop?: () => void;
  onNearBottom?: () => void;
  nearTopThreshold?: number;
  nearBottomThreshold?: number;
  scrollToBottom?: boolean;
  scrollToIndex?: number;
  onItemsRendered?: (startIndex: number, endIndex: number) => void;
}

const MAX_MEASURED_HEIGHTS = 500;

interface MeasuredHeights {
  heights: Map<string, number>;
  positions: number[];
  totalHeight: number;
}

export function VirtualMessageList<T>({
  items,
  getItemKey,
  estimateHeight,
  overscan = 5,
  children,
  className,
  onScroll,
  onNearTop,
  onNearBottom,
  nearTopThreshold = 200,
  nearBottomThreshold = 200,
  scrollToBottom = false,
  scrollToIndex,
  onItemsRendered,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const measuredHeightsRef = useRef<Map<string, number>>(new Map());
  const stickToBottomRef = useRef(true);
  const lastScrollHeightRef = useRef(0);
  const scrollAnimationRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef(0);

  const measureRef = useCallback(
    (key: string) => (el: HTMLDivElement | null) => {
      if (el) {
        const height = el.getBoundingClientRect().height;
        const currentMeasured = measuredHeightsRef.current.get(key);
        if (currentMeasured !== height) {
          measuredHeightsRef.current.set(key, height);
          if (measuredHeightsRef.current.size > MAX_MEASURED_HEIGHTS) {
            const keys = [...measuredHeightsRef.current.keys()];
            const toRemove = keys.slice(0, keys.length - MAX_MEASURED_HEIGHTS);
            for (const k of toRemove) {
              measuredHeightsRef.current.delete(k);
            }
          }
        }
      }
    },
    [],
  );

  const { positions, totalHeight, measuredKeys } = useMemo(() => {
    const heights = measuredHeightsRef.current;
    const positions: number[] = [];
    let currentPos = 0;
    const measuredKeys = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      const key = getItemKey(items[i], i);
      positions.push(currentPos);
      const measuredHeight = heights.get(key);
      if (measuredHeight !== undefined) {
        currentPos += measuredHeight;
        measuredKeys.add(key);
      } else {
        currentPos += estimateHeight;
      }
    }

    return {
      positions,
      totalHeight: currentPos,
      measuredKeys,
    };
  }, [items, getItemKey, estimateHeight]);

  const startIndex = useMemo(() => {
    let low = 0;
    let high = items.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (positions[mid] < scrollTop - estimateHeight * overscan) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return Math.max(0, low - overscan);
  }, [positions, scrollTop, overscan, estimateHeight, items.length]);

  const endIndex = useMemo(() => {
    const bottom = scrollTop + viewportHeight + estimateHeight * overscan;
    let idx = startIndex;
    while (idx < items.length && positions[idx] < bottom) {
      idx++;
    }
    return Math.min(items.length - 1, idx + overscan);
  }, [
    positions,
    scrollTop,
    viewportHeight,
    startIndex,
    overscan,
    estimateHeight,
    items.length,
  ]);

  const visibleItems = useMemo(() => {
    const result: {
      item: T;
      index: number;
      key: string;
      top: number;
      height: number;
    }[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      const item = items[i];
      if (item !== undefined) {
        const key = getItemKey(item, i);
        const height = measuredHeightsRef.current.get(key) || estimateHeight;
        result.push({
          item,
          index: i,
          key,
          top: positions[i],
          height,
        });
      }
    }
    return result;
  }, [items, startIndex, endIndex, positions, getItemKey, estimateHeight]);

  useEffect(() => {
    onItemsRendered?.(startIndex, endIndex);
  }, [startIndex, endIndex, onItemsRendered]);

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

    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;

    if (scrollToBottom && stickToBottomRef.current && isNearBottom) {
      if (scrollHeight !== lastScrollHeightRef.current) {
        lastScrollHeightRef.current = scrollHeight;
        cancelAnimationFrame(scrollAnimationRef.current!);
        scrollAnimationRef.current = requestAnimationFrame(() => {
          container.scrollTop = scrollHeight;
        });
      }
    }
    return () => {
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current);
      }
    };
  }, [items, scrollToBottom, scrollTop]);

  useEffect(() => {
    if (
      scrollToIndex !== undefined &&
      scrollToIndex >= 0 &&
      scrollToIndex < items.length
    ) {
      const container = containerRef.current;
      if (!container) return;

      const targetTop = positions[scrollToIndex] || 0;
      const viewportMiddle = viewportHeight / 2;
      const targetScrollTop = Math.max(
        0,
        targetTop - viewportMiddle + estimateHeight / 2,
      );

      cancelAnimationFrame(scrollAnimationRef.current!);
      scrollAnimationRef.current = requestAnimationFrame(() => {
        container.scrollTo({
          top: targetScrollTop,
          behavior: "smooth",
        });
      });
    }
    return () => {
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current);
      }
    };
  }, [scrollToIndex, positions, viewportHeight, estimateHeight, items.length]);

  const handleScroll = useCallback(
    (e: Event) => {
      const target = e.currentTarget as HTMLDivElement;
      const newScrollTop = target.scrollTop;
      const scrollHeight = target.scrollHeight;
      const clientHeight = target.clientHeight;

      stickToBottomRef.current =
        scrollHeight - newScrollTop - clientHeight < 50;

      const isScrollingUp = newScrollTop < prevScrollTopRef.current;
      prevScrollTopRef.current = newScrollTop;

      setScrollTop(newScrollTop);
      onScroll?.(newScrollTop);

      if (newScrollTop < nearTopThreshold && onNearTop) {
        onNearTop();
      }

      if (
        scrollHeight - newScrollTop - clientHeight < nearBottomThreshold &&
        onNearBottom
      ) {
        onNearBottom();
      }
    },
    [onScroll, onNearTop, onNearBottom, nearTopThreshold, nearBottomThreshold],
  );

  useEffect(() => {
    return () => {
      if (scrollAnimationRef.current) {
        cancelAnimationFrame(scrollAnimationRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      onScroll={handleScroll}
      style={{
        overflowY: "auto",
        position: "relative",
        height: "100%",
        contain: "strict",
      }}
    >
      <div
        style={{
          height: totalHeight,
          position: "relative",
        }}
      >
        {visibleItems.map(({ item, index, key, top }) => (
          <div
            key={key}
            ref={measureRef(key)}
            data-virtual-key={key}
            style={{
              position: "absolute",
              top: `${top}px`,
              left: 0,
              right: 0,
            }}
          >
            {children(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export const MemoVirtualMessageList = memo(
  VirtualMessageList,
) as typeof VirtualMessageList;
