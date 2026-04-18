import { useState, useEffect } from "preact/hooks";
import { proxyImageUrl } from "./utils";
import { EmbedFallback } from "./embed-fallback";

interface WikipediaEmbedProps {
  articleTitle: string;
  lang: string;
  originalUrl: string;
}

export function WikipediaEmbed({ articleTitle, lang, originalUrl }: WikipediaEmbedProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`,
      { signal: controller.signal }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Wikipedia API failed");
        return res.json();
      })
      .then((d) => {
        if (d.type === "disambiguation" || !d.title) throw new Error("No article");
        setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [articleTitle, lang]);

  if (loading) return null;
  if (!data) return <EmbedFallback originalUrl={originalUrl} type="wikipedia" />;

  return (
    <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="wiki-embed">
      <div className="wiki-embed__body">
        <div className="wiki-embed__text">
          <div className="wiki-embed__header">
            <span className="wiki-embed__logo">W</span>
            <span className="wiki-embed__source">Wikipedia</span>
          </div>
          <div className="wiki-embed__title">{data.title}</div>
          {data.description && <div className="wiki-embed__description">{data.description}</div>}
          {data.extract && <p className="wiki-embed__extract">{data.extract}</p>}
        </div>
        {data.thumbnail?.source && (
          <img
            src={proxyImageUrl(data.thumbnail.source)}
            alt={data.title}
            className="wiki-embed__thumb"
            loading="lazy"
          />
        )}
      </div>
    </a>
  );
}
