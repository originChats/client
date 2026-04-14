import { useState, useEffect, useMemo, useRef } from "preact/hooks";
import { memo } from "preact/compat";
import DOMPurify from "dompurify";
import { parseMarkdown } from "../../lib/markdown";
import type { MentionContext } from "../../lib/markdown";
import styles from "./MessageContent.module.css";
import {
  detectEmbedType,
  isTenorOnlyMessage,
  proxyImageUrl,
} from "../../lib/embeds/utils";
import { Embed } from "../../lib/embeds/index";
import type { EmbedInfo } from "../../lib/embeds/types";
import { MessageEmbed } from "../MessageEmbed";
import type { MessageEmbed as MessageEmbedType } from "../../types";
import { users, channels, rolesByServer, serverUrl } from "../../state";
import {
  getCachedImage,
  getCachedImageSync,
  scheduleCleanup,
} from "../../lib/image-cache";

const parseMemoCache = new Map<
  string,
  { html: string; embedLinks: string[] }
>();
const MAX_PARSE_CACHE = 200;

const IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
];

function hasImageExtension(url: string): boolean {
  const urlLower = url.toLowerCase();
  return IMAGE_EXTENSIONS.some(
    (ext) =>
      urlLower.endsWith(`.${ext}`) ||
      urlLower.includes(`.${ext}?`) ||
      urlLower.includes(`.${ext}#`),
  );
}

interface MessageContentProps {
  content: string;
  currentUsername?: string;
  authorUsername?: string;
  messageId?: string;
  pings?: {
    users: string[];
    roles: string[];
    replies: string[];
  };
  messageEmbeds?: MessageEmbedType[];
  isReply?: boolean;
}

const SINGLE_EMOJI_RE =
  /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*[\u{1F3FB}-\u{1F3FF}]?$/u;

const CUSTOM_EMOJI_RE = /^originChats:<emoji>\/\/[^\/\s]+\/[^\s]+$/;

function isEmojiOnlyMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (SINGLE_EMOJI_RE.test(trimmed)) return true;
  if (CUSTOM_EMOJI_RE.test(trimmed)) return true;

  const withoutCustomEmojis = trimmed.replace(
    /originChats:<emoji>\/\/[^\/\s]+\/[^\s]+/g,
    "",
  );

  const remaining = withoutCustomEmojis.replace(
    /[\p{Emoji_Presentation}\p{Emoji}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\s]/gu,
    "",
  );

  return remaining.length === 0;
}

function MessageContentInner({
  content,
  currentUsername,
  authorUsername,
  messageId,
  pings,
  messageEmbeds,
  isReply,
}: MessageContentProps) {
  const [embeds, setEmbeds] = useState<EmbedInfo[]>([]);
  const [inlineImages, setInlineImages] = useState<string[]>([]);
  const messageTextRef = useRef<HTMLDivElement>(null);

  const { html, embedLinks, isMentioned, isEmojiOnly } = useMemo(() => {
    const rolesMap = rolesByServer.value[serverUrl.value] || {};
    const roleColors: Record<string, string> = {};
    for (const [name, role] of Object.entries(rolesMap)) {
      if (role.color) {
        roleColors[name.toLowerCase()] = role.color;
      }
    }

    const authorRoles =
      (authorUsername
        ? users.value[authorUsername.toLowerCase()]?.roles
        : undefined) ?? [];

    const mentionableRoles = new Set<string>();
    for (const authorRole of authorRoles) {
      const roleDef =
        rolesMap[authorRole] ?? rolesMap[authorRole.toLowerCase()];
      if (!roleDef) continue;
      const perm = (roleDef.permissions as Record<string, any> | undefined)
        ?.mention_roles;
      if (perm === true) {
        for (const r of Object.keys(rolesMap)) {
          mentionableRoles.add(r.toLowerCase());
        }
        break;
      } else if (Array.isArray(perm)) {
        for (const r of perm) {
          mentionableRoles.add((r as string).toLowerCase());
        }
      }
    }

    const usernameToNickname: Record<string, string> = {};
    for (const [username, user] of Object.entries(users.value)) {
      if (user.nickname) {
        usernameToNickname[username.toLowerCase()] = user.nickname;
      }
    }

    const allRoles = new Set(Object.keys(rolesMap).map((r) => r.toLowerCase()));

    const mentionCtx: MentionContext = {
      validUsernames: new Set(
        Object.keys(users.value).map((u) => u.toLowerCase()),
      ),
      validChannels: new Set(
        channels.value.filter((c) => c.name).map((c) => c.name.toLowerCase()),
      ),
      validRoles: mentionableRoles,
      allRoles,
      roleColors,
      currentServerUrl: serverUrl.value,
      usernameToNickname,
    };
    const links: string[] = [];
    const parsed = parseMarkdown(content, links, mentionCtx);
    let mentioned = false;
    if (currentUsername && pings) {
      const currentUsernameLower = currentUsername.toLowerCase();
      const myRoles =
        users.value[currentUsernameLower]?.roles?.map((r) => r.toLowerCase()) ??
        [];
      const myRolesLower = new Set(myRoles);
      const mentionedRolesLower = (pings.roles || []).map((r) =>
        r.toLowerCase(),
      );

      mentioned =
        (pings.users || []).some(
          (u) => u.toLowerCase() === currentUsernameLower,
        ) ||
        mentionedRolesLower.some((r) => myRolesLower.has(r)) ||
        (pings.replies || []).some(
          (r) => r.toLowerCase() === currentUsernameLower,
        );
    }
    return {
      html: DOMPurify.sanitize(parsed, { ADD_ATTR: ["target"] }),
      embedLinks: links,
      isMentioned: mentioned,
      isEmojiOnly: isEmojiOnlyMessage(content),
    };
  }, [content, currentUsername, authorUsername]);

  const isTenorOnly = useMemo(
    () => isTenorOnlyMessage(embedLinks, content),
    [embedLinks, content],
  );

  const linksNeedingEmbeds = useMemo(
    () => embedLinks.filter((url) => !hasImageExtension(url)),
    [embedLinks],
  );

  useEffect(() => {
    setEmbeds([]);
    setInlineImages([]);

    if (linksNeedingEmbeds.length === 0) return;

    let cancelled = false;

    async function resolveEmbeds() {
      const results = await Promise.all(
        linksNeedingEmbeds.map((url) => detectEmbedType(url)),
      );
      if (!cancelled) {
        const imageUrls = results
          .filter((e) => e.type === "image")
          .map((e) => e.url);
        setInlineImages(imageUrls);
        setEmbeds(
          results.filter(
            (e) => e.type !== "unknown" && e.type !== "image",
          ) as EmbedInfo[],
        );
      }
    }

    resolveEmbeds();

    return () => {
      cancelled = true;
    };
  }, [content]);

  useEffect(() => {
    if (!messageTextRef.current) return;
    scheduleCleanup();

    const messageText = messageTextRef.current;
    const placeholders = messageText.querySelectorAll<HTMLDivElement>(
      "div.image-placeholder",
    );

    if (isReply) {
      placeholders.forEach((placeholder) => {
        placeholder.remove();
      });
      return;
    }

    placeholders.forEach((placeholder) => {
      const url = placeholder.dataset.imageUrl;
      if (!url) return;

      if (placeholder.dataset.processed) return;

      placeholder.className = "chat-image-wrapper";
      placeholder.removeAttribute("data-image-url");
      placeholder.dataset.processed = "true";

      const img = document.createElement("img");
      img.alt = "image";
      img.className = "message-image";
      img.dataset.imageUrl = url;
      img.loading = "lazy";
      const syncCached = getCachedImageSync(url);
      img.src = syncCached || proxyImageUrl(url);

      placeholder.appendChild(img);

      if (!syncCached) {
        getCachedImage(url).then((cached) => {
          if (cached && img.parentNode) {
            img.src = cached;
          }
        });
      }
    });

    const potentialLinks =
      messageText.querySelectorAll<HTMLAnchorElement>("a.potential-image");

    potentialLinks.forEach((link) => {
      const url = link.dataset.imageUrl;
      if (!url) return;

      const isDetectedImage = inlineImages.some(
        (imgUrl) => imgUrl === url || imgUrl === link.href,
      );

      if (!isDetectedImage) return;

      if (link.dataset.converted) return;
      link.dataset.converted = "true";

      const wrapper = document.createElement("div");
      wrapper.className = "chat-image-wrapper";

      const img = document.createElement("img");
      img.alt = "image";
      img.className = "message-image";
      img.dataset.imageUrl = url;
      img.loading = "lazy";
      const syncCached = getCachedImageSync(url);
      img.src = syncCached || proxyImageUrl(url);

      wrapper.appendChild(img);
      link.textContent = "";
      link.appendChild(wrapper);
      link.classList.remove("potential-image");

      if (!syncCached) {
        getCachedImage(url).then((cached) => {
          if (cached && img.parentNode) {
            img.src = cached;
          }
        });
      }
    });

    const remoteEmojis = messageText.querySelectorAll<HTMLImageElement>(
      "img.custom-emoji-remote",
    );

    remoteEmojis.forEach((img) => {
      if (img.dataset.fetched) return;
      img.dataset.fetched = "true";

      const sUrl = img.dataset.surl;
      const emojiId = img.dataset.emojiId;
      const baseUrl = img.dataset.baseUrl;
      if (!sUrl || !emojiId || !baseUrl) return;

      fetch(`${baseUrl}/emojis/${emojiId}`)
        .then((res) => {
          if (!res.ok) {
            console.error("Failed to fetch emoji:", res.status, res.statusText);
            return null;
          }
          return res.json();
        })
        .then((emoji) => {
          if (!emoji || !img.parentNode) return;
          img.src = `${baseUrl}/emojis/${emoji.fileName}`;
          img.alt = `:${emoji.name}:`;
          img.title = emoji.name;
          img.classList.remove("custom-emoji-remote");
          img.classList.add("custom-emoji");
        })
        .catch((err) => {
          console.error("Error fetching remote emoji:", err);
        });
    });
  }, [html, inlineImages]);

  return (
    <>
      <div
        ref={messageTextRef}
        className={`${styles.messageText}${isMentioned ? ` ${styles.mentioned}` : ""}${isEmojiOnly && !isReply ? ` ${styles.emojiOnly}` : ""}${isReply ? ` ${styles.replyContent}` : ""}`}
        style={isTenorOnly ? { display: "none" } : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {!isReply && embeds.length > 0 && (
        <div className={styles.messageEmbeds}>
          {embeds.map((info, i) => (
            <Embed key={`${info.url}-${i}`} info={info} />
          ))}
        </div>
      )}
      {!isReply && messageEmbeds && messageEmbeds.length > 0 && (
        <div className={styles.messageEmbeds}>
          {messageEmbeds.map((embed, i) => (
            <MessageEmbed key={i} embed={embed} messageId={messageId} />
          ))}
        </div>
      )}
    </>
  );
}

export const MessageContent = memo(MessageContentInner);
