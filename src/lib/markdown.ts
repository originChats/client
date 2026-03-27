import hljs from "highlight.js/lib/core";
import { servers, threadsByServer } from "../state";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import html from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", html);
hljs.registerLanguage("xml", html);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);

const parseCache = new Map<string, { result: string; embedLinks: string[] }>();
const MAX_CACHE_SIZE = 500;

const YOUTUBE_REGEX =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/;

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
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "ogg", "avi", "mkv"];
const TRUSTED_DOMAINS = [
  "avatars.rotur.dev",
  "photos.rotur.dev",
  "roturcdn.milosantos.com",
  "img.youtube.com",
  "media.tenor.com",
  "media.discordapp.net",
  "cdn.discordapp.com",
];

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttribute(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function hasExtension(url: string, extensions: string[]): boolean {
  const urlLower = url.toLowerCase();
  return extensions.some(
    (ext) =>
      urlLower.endsWith(`.${ext}`) ||
      urlLower.includes(`.${ext}?`) ||
      urlLower.includes(`.${ext}#`),
  );
}

function proxyImageUrl(url: string): string {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const urlObj = new URL(url);
    if (TRUSTED_DOMAINS.includes(urlObj.hostname)) return url;
  } catch {
    // ignore
  }
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
}

export function replaceShortcodes(text: string): string {
  const shortcodeMap = (window as any).shortcodeMap;
  if (shortcodeMap) {
    text = text.replace(/:[\w][^:\n]*?:/g, (match) => {
	  const name = match.replaceAll(":", ""); 
      if (shortcodeMap[name]) return shortcodeMap[name];
	  return match;
    });
  }
  return text;
}

export function convertChannelMentionsToLinks(
  text: string,
  currentServerUrl: string,
  validChannels?: Set<string>,
): string {
  text = text.replace(
    /https:\/\/originchats\.mistium\.com\/app\/([^/\s?#]+)(?:\/([^/\s?#]+)(?:\/([a-f0-9-]+))?)?/gi,
    (_, server, channel, thread) => {
      let result = `originChats://${server}`;
      if (channel) result += `/${channel}`;
      if (thread) result += `/${thread}`;
      return result;
    },
  );
  const urlPlaceholders: Array<{ placeholder: string; url: string }> = [];
  text = text.replace(/https?:\/\/[^\s"'\\]+[^\s"']+/g, (match) => {
    const placeholder = `§URL_${urlPlaceholders.length}§`;
    urlPlaceholders.push({ placeholder, url: match });
    return placeholder;
  });
  text = text.replace(/#([a-zA-Z0-9_-]+)/g, (_, channelName) => {
    if (validChannels && !validChannels.has(channelName.toLowerCase())) {
      return `#${channelName}`;
    }
    return `originChats://${currentServerUrl}/${channelName}`;
  });
  for (const { placeholder, url } of urlPlaceholders) {
    text = text.replace(placeholder, url);
  }
  return text;
}

export interface MentionContext {
  validUsernames: Set<string>; // lowercase
  validChannels: Set<string>; // lowercase
  validRoles?: Set<string>; // lowercase
  roleColors?: Record<string, string>; // lowercase role name -> color
  currentServerUrl?: string; // for detecting cross-server channel links
}

export function parseMarkdown(
  text: string,
  embedLinks: string[] = [],
  mentionCtx?: MentionContext,
): string {
  const cacheKey = text;
  const cached = parseCache.get(cacheKey);
  if (cached) {
    embedLinks.push(...cached.embedLinks);
    return cached.result;
  }

  const codeBlocks: Array<{ placeholder: string; lang: string; code: string }> =
    [];

  text = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || "plaintext";
    const placeholder = `§CODEBLOCK_${codeBlocks.length}§${Math.random().toString(36).substring(2, 11)}§`;
    codeBlocks.push({ placeholder, lang: language, code });
    return placeholder;
  });

  // Extract spoilers early so their content is not processed by other rules.
  const spoilers: Array<{ placeholder: string; inner: string }> = [];
  text = text.replace(/\|\|(.+?)\|\|/gs, (_, inner) => {
    const placeholder = `§SPOILER_${spoilers.length}§${Math.random().toString(36).substring(2, 11)}§`;
    spoilers.push({ placeholder, inner });
    return placeholder;
  });

  // Extract inline code before HTML escaping so special chars display correctly
  const inlineCodeBlocks: Array<{ placeholder: string; code: string }> = [];
  text = text.replace(/`([^`]+)`/g, (match, code) => {
    const placeholder = `§INLINECODE_${inlineCodeBlocks.length}§${Math.random().toString(36).substring(2, 11)}§`;
    inlineCodeBlocks.push({ placeholder, code });
    return placeholder;
  });

  // Extract markdown links [name](url) BEFORE URLs so the URL doesn't get double-processed
  const markdownLinks: Array<{
    placeholder: string;
    name: string;
    url: string;
  }> = [];
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, name, url) => {
    const placeholder = `§MDLINK_${markdownLinks.length}§${Math.random().toString(36).substring(2, 11)}§`;
    markdownLinks.push({ placeholder, name, url });
    return placeholder;
  });

  // Extract URLs before HTML escaping so & doesn't become &amp; in URLs
  const urlPlaceholders: Array<{ placeholder: string; url: string }> = [];
  text = text.replace(
    /((?:https?|origin[cC]hats):\/\/[^\s"'\\]+[^\s"']+)/g,
    (match, url) => {
      const placeholder = `§URL_${urlPlaceholders.length}§${Math.random().toString(36).substring(2, 11)}§`;
      urlPlaceholders.push({ placeholder, url });
      return placeholder;
    },
  );

  // Extract blockquotes before HTML escaping so > is preserved
  const blockquotePlaceholders: Array<{
    placeholder: string;
    content: string;
  }> = [];
  text = text.replace(/^(> )(.*)$/gm, (match, prefix, content) => {
    const placeholder = `§BLOCKQUOTE_${blockquotePlaceholders.length}§${Math.random().toString(36).substring(2, 11)}§`;
    blockquotePlaceholders.push({ placeholder, content });
    return placeholder;
  });

  // Escape raw HTML in the remaining plain text portions
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  text = text.replace(/^#{6} (.*)$/gm, (_, content) => `<h6>${content}</h6>`);
  text = text.replace(/^#{5} (.*)$/gm, (_, content) => `<h5>${content}</h5>`);
  text = text.replace(/^#{4} (.*)$/gm, (_, content) => `<h4>${content}</h4>`);
  text = text.replace(/^### (.*)$/gm, (_, content) => `<h3>${content}</h3>`);
  text = text.replace(/^## (.*)$/gm, (_, content) => `<h2>${content}</h2>`);
  text = text.replace(/^# (.*)$/gm, (_, content) => `<h1>${content}</h1>`);

  // Restore blockquotes
  for (const { placeholder, content } of blockquotePlaceholders) {
    text = text.replace(
      placeholder,
      `<blockquote>${content.replace(/^>+\s*/, "")}</blockquote>`,
    );
  }

  text = text.replace(/~~(.+?)~~/g, (_, content) => `<s>${content}</s>`);

  text = text.replace(
    /\*\*\*(.+?)\*\*\*/g,
    (_, content) => `<strong><em>${content}</em></strong>`,
  );
  text = text.replace(
    /___(.+?)___/g,
    (_, content) => `<strong><em>${content}</em></strong>`,
  );

  text = text.replace(
    /\*\*(.+?)\*\*/g,
    (_, content) => `<strong>${content}</strong>`,
  );
  text = text.replace(
    /__(.+?)__/g,
    (_, content) => `<strong>${content}</strong>`,
  );

  text = text.replace(
    /(^|\s)\*([^\s*](?:.*?[^\s*])?)\*(?=$|\s)/g,
    (_, prefix, content) => `${prefix}<em>${content}</em>`,
  );
  text = text.replace(
    /(^|\s)_([^\s_](?:.*?[^\s_])?)_(?=$|\s)/g,
    (_, prefix, content) => `${prefix}<em>${content}</em>`,
  );

  // Restore inline code with proper escaping
  for (const { placeholder, code } of inlineCodeBlocks) {
    const escapedCode = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    text = text.replace(placeholder, `<code>${escapedCode}</code>`);
  }

  // Helper to restore inline code placeholders in a string
  const restoreInlineCode = (str: string): string => {
    return str.replace(/§INLINECODE_(\d+)§[a-z0-9]+§/g, (_, idx) => {
      const block = inlineCodeBlocks[parseInt(idx)];
      if (block) {
        const escapedCode = block.code
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        return `<code>${escapedCode}</code>`;
      }
      return "";
    });
  };

  // Restore markdown links [name](url)
  for (const { placeholder, name, url } of markdownLinks) {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      embedLinks.push(url);
      const safeUrl = escapeAttribute(url);
      const safeName = restoreInlineCode(escapeHtml(name));
      text = text.replace(
        placeholder,
        `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeName}</a>`,
      );
    } else {
      text = text.replace(placeholder, `[${name}](${url})`);
    }
  }

  // Restore URLs and process them
  for (const { placeholder, url } of urlPlaceholders) {
    const rawUrl = url;
    embedLinks.push(rawUrl);
    const safeUrl = escapeAttribute(rawUrl);
    const safeDisplayText = escapeHtml(rawUrl);

    const originChatsMatch = rawUrl.match(
      /^(?:https:\/\/originchats\.mistium\.com\/app\/|origin[cC]hats:\/\/)([^/\s?#]+)(?:\/([^/\s?#]+)(?:\/([a-f0-9-]+))?)?$/i,
    );
    if (originChatsMatch) {
      const linkServerUrl = originChatsMatch[1];
      const linkChannelName = originChatsMatch[2];
      const linkThreadId = originChatsMatch[3];
      const currentServer = mentionCtx?.currentServerUrl;
      const isCurrentServer = currentServer && linkServerUrl === currentServer;
      const server = servers.value.find((s) => s.url === linkServerUrl);
      const serverDisplay = server?.name || linkServerUrl;

      if (linkThreadId) {
        const allThreads = threadsByServer.value[linkServerUrl] || {};
        let threadName: string | null = null;
        for (const channelThreads of Object.values(allThreads)) {
          const thread = channelThreads.find((t) => t.id === linkThreadId);
          if (thread) {
            threadName = thread.name;
            break;
          }
        }
        const displayText = isCurrentServer
          ? `#${threadName || "unknown thread"}`
          : `${serverDisplay}: #${threadName || "unknown thread"}`;
        text = text.replace(
          placeholder,
          `<span class="channel-mention" data-channel="${escapeAttribute(linkChannelName || "")}" data-server="${escapeAttribute(linkServerUrl)}" data-thread="${escapeAttribute(linkThreadId)}">${escapeHtml(displayText)}</span>`,
        );
        continue;
      }

      if (linkChannelName) {
        const displayText = isCurrentServer
          ? `#${linkChannelName}`
          : `${serverDisplay}: #${linkChannelName}`;
        text = text.replace(
          placeholder,
          `<span class="channel-mention" data-channel="${escapeAttribute(linkChannelName)}" data-server="${escapeAttribute(linkServerUrl)}">${escapeHtml(displayText).replace(/#/g, "&#35;")}</span>`,
        );
        continue;
      }
    }

    if (YOUTUBE_REGEX.test(rawUrl)) {
      text = text.replace(
        placeholder,
        `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeDisplayText}</a>`,
      );
      continue;
    }

    if (rawUrl.match(/tenor\.com\/view\/[\w-]+-\d+(?:\?.*)?$/i)) {
      text = text.replace(
        placeholder,
        `<a href="${safeUrl}" class="tenor-embed" target="_blank" rel="noopener noreferrer">${safeDisplayText}</a>`,
      );
      continue;
    }

    if (hasExtension(rawUrl, VIDEO_EXTENSIONS)) {
      text = text.replace(
        placeholder,
        `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeDisplayText}</a>`,
      );
      continue;
    }

    if (hasExtension(rawUrl, IMAGE_EXTENSIONS)) {
      text = text.replace(
        placeholder,
        `<div class="image-placeholder" data-image-url="${safeUrl}"></div>`,
      );
      continue;
    }

    text = text.replace(
      placeholder,
      `<a href="${safeUrl}" class="potential-image" target="_blank" rel="noopener noreferrer" data-image-url="${safeDisplayText}">${safeDisplayText}</a>`,
    );
  }

  text = text.replace(/@&amp;([a-zA-Z0-9_]+)/g, (match, roleName) => {
    console.log(mentionCtx, match, roleName);
    if (
      mentionCtx?.validRoles &&
      !mentionCtx.validRoles.has(roleName.toLowerCase())
    ) {
      return match;
    }
    const color = mentionCtx?.roleColors?.[roleName.toLowerCase()];
    const style = color ? ` style="--mention: ${color};"` : "";
    return `<span class="role-mention" data-role="${escapeAttribute(roleName)}"${style}>@${roleName}</span>`;
  });

  text = text.replace(/@([a-zA-Z0-9_]+)/g, (match, user) => {
    if (mentionCtx && !mentionCtx.validUsernames.has(user.toLowerCase())) {
      return match;
    }
    return `<span class="mention" data-user="${escapeAttribute(user)}">@${user}</span>`;
  });

  text = text.replace(/#([a-zA-Z0-9_-]+)/g, (match, channelName) => {
    if (
      mentionCtx &&
      !mentionCtx.validChannels.has(channelName.toLowerCase())
    ) {
      return match;
    }
    return `<span class="channel-mention" data-channel="${escapeAttribute(channelName)}">#${channelName}</span>`;
  });

  text = text.replace(/\n(?!<\/?(h[1-6]|pre|blockquote))/g, "<br>");

  for (const block of codeBlocks) {
    const escapedCode = block.code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const html = `<pre><code class="language-${block.lang}">${escapedCode}</code></pre>`;
    text = text.replace(block.placeholder, html);
  }

  for (const spoiler of spoilers) {
    const innerHtml = parseMarkdown(spoiler.inner, [], mentionCtx);
    text = text.replace(
      spoiler.placeholder,
      `<span class="spoiler" role="button" tabindex="0" aria-label="Spoiler">${innerHtml}</span>`,
    );
  }

  if (parseCache.size > MAX_CACHE_SIZE) {
    const keysToDelete = [...parseCache.keys()].slice(
      0,
      parseCache.size - MAX_CACHE_SIZE,
    );
    keysToDelete.forEach((k) => parseCache.delete(k));
  }
  parseCache.set(cacheKey, { result: text, embedLinks: [...embedLinks] });

  return text;
}

export function highlightCodeInContainer(container: HTMLElement): void {
  container.querySelectorAll("pre code").forEach((block) => {
    const el = block as HTMLElement;
    if (el.dataset.highlighted) return;
    const langClass = Array.from(el.classList).find((c) =>
      c.startsWith("language-"),
    );
    const lang = langClass?.slice("language-".length);
    if (lang && !hljs.getLanguage(lang)) return;
    hljs.highlightElement(el);
  });
}
