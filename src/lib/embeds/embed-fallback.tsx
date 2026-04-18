import { Icon } from "../../components/Icon";

interface EmbedFallbackProps {
  originalUrl: string;
  type?: string;
}

function getDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname + parsed.search + parsed.hash;
    const display = parsed.host + (path.length > 40 ? path.slice(0, 40) + "…" : path);
    return display;
  } catch {
    return url.length > 60 ? url.slice(0, 57) + "…" : url;
  }
}

function getSiteName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getFaviconUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`;
  } catch {
    return null;
  }
}

export function EmbedFallback({ originalUrl, type }: EmbedFallbackProps) {
  const siteName = getSiteName(originalUrl);
  const faviconUrl = getFaviconUrl(originalUrl);
  const displayUrl = getDisplayUrl(originalUrl);

  const typeLabels: Record<string, string> = {
    youtube: "YouTube",
    tenor: "Tenor",
    github_user: "GitHub",
    github_org: "GitHub",
    github_repo: "GitHub",
    github_commit: "GitHub",
    github_pr: "GitHub",
    spotify: "Spotify",
    steam: "Steam",
    wikipedia: "Wikipedia",
    mistwarp: "MistWarp",
    originchats_server: "OriginChats",
    gift: "Rotur",
    video: "Video",
    image: "Image",
    link_preview: "Link",
  };

  const label = typeLabels[type || ""] || siteName || "Link";

  return (
    <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="embed-fallback">
      <div className="embed-fallback__header">
        {faviconUrl && (
          <img src={faviconUrl} alt="" className="embed-fallback__favicon" loading="lazy" />
        )}
        <span className="embed-fallback__site">{label}</span>
        <Icon name="ExternalLink" size={13} className="embed-fallback__icon" />
      </div>
      <div className="embed-fallback__url">{displayUrl}</div>
    </a>
  );
}
