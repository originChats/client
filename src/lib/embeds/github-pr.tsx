import { useState, useEffect } from "preact/hooks";
import { proxyImageUrl, formatDate } from "./utils";
import { Icon } from "../../components/Icon";
import { EmbedFallback } from "./embed-fallback";

interface GitHubPREmbedProps {
  owner: string;
  repo: string;
  prNumber: number;
  originalUrl: string;
}

export function GitHubPREmbed({ owner, repo, prNumber, originalUrl }: GitHubPREmbedProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("GitHub API failed");
        return res.json();
      })
      .then((prData) => {
        setData(prData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [owner, repo, prNumber]);

  if (loading) return null;
  if (!data) return <EmbedFallback originalUrl={originalUrl} type="github_pr" />;

  const authorAvatar = data.user?.avatar_url;
  const authorName = data.user?.login;
  const title = data.title;
  const body = data.body?.split("\n")[0]?.slice(0, 150);
  const state = data.state;
  const merged = data.merged;
  const draft = data.draft;
  const additions = data.additions ?? 0;
  const deletions = data.deletions ?? 0;
  const changedFiles = data.changed_files ?? 0;

  let stateLabel = "Open";
  let stateClass = "open";
  if (merged) {
    stateLabel = "Merged";
    stateClass = "merged";
  } else if (state === "closed") {
    stateLabel = "Closed";
    stateClass = "closed";
  } else if (draft) {
    stateLabel = "Draft";
    stateClass = "draft";
  }

  return (
    <a
      href={originalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="gh-embed gh-embed--pr"
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
          <span className="gh-embed__sep">#{prNumber}</span>
        </span>
        <span className={`gh-embed__badge gh-embed__badge--${stateClass}`}>{stateLabel}</span>
      </div>

      <p className="gh-embed__desc gh-embed__desc--message">{title}</p>

      {body && <p className="gh-embed__body">{body}...</p>}

      <div className="gh-embed__meta">
        <span className="gh-embed__stat">
          <Icon name="User" size={13} />
          {authorName}
        </span>
        <span className="gh-embed__stat">
          <Icon name="FileDiff" size={13} />
          {changedFiles} files
        </span>
        <span className="gh-embed__stat gh-embed__stat--diff">
          <span className="gh-embed__additions">+{additions}</span>
          <span className="gh-embed__deletions">−{deletions}</span>
        </span>
        <span className="gh-embed__stat">
          <Icon name="Clock" size={13} />
          {formatDate(new Date(data.created_at))}
        </span>
      </div>
    </a>
  );
}
