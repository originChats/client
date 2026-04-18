import { useState, useEffect } from "preact/hooks";
import { proxyImageUrl, formatNumber, formatDate } from "./utils";
import { Icon } from "../../components/Icon";
import { EmbedFallback } from "./embed-fallback";

interface GitHubRepoEmbedProps {
  owner: string;
  repo: string;
  originalUrl: string;
}

export function GitHubRepoEmbed({ owner, repo, originalUrl }: GitHubRepoEmbedProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${owner}/${repo}`)
      .then((res) => {
        if (!res.ok) throw new Error("GitHub API failed");
        return res.json();
      })
      .then((repoData) => {
        if (!repoData || repoData.message) throw new Error("Repository not found");
        setData(repoData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [owner, repo]);

  if (loading) return null;
  if (!data) return <EmbedFallback originalUrl={originalUrl} type="github_repo" />;

  return (
    <a
      href={originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="gh-embed gh-embed--repo"
    >
      <div className="gh-embed__header">
        <img
          src={proxyImageUrl(data.owner.avatar_url)}
          alt={owner}
          className="gh-embed__avatar"
          loading="lazy"
        />
        <span className="gh-embed__title">
          <span className="gh-embed__owner">{owner}</span>
          <span className="gh-embed__sep">/</span>
          <span className="gh-embed__repo">{repo}</span>
        </span>
        {data.archived && <span className="gh-embed__badge gh-embed__badge--muted">Archived</span>}
        {data.private && <span className="gh-embed__badge">Private</span>}
        {data.fork && <span className="gh-embed__badge gh-embed__badge--muted">Fork</span>}
      </div>

      {data.description && <p className="gh-embed__desc">{data.description}</p>}

      {data.topics?.length > 0 && (
        <div className="gh-embed__topics">
          {data.topics.slice(0, 5).map((t: string) => (
            <span key={t} className="gh-embed__topic">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="gh-embed__meta">
        {data.language && (
          <span className="gh-embed__lang">
            <span className="gh-embed__lang-dot" data-lang={data.language} />
            {data.language}
          </span>
        )}
        <span className="gh-embed__stat">
          <Icon name="Star" size={13} />
          {formatNumber(data.stargazers_count)}
        </span>
        <span className="gh-embed__stat">
          <Icon name="GitFork" size={13} />
          {formatNumber(data.forks_count)}
        </span>
        {data.open_issues_count > 0 && (
          <span className="gh-embed__stat">
            <Icon name="CircleDot" size={13} />
            {formatNumber(data.open_issues_count)}
          </span>
        )}
        {data.license?.spdx_id && data.license.spdx_id !== "NOASSERTION" && (
          <span className="gh-embed__stat">
            <Icon name="Scale" size={13} />
            {data.license.spdx_id}
          </span>
        )}
        <span className="gh-embed__stat gh-embed__stat--pushed">
          <Icon name="Clock" size={13} />
          {formatDate(new Date(data.pushed_at))}
        </span>
      </div>
    </a>
  );
}
