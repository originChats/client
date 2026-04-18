import { typingUsersByServer } from "../state";

const CLEANUP_INTERVAL = 60_000;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startMemoryCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    cleanupTypingIndicators();
  }, CLEANUP_INTERVAL);
}

export function stopMemoryCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

function cleanupTypingIndicators(): void {
  const now = Date.now();
  const serverUrls = typingUsersByServer.keys();
  const serversToDelete: string[] = [];

  for (const sUrl of serverUrls) {
    const channels = typingUsersByServer.read(sUrl);
    if (!channels || Object.keys(channels).length === 0) {
      serversToDelete.push(sUrl);
      continue;
    }

    const newChannels: Record<string, Map<string, number>> = {};
    let serverChanged = false;

    for (const [channel, users] of Object.entries(channels)) {
      const map = users as Map<string, number>;
      const newMap = new Map<string, number>();
      for (const [user, expiry] of map.entries()) {
        if (expiry >= now) {
          newMap.set(user, expiry);
        } else {
          serverChanged = true;
        }
      }
      if (newMap.size > 0) {
        newChannels[channel] = newMap;
      } else {
        serverChanged = true;
      }
    }

    if (serverChanged) {
      if (Object.keys(newChannels).length > 0) {
        typingUsersByServer.set(sUrl, newChannels);
      } else {
        serversToDelete.push(sUrl);
      }
    }
  }

  for (const sUrl of serversToDelete) {
    typingUsersByServer.delete(sUrl);
  }
}
