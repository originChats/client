import type { EmojiGetAll, EmojiAdd, EmojiDelete, EmojiUpdate } from "@/msgTypes";
import type { CustomEmoji } from "../../../types";
import { customEmojisByServer } from "../../../state";
import { emojiCache } from "../../emoji-data-cache";
import { invalidateCustomEmojiIndex } from "../../markdown";

export function handleEmojiGetAll(msg: EmojiGetAll, sUrl: string): void {
  const emojis: Record<string, { name: string; fileName: string }> = msg.emojis || {};
  const mapped: Record<string, CustomEmoji> = {};
  for (const [id, e] of Object.entries(emojis)) {
    mapped[id] = { id, name: e.name, fileName: e.fileName };
  }
  customEmojisByServer.set(sUrl, mapped);
  emojiCache.invalidateCustomEmojiCache();
  invalidateCustomEmojiIndex();
}

export function handleEmojiAdd(msg: EmojiAdd, sUrl: string): void {
  if (msg.added && msg.id !== undefined) {
    const newEmoji: CustomEmoji = {
      id: String(msg.id),
      name: msg.name,
      fileName: msg.fileName || `${msg.id}`,
    };
    if (!customEmojisByServer.has(sUrl)) {
      customEmojisByServer.set(sUrl, { [newEmoji.id]: newEmoji });
    } else {
      customEmojisByServer.update(sUrl, (current) => ({
        ...current,
        [newEmoji.id]: newEmoji,
      }));
    }
    emojiCache.invalidateCustomEmojiCache();
    invalidateCustomEmojiIndex();
  }
}

export function handleEmojiDelete(msg: EmojiDelete, sUrl: string): void {
  if (msg.deleted) {
    customEmojisByServer.update(sUrl, (serverEmojis) => {
      if (!serverEmojis) return serverEmojis;
      const next = { ...serverEmojis };
      delete next[String(msg.id)];
      return next;
    });
    emojiCache.invalidateCustomEmojiCache();
    invalidateCustomEmojiIndex();
  }
}

export function handleEmojiUpdate(msg: EmojiUpdate, sUrl: string): void {
  if (msg.updated && msg.id !== undefined) {
    customEmojisByServer.update(sUrl, (serverEmojis) => {
      const existing = serverEmojis?.[String(msg.id)];
      if (!existing) return serverEmojis;
      return {
        ...serverEmojis,
        [String(msg.id)]: {
          ...existing,
          ...(msg.name ? { name: msg.name } : {}),
          ...(msg.fileName ? { fileName: msg.fileName } : {}),
        },
      };
    });
    emojiCache.invalidateCustomEmojiCache();
    invalidateCustomEmojiIndex();
  }
}
