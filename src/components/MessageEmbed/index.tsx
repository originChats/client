import { useMemo, useState, useEffect } from "preact/hooks";
import { memo } from "preact/compat";
import DOMPurify from "dompurify";
import { parseMarkdown } from "../../lib/markdown";
import type { MessageEmbed as MessageEmbedType } from "../../types";
import { PollEmbed } from "../PollEmbed";

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function hexColor(color?: number): string | undefined {
  if (color === undefined) return undefined;
  return `#${color.toString(16).padStart(6, "0")}`;
}

function parseEmbedMarkdown(text: string): string {
  const links: string[] = [];
  const parsed = parseMarkdown(text, links, undefined);
  return DOMPurify.sanitize(parsed, { ADD_ATTR: ["target"] });
}

function useImageAspectRatio(url: string | undefined): boolean | null {
  const [isSquare, setIsSquare] = useState<boolean | null>(null);

  useEffect(() => {
    if (!url) {
      setIsSquare(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      setIsSquare(ratio >= 0.9 && ratio <= 1.1);
    };
    img.onerror = () => {
      setIsSquare(null);
    };
    img.src = url;
  }, [url]);

  return isSquare;
}

interface MessageEmbedProps {
  embed: MessageEmbedType;
  messageId?: string;
}

function MessageEmbedInner({ embed, messageId }: MessageEmbedProps) {
  if (embed.type === "poll" && embed.poll) {
    return <PollEmbed poll={embed.poll} messageId={messageId || ""} />;
  }

  const borderColor = hexColor(embed.color);

  const parsedTitle = useMemo(
    () => (embed.title ? parseEmbedMarkdown(embed.title) : null),
    [embed.title],
  );

  const parsedDescription = useMemo(
    () => (embed.description ? parseEmbedMarkdown(embed.description) : null),
    [embed.description],
  );

  const parsedFields = useMemo(
    () =>
      embed.fields?.map((field) => ({
        ...field,
        parsedName: parseEmbedMarkdown(field.name),
        parsedValue: parseEmbedMarkdown(field.value),
      })),
    [embed.fields],
  );

  const isSquareThumbnail = useImageAspectRatio(embed.thumbnail?.url);

  return (
    <div
      className={`message-embed${embed.thumbnail ? " has-thumbnail" : ""}${isSquareThumbnail ? " square-thumbnail" : ""}`}
      style={borderColor ? { borderLeftColor: borderColor } : undefined}
    >
      {!isSquareThumbnail && embed.thumbnail && (
        <img
          className="embed-thumbnail"
          src={embed.thumbnail.url}
          alt=""
          loading="lazy"
        />
      )}
      <div className="embed-body">
        {embed.author && (
          <div className="embed-author">
            {embed.author.icon_url && (
              <img
                className="embed-author-icon"
                src={embed.author.icon_url}
                alt=""
              />
            )}
            {embed.author.url ? (
              <a
                className="embed-author-name"
                href={embed.author.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {embed.author.name}
              </a>
            ) : (
              <span className="embed-author-name">{embed.author.name}</span>
            )}
          </div>
        )}
        {parsedTitle && (
          <div
            className="embed-title"
            dangerouslySetInnerHTML={{ __html: parsedTitle }}
          />
        )}
        {parsedDescription && (
          <div
            className="embed-description"
            dangerouslySetInnerHTML={{ __html: parsedDescription }}
          />
        )}
        {parsedFields && parsedFields.length > 0 && (
          <div className="embed-fields">
            {parsedFields.map((field, i) => (
              <div
                key={i}
                className={`embed-field${field.inline ? " inline" : ""}`}
              >
                <div
                  className="embed-field-name"
                  dangerouslySetInnerHTML={{ __html: field.parsedName }}
                />
                <div
                  className="embed-field-value"
                  dangerouslySetInnerHTML={{ __html: field.parsedValue }}
                />
              </div>
            ))}
          </div>
        )}
        {embed.image && (
          <img
            className="embed-image"
            src={embed.image.url}
            alt=""
            loading="lazy"
          />
        )}
        {embed.footer && (
          <div className="embed-footer">
            {embed.footer.icon_url && (
              <img
                className="embed-footer-icon"
                src={embed.footer.icon_url}
                alt=""
              />
            )}
            <span className="embed-footer-text">{embed.footer.text}</span>
            {embed.timestamp && (
              <>
                <span className="embed-footer-separator">•</span>
                <span className="embed-footer-timestamp">
                  {formatTimestamp(embed.timestamp)}
                </span>
              </>
            )}
          </div>
        )}
      </div>
      {isSquareThumbnail && embed.thumbnail && (
        <img
          className="embed-thumbnail embed-thumbnail--right"
          src={embed.thumbnail.url}
          alt=""
          loading="lazy"
        />
      )}
    </div>
  );
}

export const MessageEmbed = memo(MessageEmbedInner);
