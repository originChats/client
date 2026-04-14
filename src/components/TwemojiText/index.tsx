import { useMemo } from "preact/hooks";
import twemoji from "@twemoji/api";
import { useSystemEmojis } from "../../state";

interface TwemojiTextProps {
  children: string;
  className?: string;
}

export function TwemojiText({ children, className }: TwemojiTextProps) {
  const html = useMemo(() => {
    if (useSystemEmojis.value || !children) {
      return children;
    }
    return twemoji.parse(children, {
      className: "emoji",
      size: "svg",
      ext: ".svg",
    }) as string;
  }, [children]);

  if (useSystemEmojis.value) {
    return <span className={className}>{children}</span>;
  }

  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
