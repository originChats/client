import { useState, useEffect } from "preact/hooks";
import { proxyImageUrl } from "./utils";
import { EmbedFallback } from "./embed-fallback";

interface SteamEmbedProps {
  appId: string;
  originalUrl: string;
}

export function SteamEmbed({ appId, originalUrl }: SteamEmbedProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const steamApiUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic,price_overview`;
    fetch(`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(steamApiUrl)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Steam API failed");
        return res.json();
      })
      .then((json) => {
        const entry = json?.[appId];
        if (!entry?.success || !entry?.data) throw new Error("App not found");
        setData(entry.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [appId]);

  if (loading) return null;
  if (!data) return <EmbedFallback originalUrl={originalUrl} type="steam" />;

  const price = data.is_free ? "Free" : (data.price_overview?.final_formatted ?? null);

  const typeLabel =
    data.type === "game"
      ? "Game"
      : data.type === "dlc"
        ? "DLC"
        : data.type === "software"
          ? "Software"
          : null;

  return (
    <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="steam-embed">
      {data.header_image && (
        <img
          src={proxyImageUrl(data.header_image)}
          alt={data.name}
          className="steam-embed__header"
          loading="lazy"
        />
      )}
      <div className="steam-embed__body">
        <div className="steam-embed__meta">
          {typeLabel && <span className="steam-embed__badge">{typeLabel}</span>}
          {price && <span className="steam-embed__price">{price}</span>}
        </div>
        <div className="steam-embed__name">{data.name}</div>
        {data.short_description && <p className="steam-embed__desc">{data.short_description}</p>}
      </div>
    </a>
  );
}
