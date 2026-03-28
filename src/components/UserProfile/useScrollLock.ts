import { useEffect, useRef, useState, useCallback } from "preact/hooks";

const NEAR_BOTTOM_THRESHOLD = 80;
const MAX_MESSAGES = 500;
const UNLOAD_BUFFER = 50;

interface UseScrollLockOptions {
  /** Called when the user scrolls to near the top and older messages should load. */
  onLoadOlder: () => void;
  /** Whether an older-messages load is already in flight. */
  isLoadingOlder: boolean;
  /** Called after older messages have been prepended and scroll position compensated. */
  onOlderLoaded: () => void;
  /** Optional: called when messages should be unloaded from one end */
  onUnloadMessages?: (count: number, fromStart: boolean) => void;
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
  /** Call when the channel changes so the lock resets and view snaps to bottom. */
  resetForChannel: () => void;
  /** Call before prepending older messages so height compensation is applied. */
  beginLoadOlder: () => void;
}

export function useScrollLock({
  onLoadOlder,
  isLoadingOlder,
  onOlderLoaded,
  onUnloadMessages,
}: UseScrollLockOptions): UseScrollLockResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const autoScroll = useRef(true);
  const pendingOlderLoad = useRef(false);
  const loadOlderDebounce = useRef<number | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const isScrollingProgrammatically = useRef(false);
  const scrollRAF = useRef<number | null>(null);
  const prevScrollTop = useRef(0);
  const lastScrollDirection = useRef<"up" | "down" | null>(null);

  const stableOnLoadOlder = useStableCallback(onLoadOlder);
  const stableOnOlderLoaded = useStableCallback(onOlderLoaded);
  const isLoadingOlderRef = useRef(isLoadingOlder);
  isLoadingOlderRef.current = isLoadingOlder;

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      if (isScrollingProgrammatically.current) return;

      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;

      const currentScrollTop = el.scrollTop;
      const scrollDirection =
        currentScrollTop < prevScrollTop.current ? "up" : "down";
      if (scrollDirection !== lastScrollDirection.current) {
        lastScrollDirection.current = scrollDirection;
      }
      prevScrollTop.current = currentScrollTop;

      autoScroll.current = nearBottom;
      setShowScrollBtn(!nearBottom);

      if (
        el.scrollTop <= 10 &&
        !isLoadingOlderRef.current &&
        !pendingOlderLoad.current
      ) {
        if (loadOlderDebounce.current !== null) return;
        loadOlderDebounce.current = window.setTimeout(() => {
          loadOlderDebounce.current = null;
          const container = containerRef.current;
          if (
            !container ||
            container.scrollTop > 10 ||
            pendingOlderLoad.current
          )
            return;
          stableOnLoadOlder();
        }, 300);
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (loadOlderDebounce.current !== null) {
        clearTimeout(loadOlderDebounce.current);
        loadOlderDebounce.current = null;
      }
    };
  }, [stableOnLoadOlder]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let prevScrollHeight = el.scrollHeight;
    let rafId: number | null = null;

    const observer = new MutationObserver(() => {
      const newScrollHeight = el.scrollHeight;
      const heightAdded = newScrollHeight - prevScrollHeight;
      prevScrollHeight = newScrollHeight;

      if (pendingOlderLoad.current && heightAdded > 0) {
        cancelAnimationFrame(rafId!);
        rafId = requestAnimationFrame(() => {
          el.scrollTop += heightAdded;
        });
        pendingOlderLoad.current = false;
        if (el.scrollTop <= 10 && loadOlderDebounce.current === null) {
          loadOlderDebounce.current = window.setTimeout(() => {
            loadOlderDebounce.current = null;
          }, 300);
        }
        stableOnOlderLoaded();
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
    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [stableOnOlderLoaded]);

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
  };
}
