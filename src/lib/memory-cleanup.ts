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
  const servers = typingUsersByServer.value;

  for (const [sUrl, channels] of Object.entries(servers)) {
    for (const [channel, users] of Object.entries(channels)) {
      const map = users as Map<string, number>;
      for (const [user, expiry] of map.entries()) {
        if (expiry < now) {
          map.delete(user);
        }
      }
      if (map.size === 0) {
        delete (channels as Record<string, Map<string, number>>)[channel];
      }
    }
    if (Object.keys(channels).length === 0) {
      delete servers[sUrl];
    }
  }
}
