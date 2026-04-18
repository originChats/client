import { useState, useEffect } from "preact/hooks";
import { proxyImageUrl, formatNumber } from "./utils";
import { Icon } from "../../components/Icon";
import { EmbedFallback } from "./embed-fallback";

interface GitHubUserEmbedProps {
  username: string;
  originalUrl: string;
}

export function GitHubUserEmbed({ username, originalUrl }: GitHubUserEmbedProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`https://api.github.com/users/${username}`)
      .then((res) => {
        if (!res.ok) throw new Error("GitHub API failed");
        return res.json();
      })
      .then((userData) => {
        if (!userData || userData.message) throw new Error("User not found");
        setData(userData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) return null;
  if (!data) return <EmbedFallback originalUrl={originalUrl} type="github_user" />;

  const isOrg = data.type === "Organization";

  return (
    <a
      href={originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`gh-embed ${isOrg ? "gh-embed--org" : "gh-embed--user"}`}
    >
      <div className="gh-embed__header">
        <img
          src={proxyImageUrl(data.avatar_url)}
          alt={username}
          className="gh-embed__avatar"
          loading="lazy"
        />
        <span className="gh-embed__title">
          {data.name ? (
            <>
              <span className="gh-embed__repo">{data.name}</span>
              <span className="gh-embed__owner gh-embed__owner--sub">@{username}</span>
            </>
          ) : (
            <span className="gh-embed__repo">{username}</span>
          )}
        </span>
        <span className="gh-embed__badge gh-embed__badge--muted">
          {isOrg ? "Organization" : "User"}
        </span>
      </div>

      {(isOrg ? data.description : data.bio) && (
        <p className="gh-embed__desc">{isOrg ? data.description : data.bio}</p>
      )}

      <div className="gh-embed__meta">
        <span className="gh-embed__stat">
          <Icon name="Users" size={13} />
          {formatNumber(data.followers)} followers
        </span>
        <span className="gh-embed__stat">
          <Icon name="BookMarked" size={13} />
          {formatNumber(data.public_repos)} repos
        </span>
        {data.location && (
          <span className="gh-embed__stat">
            <Icon name="MapPin" size={13} />
            {data.location}
          </span>
        )}
      </div>
    </a>
  );
}
