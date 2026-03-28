import { useMemo, useCallback } from "preact/hooks";
import { messagesByServer, serverUrl } from "../state";

const MAX_MESSAGES_IN_MEMORY = 500;
const UNLOAD_THRESHOLD = 100;

export function useMessageWindowing(
  messageKey: string | null,
  currentMessages: any[],
) {
  const sUrl = serverUrl.value;
  const overflowCount = currentMessages.length - MAX_MESSAGES_IN_MEMORY;
  const shouldUnload = overflowCount > UNLOAD_THRESHOLD;

  const visibleMessages = useMemo(() => {
    if (!shouldUnload) return currentMessages;

    const midpoint = Math.floor(currentMessages.length / 2);
    const halfWindow = Math.floor(MAX_MESSAGES_IN_MEMORY / 2);
    const start = Math.max(0, midpoint - halfWindow);
    const end = Math.min(currentMessages.length, midpoint + halfWindow);

    return currentMessages.slice(start, end);
  }, [currentMessages, shouldUnload]);

  const unloadDistantMessages = useCallback(
    (
      scrollDirection: "up" | "down",
      scrollTop: number,
      scrollHeight: number,
    ) => {
      if (currentMessages.length <= MAX_MESSAGES_IN_MEMORY) return;

      const messageWindow = {
        top: Math.floor(MAX_MESSAGES_IN_MEMORY * 0.3),
        bottom: Math.floor(MAX_MESSAGES_IN_MEMORY * 0.3),
      };

      if (scrollDirection === "up" && scrollTop < 200) {
        const toUnloadCount = Math.min(
          UNLOAD_THRESHOLD,
          currentMessages.length - MAX_MESSAGES_IN_MEMORY + 50,
        );
        if (toUnloadCount > 0) {
          const newMessages = currentMessages.slice(toUnloadCount);
          if (
            sUrl &&
            messageKey &&
            messagesByServer.value[sUrl]?.[messageKey]
          ) {
            messagesByServer.value = {
              ...messagesByServer.value,
              [sUrl]: {
                ...messagesByServer.value[sUrl],
                [messageKey]: newMessages,
              },
            };
          }
        }
      } else if (
        scrollDirection === "down" &&
        scrollHeight - scrollTop - 800 < 200
      ) {
        const toUnloadCount = Math.min(
          UNLOAD_THRESHOLD,
          currentMessages.length - MAX_MESSAGES_IN_MEMORY + 50,
        );
        if (toUnloadCount > 0) {
          const newMessages = currentMessages.slice(0, -toUnloadCount);
          if (
            sUrl &&
            messageKey &&
            messagesByServer.value[sUrl]?.[messageKey]
          ) {
            messagesByServer.value = {
              ...messagesByServer.value,
              [sUrl]: {
                ...messagesByServer.value[sUrl],
                [messageKey]: newMessages,
              },
            };
          }
        }
      }
    },
    [currentMessages, sUrl, messageKey],
  );

  return {
    visibleMessages: shouldUnload ? visibleMessages : currentMessages,
    unloadDistantMessages,
    hasMoreMessages: currentMessages.length > MAX_MESSAGES_IN_MEMORY,
  };
}
