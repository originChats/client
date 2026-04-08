import { emojiCache } from "./emoji-data-cache";

export async function loadShortcodes(): Promise<void> {
  await emojiCache.loadEmojiData();
}

export function getShortcodeMap(): Map<string, string> {
  return emojiCache.getShortcodeMap();
}

export function lookupShortcode(key: string): string | undefined {
  return emojiCache.lookupShortcode(key);
}
