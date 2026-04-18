import { useState, useEffect } from "preact/hooks";
import { proxyImageUrl, formatDate } from "./utils";
import { Icon } from "../../components/Icon";
import { EmbedFallback } from "./embed-fallback";

interface GitHubCommitEmbedProps {
  owner: string;
  repo: string;
  sha: string;
  originalUrl: string;
}

export function GitHubCommitEmbed({ owner, repo, sha, originalUrl }: GitHubCommitEmbedProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}`)
      .then((res) => {
        if (!res.ok) throw new Error("GitHub API failed");
        return res.json();
      })
      .then((commitData) => {
        setData(commitData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [owner, repo, sha]);

  if (loading) return null;
  if (!data) return <EmbedFallback originalUrl={originalUrl} type="github_commit" />;

  const authorAvatar = data.author?.avatar_url || data.committer?.avatar_url;
  const authorName = data.commit.author.name;
  const message = data.commit.message.split("\n")[0];
  const additions = data.stats?.additions ?? 0;
  const deletions = data.stats?.deletions ?? 0;

  return (
    <a
      href={originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="gh-embed gh-embed--commit"
    >
      <div className="gh-embed__header">
        {authorAvatar && (
          <img
            src={proxyImageUrl(authorAvatar)}
            alt={authorName}
            className="gh-embed__avatar"
            loading="lazy"
          />
        )}
        <span className="gh-embed__title">
          <span className="gh-embed__owner">
            {owner}/{repo}
          </span>
          <span className="gh-embed__sep"> @ </span>
          <code className="gh-embed__sha">{sha.slice(0, 7)}</code>
        </span>
      </div>

      <p className="gh-embed__desc gh-embed__desc--message">{message}</p>

      <div className="gh-embed__meta">
        <span className="gh-embed__stat">
          <Icon name="User" size={13} />
          {authorName}
        </span>
        <span className="gh-embed__stat">
          <Icon name="Clock" size={13} />
          {formatDate(new Date(data.commit.author.date))}
        </span>
        {(additions > 0 || deletions > 0) && (
          <span className="gh-embed__stat gh-embed__stat--diff">
            <span className="gh-embed__additions">+{additions}</span>
            <span className="gh-embed__deletions">−{deletions}</span>
          </span>
        )}
      </div>
    </a>
  );
}
