import type {
  EmojiGetAll,
  EmojiAdd,
  EmojiDelete,
  EmojiUpdate,
} from "@/msgTypes";
import type { CustomEmoji } from "../../../types";
import { customEmojisByServer } from "../../../state";
import { emojiCache } from "../../emoji-data-cache";
import { invalidateCustomEmojiIndex } from "../../markdown";

export function handleEmojiGetAll(msg: EmojiGetAll, sUrl: string): void {
  const emojis: Record<string, { name: string; fileName: string }> =
    msg.emojis || {};
  const mapped: Record<string, CustomEmoji> = {};
  for (const [id, e] of Object.entries(emojis)) {
    mapped[id] = { id, name: e.name, fileName: e.fileName };
  }

  if (!customEmojisByServer.value[sUrl]) {
    customEmojisByServer.value = {
      ...customEmojisByServer.value,
      [sUrl]: mapped,
    };
  } else {
    customEmojisByServer.value[sUrl] = mapped;
  }

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

    if (!customEmojisByServer.value[sUrl]) {
      customEmojisByServer.value = {
        ...customEmojisByServer.value,
        [sUrl]: { [newEmoji.id]: newEmoji },
      };
    } else {
      customEmojisByServer.value[sUrl][newEmoji.id] = newEmoji;
    }

    emojiCache.invalidateCustomEmojiCache();
    invalidateCustomEmojiIndex();
  }
}

export function handleEmojiDelete(msg: EmojiDelete, sUrl: string): void {
  if (msg.deleted) {
    const serverEmojis = customEmojisByServer.value[sUrl];
    if (serverEmojis) {
      delete serverEmojis[String(msg.id)];
      emojiCache.invalidateCustomEmojiCache();
      invalidateCustomEmojiIndex();
    }
  }
}

export function handleEmojiUpdate(msg: EmojiUpdate, sUrl: string): void {
  if (msg.updated && msg.id !== undefined) {
    const existing = customEmojisByServer.value[sUrl]?.[String(msg.id)];
    if (existing) {
      if (msg.name) existing.name = msg.name;
      if (msg.fileName) existing.fileName = msg.fileName;
      emojiCache.invalidateCustomEmojiCache();
      invalidateCustomEmojiIndex();
    }
  }
}
