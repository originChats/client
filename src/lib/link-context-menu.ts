import type { ContextMenuItem } from "../components/ContextMenu";
import { downloadAttachment } from "./download-attachment";

function getLinkFromContextMenuEvent(e: MouseEvent): string | null {
  const target = e.target as HTMLElement;
  const link = target.closest("a");
  if (!link) return null;

  const href = link.getAttribute("href");
  if (!href) return null;

  return href;
}

function getImageFromContextMenuEvent(e: MouseEvent): { url: string; alt?: string } | null {
  const target = e.target as HTMLElement;

  if (target.tagName === "IMG") {
    const img = target as HTMLImageElement;
    const url = img.src;
    if (!url) return null;
    return { url, alt: img.alt };
  }

  const link = target.closest("a");
  if (link) {
    const img = link.querySelector("img");
    if (img) {
      const url = img.src;
      if (!url) return null;
      return { url, alt: img.alt };
    }
  }

  return null;
}

function getReactionFromContextMenuEvent(
  e: MouseEvent
): { emoji: string; element: HTMLElement } | null {
  const target = e.target as HTMLElement;
  const reaction = target.closest(".reaction") as HTMLElement;
  if (!reaction) return null;

  const emojiImg = reaction.querySelector(".reaction-emoji") as HTMLImageElement;
  const emojiSpan = reaction.querySelector(".reaction-emoji.reaction-emoji-system");

  if (emojiImg) {
    return { emoji: emojiImg.alt || emojiImg.src, element: reaction };
  } else if (emojiSpan) {
    return { emoji: emojiSpan.textContent || "", element: reaction };
  }

  return null;
}

function createCopyLinkMenuItem(linkUrl: string): ContextMenuItem {
  return {
    label: "Copy Link",
    icon: "Link",
    fn: () => {
      navigator.clipboard.writeText(linkUrl).catch(() => {});
    },
  };
}

function createCopyImageMenuItem(imageUrl: string): ContextMenuItem {
  return {
    label: "Copy Image URL",
    icon: "Image",
    fn: () => {
      navigator.clipboard.writeText(imageUrl).catch(() => {});
    },
  };
}

function createOpenImageMenuItem(imageUrl: string): ContextMenuItem {
  return {
    label: "Open Image",
    icon: "ExternalLink",
    fn: () => {
      window.open(imageUrl, "_blank", "noopener,noreferrer");
    },
  };
}

function createSaveImageMenuItem(imageUrl: string, filename?: string): ContextMenuItem {
  return {
    label: "Save Image",
    icon: "Download",
    fn: () => {
      const name = filename || imageUrl.split("/").pop() || "download";
      downloadAttachment(imageUrl, name);
    },
  };
}

function addLinkContextMenuItem(e: MouseEvent, items: ContextMenuItem[]): ContextMenuItem[] {
  const linkUrl = getLinkFromContextMenuEvent(e);
  if (!linkUrl) return items;

  const copyLinkItem = createCopyLinkMenuItem(linkUrl);
  const copyTextIndex = items.findIndex((item) => item.label === "Copy text");

  if (copyTextIndex !== -1) {
    const newItems = [...items];
    newItems.splice(copyTextIndex + 1, 0, copyLinkItem);
    return newItems;
  }

  return [...items, copyLinkItem];
}

function addImageContextMenuItem(e: MouseEvent, items: ContextMenuItem[]): ContextMenuItem[] {
  const imageData = getImageFromContextMenuEvent(e);
  if (!imageData) return items;

  const imageItems: ContextMenuItem[] = [
    createCopyImageMenuItem(imageData.url),
    createOpenImageMenuItem(imageData.url),
    createSaveImageMenuItem(imageData.url),
  ];

  const copyTextIndex = items.findIndex((item) => item.label === "Copy text");

  if (copyTextIndex !== -1) {
    const newItems = [...items];
    newItems.splice(copyTextIndex + 1, 0, ...imageItems);
    return newItems;
  }

  return [...imageItems, ...items];
}

function addReactionContextMenuItem(
  e: MouseEvent,
  items: ContextMenuItem[],
  onViewReactions: (emoji: string) => void
): ContextMenuItem[] {
  const reactionData = getReactionFromContextMenuEvent(e);
  if (!reactionData) return items;

  const reactionItems: ContextMenuItem[] = [
    {
      label: "View Reactions",
      icon: "Users",
      fn: () => onViewReactions(reactionData.emoji),
    },
  ];

  const separatorIndex = items.findIndex((item) => item.separator);

  if (separatorIndex !== -1) {
    const newItems = [...items];
    newItems.splice(separatorIndex, 0, ...reactionItems);
    return newItems;
  }

  return [...reactionItems, ...items];
}

export function addUniversalContextMenuItems(
  e: MouseEvent,
  items: ContextMenuItem[],
  options?: {
    onViewReactions?: (emoji: string) => void;
  }
): ContextMenuItem[] {
  let newItems = items;

  const imageData = getImageFromContextMenuEvent(e);
  const linkUrl = getLinkFromContextMenuEvent(e);
  const reactionData = getReactionFromContextMenuEvent(e);

  if (imageData && !linkUrl) {
    newItems = addImageContextMenuItem(e, newItems);
  } else if (linkUrl) {
    newItems = addLinkContextMenuItem(e, newItems);
  }

  if (reactionData && options?.onViewReactions) {
    newItems = addReactionContextMenuItem(e, newItems, options.onViewReactions);
  }

  return newItems;
}
