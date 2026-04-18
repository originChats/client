import { useState, useEffect } from "preact/hooks";
import { proxyImageUrl, formatNumber } from "./utils";
import { Icon } from "../../components/Icon";
import { EmbedFallback } from "./embed-fallback";
import { servers } from "../../state";

interface OriginChatsServerEmbedProps {
  serverHost: string;
  originalUrl: string;
}

export function OriginChatsServerEmbed({ serverHost, originalUrl }: OriginChatsServerEmbedProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const isJoined = servers.value.some((s) => s.url === serverHost);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`https://${serverHost}/info`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Server info failed");
        return res.json();
      })
      .then((d) => {
        if (!d.server) throw new Error("Invalid response");
        setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [serverHost]);

  if (loading) return null;
  if (!data) return <EmbedFallback originalUrl={originalUrl} type="originchats_server" />;

  const server = data.server;
  const stats = data.stats || {};
  const bannerUrl = server.banner ? proxyImageUrl(server.banner) : null;
  const iconUrl = server.icon ? proxyImageUrl(server.icon) : null;

  return (
    <div className="originchats-embed">
      {bannerUrl && (
        <div className="originchats-embed__banner">
          <img src={bannerUrl} alt="" loading="lazy" />
        </div>
      )}
      <div className="originchats-embed__body">
        <div className="originchats-embed__header">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={server.name}
              className="originchats-embed__icon"
              loading="lazy"
            />
          ) : (
            <div className="originchats-embed__icon originchats-embed__icon--placeholder">
              <Icon name="Server" size={20} />
            </div>
          )}
          <div className="originchats-embed__title-wrap">
            <div className="originchats-embed__title">{server.name}</div>
            {server.owner?.name && (
              <div className="originchats-embed__owner">
                <Icon name="Crown" size={12} />
                <span>{server.owner.name}</span>
              </div>
            )}
          </div>
        </div>
        {Object.keys(stats).length > 0 && (
          <div className="originchats-embed__stats">
            {stats.online_users !== undefined && (
              <span className="originchats-embed__stat" title="Online users">
                <span className="originchats-embed__online-dot" />
                {formatNumber(stats.online_users)} online
              </span>
            )}
            {stats.total_users !== undefined && (
              <span className="originchats-embed__stat" title="Total users">
                <Icon name="Users" size={12} />
                {formatNumber(stats.total_users)} members
              </span>
            )}
            {stats.total_channels !== undefined && (
              <span className="originchats-embed__stat" title="Channels">
                <Icon name="Hash" size={12} />
                {formatNumber(stats.total_channels)} channels
              </span>
            )}
            {stats.total_roles !== undefined && (
              <span className="originchats-embed__stat" title="Roles">
                <Icon name="Shield" size={12} />
                {formatNumber(stats.total_roles)} roles
              </span>
            )}
          </div>
        )}
        <div className="originchats-embed__action">
          {isJoined ? (
            <span className="originchats-embed__joined">
              <Icon name="Check" size={14} />
              Joined
            </span>
          ) : (
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="originchats-embed__join"
            >
              Join Server
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
