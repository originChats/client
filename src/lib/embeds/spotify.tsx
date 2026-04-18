import { useState, useEffect } from "preact/hooks";
import { proxyImageUrl } from "./utils";
import { EmbedFallback } from "./embed-fallback";

interface SpotifyEmbedProps {
  spotifyUrl: string;
  originalUrl: string;
}

export function SpotifyEmbed({ spotifyUrl, originalUrl }: SpotifyEmbedProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Spotify oEmbed failed");
        return res.json();
      })
      .then((d) => {
        if (!d.iframe_url) throw new Error("No embed URL");
        setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [spotifyUrl]);

  if (loading) return null;
  if (!data) return <EmbedFallback originalUrl={originalUrl} type="spotify" />;

  // Determine height: playlists/albums are taller
  const isCompact = /\/(track|episode)\//.test(spotifyUrl);
  const embedHeight = isCompact ? 152 : 352;

  return (
    <div className="spotify-embed">
      <iframe
        src={data.iframe_url}
        width="100%"
        height={embedHeight}
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        title={data.title}
      />
    </div>
  );
}
