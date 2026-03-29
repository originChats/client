import { memo } from "preact/compat";
import { useRef, useEffect, useState } from "preact/hooks";
import { useSystemEmojis } from "../../state";
import { getEmojiImgOrDataUri } from "../../lib/emoji";

interface EmojiButtonProps {
  emoji: string;
  label: string;
  hexcode: string;
  onClick: () => void;
}

function EmojiButtonImpl({ emoji, label, hexcode, onClick }: EmojiButtonProps) {
  return (
    <button
      className="emoji-button"
      onClick={onClick}
      title={label}
      type="button"
    >
      <EmojiImage emoji={emoji} hexcode={hexcode} />
    </button>
  );
}

export const EmojiButton = memo(EmojiButtonImpl);

interface CustomEmojiButtonProps {
  id: string;
  name: string;
  fileName: string;
  serverUrl: string;
  serverName: string;
  onClick: () => void;
}

function CustomEmojiButtonImpl({
  name,
  fileName,
  serverUrl,
  onClick,
}: CustomEmojiButtonProps) {
  const baseUrl = serverUrl.startsWith("http")
    ? serverUrl
    : `https://${serverUrl}`;
  const url = `${baseUrl}/emojis/${fileName}`;

  return (
    <button
      className="emoji-button"
      onClick={onClick}
      title={`:${name}:`}
      type="button"
    >
      <img
        src={url}
        alt={name}
        className="emoji-custom-img"
        loading="lazy"
        draggable={false}
      />
    </button>
  );
}

export const CustomEmojiButton = memo(CustomEmojiButtonImpl);

interface EmojiImageProps {
  emoji: string;
  hexcode: string;
}

function EmojiImageImpl({ emoji, hexcode }: EmojiImageProps) {
  const useSystem = useSystemEmojis.value;
  const imgRef = useRef<HTMLImageElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (useSystem) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "50px" },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [useSystem]);

  if (useSystem) {
    return <span className="emoji-picker-emoji">{emoji}</span>;
  }

  if (!isVisible) {
    return (
      <span ref={containerRef} className="emoji-picker-emoji placeholder">
        {emoji}
      </span>
    );
  }

  const url = getEmojiImgOrDataUri(emoji);

  if (url) {
    return (
      <img
        ref={imgRef}
        src={url}
        alt={emoji}
        className="emoji-picker-emoji-img"
        draggable={false}
      />
    );
  }

  return <span className="emoji-picker-emoji">{emoji}</span>;
}

export const EmojiImage = memo(EmojiImageImpl);
