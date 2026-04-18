import { useState, useEffect } from "preact/hooks";
import { proxyImageUrl, formatNumber, formatDate } from "./utils";
import { Icon } from "../../components/Icon";
import { EmbedFallback } from "./embed-fallback";

interface MistWarpEmbedProps {
  projectId: string;
  originalUrl: string;
}

export function MistWarpEmbed({ projectId, originalUrl }: MistWarpEmbedProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `https://proxy.mistium.com?url=${encodeURIComponent(`https://api.scratch.mit.edu/projects/${projectId}`)}`,
      { signal: controller.signal }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Scratch API failed");
        return res.json();
      })
      .then((d) => {
        if (!d.title) throw new Error("Project not found");
        setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [projectId]);

  if (loading) return null;
  if (!data) return <EmbedFallback originalUrl={originalUrl} type="mistwarp" />;

  const thumbUrl =
    data.images?.["282x218"] ||
    data.image ||
    `https://cdn2.scratch.mit.edu/get_image/project/${projectId}_480x360.png`;

  const blurb = (data.description || data.instructions || "").trim();
  const avatarUrl = data.author?.profile?.images?.["50x50"];
  const modifiedAt = data.history?.modified ? formatDate(new Date(data.history.modified)) : null;

  return (
    <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="mistwarp-embed">
      <div className="mistwarp-embed__top">
        <img
          src={proxyImageUrl(thumbUrl)}
          alt={data.title}
          className="mistwarp-embed__thumb"
          loading="lazy"
        />
        <div className="mistwarp-embed__body">
          <div className="mistwarp-embed__header">
            <span className="mistwarp-embed__source">MistWarp</span>
            {modifiedAt && <span className="mistwarp-embed__modified">{modifiedAt}</span>}
          </div>
          <div className="mistwarp-embed__title">{data.title}</div>
          {data.author?.username && (
            <div className="mistwarp-embed__author">
              {avatarUrl && (
                <img
                  src={proxyImageUrl(avatarUrl)}
                  alt={data.author.username}
                  className="mistwarp-embed__avatar"
                />
              )}
              <span>{data.author.username}</span>
            </div>
          )}
          {blurb && <p className="mistwarp-embed__desc">{blurb}</p>}
        </div>
      </div>
      {data.stats && (
        <div className="mistwarp-embed__stats">
          <span className="mistwarp-embed__stat" title="Loves">
            <Icon name="Heart" size={13} />
            {formatNumber(data.stats.loves)}
          </span>
          <span className="mistwarp-embed__stat" title="Favorites">
            <Icon name="Star" size={13} />
            {formatNumber(data.stats.favorites)}
          </span>
          <span className="mistwarp-embed__stat" title="Views">
            <Icon name="Eye" size={13} />
            {formatNumber(data.stats.views)}
          </span>
          {data.stats.remixes > 0 && (
            <span className="mistwarp-embed__stat" title="Remixes">
              <Icon name="Repeat2" size={13} />
              {formatNumber(data.stats.remixes)}
            </span>
          )}
        </div>
      )}
    </a>
  );
}
