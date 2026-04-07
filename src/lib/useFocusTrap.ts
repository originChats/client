import { useEffect, useRef } from "preact/hooks";

export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    previousActiveElement.current = document.activeElement as HTMLElement;
    const container = containerRef.current;

    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    setTimeout(() => firstElement?.focus(), 0);
    container.addEventListener("keydown", handleTabKey);

    return () => {
      container.removeEventListener("keydown", handleTabKey);
      previousActiveElement.current?.focus();
    };
  }, [isActive]);

  return containerRef;
}

function useFocusRestoration(isActive: boolean) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [isActive]);
}
