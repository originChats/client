import hljs from "highlight.js/lib/core";
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

let shortcodeMap: Record<string, string> = {};

export function setShortcodeMap(map: Record<string, string>) {
  shortcodeMap = map;
}

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
  if (!shortcodeMap) return text;
  return text.replace(/:[\w][^:\n]*?:/g, (match) => {
    if (shortcodeMap[match]) return shortcodeMap[match];
    const trimmed = `:${match.slice(1, -1).trim()}:`;
    return shortcodeMap[trimmed] || match;
  });
}

export interface MentionContext {
  validUsernames: Set<string>; // lowercase
  validChannels: Set<string>; // lowercase
  validRoles?: Set<string>; // lowercase
  roleColors?: Record<string, string>; // lowercase role name -> color
}

export function parseMarkdown(
  text: string,
  embedLinks: string[] = [],
  mentionCtx?: MentionContext,
): string {
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

  // Extract URLs BEFORE HTML escaping so & doesn't become &amp; in URLs
  const urlPlaceholders: Array<{ placeholder: string; url: string }> = [];
  text = text.replace(/(https?:\/\/[^\s"\'\]+[^\s"\'\']+)/g, (match, url) => {
    const placeholder = `§URL_${urlPlaceholders.length}§${Math.random().toString(36).substring(2, 11)}§`;
    urlPlaceholders.push({ placeholder, url });
    return placeholder;
  });

  // Escape raw HTML in the plain text portions (code blocks, spoilers, and URLs
  // have already been extracted into placeholders and are escaped separately).
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Escape raw HTML in the plain text portions (code blocks and spoilers
  // have already been extracted into placeholders and are escaped separately).
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Extract inline code early so markdown doesn't affect it
  const inlineCodeBlocks: Array<{ placeholder: string; code: string }> = [];
  text = text.replace(/`([^`]+)`/g, (match, code) => {
    const placeholder = `§INLINECODE_${inlineCodeBlocks.length}§${Math.random().toString(36).substring(2, 11)}§`;
    inlineCodeBlocks.push({ placeholder, code });
    return placeholder;
  });

  text = text.replace(/^#{6} (.*)$/gm, (_, content) => `<h6>${content}</h6>`);
  text = text.replace(/^#{5} (.*)$/gm, (_, content) => `<h5>${content}</h5>`);
  text = text.replace(/^#{4} (.*)$/gm, (_, content) => `<h4>${content}</h4>`);
  text = text.replace(/^### (.*)$/gm, (_, content) => `<h3>${content}</h3>`);
  text = text.replace(/^## (.*)$/gm, (_, content) => `<h2>${content}</h2>`);
  text = text.replace(/^# (.*)$/gm, (_, content) => `<h1>${content}</h1>`);

  text = text.replace(
    /^> (.*)$/gm,
    (_, content) => `<blockquote>${content}</blockquote>`,
  );

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

  // Restore inline code
  for (const { placeholder, code } of inlineCodeBlocks) {
    text = text.replace(placeholder, `<code>${code}</code>`);
  }

  // Restore URLs and process them
  for (const { placeholder, url } of urlPlaceholders) {
    const rawUrl = url;
    embedLinks.push(rawUrl);
    const safeUrl = escapeAttribute(rawUrl);
    const safeDisplayText = escapeHtml(rawUrl);

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
    // The spoiler inner text is passed through the same markdown pipeline
    // so formatting like **bold** still works inside spoilers.
    const innerHtml = parseMarkdown(spoiler.inner, [], mentionCtx);
    text = text.replace(
      spoiler.placeholder,
      `<span class="spoiler" role="button" tabindex="0" aria-label="Spoiler">${innerHtml}</span>`,
    );
  }

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
