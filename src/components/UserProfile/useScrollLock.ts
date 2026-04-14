import { useEffect, useRef, useState, useCallback } from "preact/hooks";

const NEAR_BOTTOM_THRESHOLD = 80;
const NEAR_TOP_THRESHOLD = 150;
const OVERSCROLL_PADDING = 500;

interface UseScrollLockOptions {
  /** Called when the user scrolls to near the top and older messages should load. */
  onLoadOlder: () => void;
  /** Whether an older-messages load is already in flight. */
  isLoadingOlder: boolean;
  /** Called after older messages have been prepended and scroll position compensated. */
  onOlderLoaded: () => void;
  /** Optional: called when messages should be unloaded from one end */
  onUnloadMessages?: (count: number, fromStart: boolean) => void;
  /** Optional: called when user scrolls near bottom but not at bottom to load newer messages */
  onLoadNewer?: () => void;
  /** Optional: whether a newer-messages load is already in flight */
  isLoadingNewer?: boolean;
  /** Optional: called after newer messages have been appended */
  onNewerLoaded?: () => void;
}

function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef<T>(fn);
  ref.current = fn;
  return useCallback((...args: any[]) => ref.current(...args), []) as T;
}

interface UseScrollLockResult {
  containerRef: { current: HTMLDivElement | null };
  showScrollBtn: boolean;
  scrollToBottom: () => void;
  scrollToMessage: (messageId: string) => void;
  resetForChannel: () => void;
  beginLoadOlder: () => void;
  beginLoadNewer: () => void;
  overscrollPadding: number;
  topSentinelRef: (el: HTMLDivElement | null) => void;
  bottomSentinelRef: (el: HTMLDivElement | null) => void;
}

export function useScrollLock({
  onLoadOlder,
  isLoadingOlder,
  onOlderLoaded,
  onLoadNewer,
  isLoadingNewer,
  onNewerLoaded,
  onUnloadMessages,
}: UseScrollLockOptions): UseScrollLockResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const autoScroll = useRef(true);
  const pendingOlderLoad = useRef(false);
  const pendingNewerLoad = useRef(false);
  const loadOlderDebounce = useRef<number | null>(null);
  const loadNewerDebounce = useRef<number | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const isScrollingProgrammatically = useRef(false);
  const scrollRAF = useRef<number | null>(null);
  const prevScrollTop = useRef(0);
  const lastScrollDirection = useRef<"up" | "down" | null>(null);
  const lastContainerHeight = useRef(0);
  const topSentinelEl = useRef<HTMLDivElement | null>(null);
  const bottomSentinelEl = useRef<HTMLDivElement | null>(null);
  const [topSentinelMounted, setTopSentinelMounted] = useState(false);
  const [bottomSentinelMounted, setBottomSentinelMounted] = useState(false);

  const stableOnLoadOlder = useStableCallback(onLoadOlder);
  const stableOnOlderLoaded = useStableCallback(onOlderLoaded);
  const stableOnLoadNewer = onLoadNewer ? useStableCallback(onLoadNewer) : null;
  const stableOnNewerLoaded = onNewerLoaded ? useStableCallback(onNewerLoaded) : null;
  const stableOnUnloadMessages = onUnloadMessages ? useStableCallback(onUnloadMessages) : null;
  const isLoadingOlderRef = useRef(isLoadingOlder);
  isLoadingOlderRef.current = isLoadingOlder;
  const isLoadingNewerRef = useRef(isLoadingNewer || false);
  isLoadingNewerRef.current = isLoadingNewer || false;

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    cancelAnimationFrame(scrollRAF.current!);
    isScrollingProgrammatically.current = true;
    scrollRAF.current = requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
      autoScroll.current = true;
      setShowScrollBtn(false);
      setTimeout(() => {
        isScrollingProgrammatically.current = false;
      }, 500);
    });
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = containerRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      const targetEl = el.querySelector(`[data-msg-id="${messageId}"]`);
      if (targetEl) {
        isScrollingProgrammatically.current = true;
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        targetEl.classList.add("highlight-flash");
        setTimeout(() => {
          targetEl.classList.remove("highlight-flash");
          isScrollingProgrammatically.current = false;
        }, 2000);
      }
    });
  }, []);

  const resetForChannel = useCallback(() => {
    autoScroll.current = true;
    pendingOlderLoad.current = false;
    setShowScrollBtn(false);
    lastScrollDirection.current = null;
    if (loadOlderDebounce.current !== null) {
      clearTimeout(loadOlderDebounce.current);
      loadOlderDebounce.current = null;
    }
  }, []);

  const beginLoadOlder = useCallback(() => {
    pendingOlderLoad.current = true;
  }, []);

  const beginLoadNewer = useCallback(() => {
    pendingNewerLoad.current = true;
  }, []);

  const topSentinelRef = useCallback((el: HTMLDivElement | null) => {
    topSentinelEl.current = el;
    setTopSentinelMounted(!!el);
  }, []);

  const bottomSentinelRef = useCallback((el: HTMLDivElement | null) => {
    bottomSentinelEl.current = el;
    setBottomSentinelMounted(!!el);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const UNLOAD_THRESHOLD_PX = 2000;
    const UNLOAD_COUNT = 50;

    const onScroll = () => {
      if (isScrollingProgrammatically.current) return;

      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
      const nearTop = el.scrollTop < NEAR_TOP_THRESHOLD;

      const currentScrollTop = el.scrollTop;
      const scrollDirection = currentScrollTop < prevScrollTop.current ? "up" : "down";
      if (scrollDirection !== lastScrollDirection.current) {
        lastScrollDirection.current = scrollDirection;
      }
      prevScrollTop.current = currentScrollTop;

      autoScroll.current = nearBottom;
      setShowScrollBtn(!nearBottom);

      // Unload messages when scrolled far away from them
      if (stableOnUnloadMessages) {
        if (scrollDirection === "down" && el.scrollTop > UNLOAD_THRESHOLD_PX) {
          // Scrolled down, can unload older messages from the top
          stableOnUnloadMessages(UNLOAD_COUNT, true);
        } else if (scrollDirection === "up" && distanceFromBottom > UNLOAD_THRESHOLD_PX) {
          // Scrolled up, can unload newer messages from the bottom
          stableOnUnloadMessages(UNLOAD_COUNT, false);
        }
      }

      // Load newer messages when near bottom but not at bottom
      if (
        stableOnLoadNewer &&
        nearBottom &&
        !autoScroll.current &&
        distanceFromBottom > 5 &&
        !pendingNewerLoad.current &&
        !isLoadingNewerRef.current
      ) {
        if (loadNewerDebounce.current !== null) return;
        loadNewerDebounce.current = window.setTimeout(() => {
          loadNewerDebounce.current = null;
          if (pendingNewerLoad.current || isLoadingNewerRef.current) return;
          stableOnLoadNewer();
        }, 300);
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (loadNewerDebounce.current !== null) {
        clearTimeout(loadNewerDebounce.current);
        loadNewerDebounce.current = null;
      }
    };
  }, [stableOnLoadNewer, stableOnUnloadMessages]);

  useEffect(() => {
    const sentinel = topSentinelEl.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isLoadingOlderRef.current && !pendingOlderLoad.current) {
            stableOnLoadOlder();
          }
        }
      },
      { threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [stableOnLoadOlder, topSentinelMounted]);

  useEffect(() => {
    const sentinel = bottomSentinelEl.current;
    if (!sentinel || !stableOnLoadNewer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isLoadingNewerRef.current && !pendingNewerLoad.current) {
            stableOnLoadNewer();
          }
        }
      },
      { threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [stableOnLoadNewer, bottomSentinelMounted]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let prevScrollHeight = el.scrollHeight;
    let rafId: number | null = null;
    let olderLoadGeneration = 0;

    const observer = new MutationObserver((mutations) => {
      const newScrollHeight = el.scrollHeight;
      const heightAdded = newScrollHeight - prevScrollHeight;
      prevScrollHeight = newScrollHeight;

      // Check if actual message content was added (not just skeleton)
      const hasNewMessages = mutations.some((m) => {
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof HTMLElement) {
            if (node.querySelector("[data-msg-id]") || node.hasAttribute("data-msg-id")) {
              return true;
            }
          }
        }
        return false;
      });

      if (pendingOlderLoad.current && hasNewMessages) {
        cancelAnimationFrame(rafId!);
        if (heightAdded > 0) {
          rafId = requestAnimationFrame(() => {
            el.scrollTop += heightAdded;
          });
        }
        pendingOlderLoad.current = false;
        stableOnOlderLoaded();
        return;
      }

      if (pendingNewerLoad.current && hasNewMessages) {
        pendingNewerLoad.current = false;
        if (stableOnNewerLoaded) {
          stableOnNewerLoaded();
        }
        return;
      }

      if (autoScroll.current) {
        cancelAnimationFrame(rafId!);
        rafId = requestAnimationFrame(() => {
          el.scrollTop = newScrollHeight;
        });
      }
    });

    observer.observe(el, { childList: true, subtree: true });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newHeight = entry.contentRect.height;
        const heightDiff = newHeight - lastContainerHeight.current;
        lastContainerHeight.current = newHeight;
      }
    });

    lastContainerHeight.current = el.clientHeight;
    resizeObserver.observe(el);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [stableOnOlderLoaded, stableOnNewerLoaded]);

  useEffect(() => {
    return () => {
      if (scrollRAF.current) cancelAnimationFrame(scrollRAF.current);
    };
  }, []);

  return {
    containerRef,
    showScrollBtn,
    scrollToBottom,
    scrollToMessage,
    resetForChannel,
    beginLoadOlder,
    beginLoadNewer,
    overscrollPadding: OVERSCROLL_PADDING,
    topSentinelRef,
    bottomSentinelRef,
  };
}
