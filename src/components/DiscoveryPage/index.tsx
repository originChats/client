import { useState, useEffect } from "preact/hooks";
import { servers, usersByServer } from "../../state";
import { switchServer, selectHomeChannel } from "../../lib/actions";
import { saveServers } from "../../lib/persistence";
import { Icon } from "../Icon";
import { UserAvatar } from "../UserAvatar";

interface DiscoveryServer {
  url: string;
  name: string;
  owner: string;
  created_at: number;
  icon: string | null;
  tags: string[];
  description?: string;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

interface ServerInfoResponse {
  server?: {
    name: string;
    icon: string | null;
    owner?: {
      name: string;
    };
  };
  stats?: {
    total_users: number;
    connected_users: number;
    online_users: number;
    total_channels: number;
    total_roles: number;
  };
}

export function DiscoveryPage() {
  const [serverList, setServerList] = useState<DiscoveryServer[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState("all");
  const [activeTab, setActiveTab] = useState<"browse" | "conditions">("browse");
  const [joiningUrl, setJoiningUrl] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [serverInfoMap, setServerInfoMap] = useState<Record<string, ServerInfoResponse>>({});
  const [sortBy, setSortBy] = useState<"members" | "newest">("newest");
  const [featuredIndex, setFeaturedIndex] = useState(0);

  const getServerStats = (url: string) => {
    const usersMap = usersByServer.read(url) || {};
    const allUsers = Object.values(usersMap);
    const totalUsers = allUsers.length;
    const onlineUsers = allUsers.filter((u) => u.status && u.status.status !== "offline").length;
    return { totalUsers, onlineUsers };
  };

  const getServerMemberCount = (url: string): number => {
    const alreadyJoined = servers.value.some((sv) => sv.url === url);
    if (alreadyJoined) {
      return getServerStats(url).totalUsers;
    }
    return serverInfoMap[url]?.stats?.total_users ?? 0;
  };

  useEffect(() => {
    fetch("/discovery.json")
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((data: DiscoveryServer[]) => setServerList(data))
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (serverList && serverList.length > 0) {
      const interval = setInterval(() => {
        setFeaturedIndex((prev) => (prev + 1) % Math.min(5, serverList.length));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [serverList]);

  useEffect(() => {
    if (!serverList) return;

    const fetchServerInfo = async () => {
      const unjoinedServers = serverList.filter(
        (s) => !servers.value.some((sv) => sv.url === s.url)
      );

      for (const server of unjoinedServers) {
        try {
          const response = await fetch(`https://${server.url}/info`);
          if (response.ok) {
            const data: ServerInfoResponse = await response.json();
            setServerInfoMap((prev) => ({ ...prev, [server.url]: data }));
          }
        } catch {
          // Ignore errors fetching server info
        }
      }
    };

    fetchServerInfo();
  }, [serverList]);

  const handleJoin = async (url: string) => {
    const normalized = url.replace(/^wss?:\/\//, "");
    if (normalized === "dms.mistium.com") return;

    if (servers.value.some((s) => s.url === normalized)) {
      await switchServer(normalized);
      selectHomeChannel();
      return;
    }

    setJoiningUrl(normalized);
    setJoinError(null);
    const connected = await switchServer(normalized);
    if (!connected) {
      setJoinError(normalized);
      setJoiningUrl(null);
      return;
    }
    servers.value = [...servers.value, { name: normalized, url: normalized, icon: null }];
    await saveServers();
    setJoiningUrl(null);
    selectHomeChannel();
  };

  const visibleServers = (serverList ?? [])
    .filter((s) => {
      const tags = s.tags;
      const matchesTag = activeTag === "all" || tags.includes(activeTag);
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q) ||
        s.owner.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q);
      return matchesTag && matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === "members") {
        const aMembers = getServerMemberCount(a.url);
        const bMembers = getServerMemberCount(b.url);
        return bMembers - aMembers;
      }
      return b.created_at - a.created_at;
    });

  const topServers = (serverList ?? [])
    .slice()
    .sort((a, b) => getServerMemberCount(b.url) - getServerMemberCount(a.url))
    .slice(0, 5);

  const uniqueTags = new Set((serverList ?? []).flatMap((s) => s.tags));
  const availableTags = ["all", ...Array.from(uniqueTags).sort()];

  return (
    <div className="discovery-page">
      {/* Header bar */}
      <div className="discovery-page-hero">
        <button
          className="discovery-page-back"
          onClick={() => selectHomeChannel()}
          aria-label="Go back"
        >
          <Icon name="ArrowLeft" size={16} />
        </button>
        <div className="discovery-page-hero-center">
          <h1 className="discovery-page-title">
            <Icon name="Compass" size={20} />
            Discover Servers
          </h1>
          <div className="discovery-page-search-wrap">
            <Icon name="Search" size={15} />
            <input
              className="discovery-page-search"
              type="text"
              placeholder="Search by name, URL or owner…"
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
            {search && (
              <button
                className="discovery-page-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <Icon name="X" size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="discovery-page-hero-tabs">
          <button
            className={`discovery-page-tab${activeTab === "browse" ? " active" : ""}`}
            onClick={() => setActiveTab("browse")}
          >
            Browse
          </button>
          <button
            className={`discovery-page-tab${activeTab === "conditions" ? " active" : ""}`}
            onClick={() => setActiveTab("conditions")}
          >
            List your server
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="discovery-page-body">
        {activeTab === "browse" ? (
          <>
            {serverList && serverList.length > 0 && (
              <div className="discovery-featured-section">
                <h2 className="discovery-featured-title">
                  <Icon name="Star" size={18} />
                  Featured Servers
                </h2>
                <div className="discovery-featured-carousel">
                  {serverList !== null &&
                    topServers.map((server, idx) => (
                      <div
                        key={server.url}
                        className={`discovery-featured-card${
                          idx === featuredIndex ? " active" : ""
                        }`}
                      >
                        <div className="discovery-featured-icon">
                          {server.icon ? (
                            <img src={server.icon} alt={server.name} />
                          ) : (
                            <span>{server.name[0]?.toUpperCase()}</span>
                          )}
                        </div>
                        <div className="discovery-featured-content">
                          <h3 className="discovery-featured-name">{server.name}</h3>
                          <p className="discovery-featured-url">{server.url}</p>
                          <div className="discovery-featured-stats">
                            <span>
                              <Icon name="Users" size={12} />
                              {getServerMemberCount(server.url)} members
                            </span>
                          </div>
                        </div>
                        <div className="discovery-featured-owner">
                          <UserAvatar username={server.owner} alt={server.owner} />
                        </div>
                        <button
                          className="discovery-featured-dot"
                          onClick={() => setFeaturedIndex(idx)}
                          aria-label={`View ${server.name}`}
                        />
                      </div>
                    ))}
                  <div className="discovery-featured-indicators">
                    {topServers.map((_, idx) => (
                      <button
                        key={idx}
                        className={`discovery-featured-indicator${
                          idx === featuredIndex ? " active" : ""
                        }`}
                        onClick={() => setFeaturedIndex(idx)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tag bar */}
            <div className="discovery-page-tags">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  className={`discovery-tag-pill${activeTag === tag ? " active" : ""}`}
                  onClick={() => setActiveTag(tag)}
                >
                  {tag.charAt(0).toUpperCase() + tag.slice(1)}
                </button>
              ))}
            </div>

            {/* Sort controls */}
            <div className="discovery-page-controls">
              <span className="discovery-page-sort-label">Sort by:</span>
              {(["members", "newest"] as const).map((sort) => (
                <button
                  key={sort}
                  className={`discovery-page-sort-btn${sortBy === sort ? " active" : ""}`}
                  onClick={() => setSortBy(sort)}
                >
                  {sort === "members" ? "Members" : "Newest"}
                </button>
              ))}
              <span className="discovery-page-count">
                {visibleServers.length} server
                {visibleServers.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Results */}
            {loadError ? (
              <div className="discovery-page-empty">
                <Icon name="WifiOff" size={40} />
                <p>Could not load the server list. Try again later.</p>
              </div>
            ) : serverList === null ? (
              <div className="discovery-page-loading">
                <div className="discovery-page-spinner" />
                <p>Loading servers…</p>
              </div>
            ) : visibleServers.length === 0 ? (
              <div className="discovery-page-empty">
                <Icon name="SearchX" size={40} />
                <p>No servers match your search.</p>
              </div>
            ) : (
              <>
                <p className="discovery-page-count">
                  {visibleServers.length} server
                  {visibleServers.length !== 1 ? "s" : ""}
                </p>
                <div className="discovery-page-grid">
                  {visibleServers.map((s) => {
                    const tags = s.tags;
                    const alreadyJoined = servers.value.some((sv) => sv.url === s.url);
                    const isJoining = joiningUrl === s.url;
                    const hasError = joinError === s.url;
                    const serverStats = getServerStats(s.url);
                    const ownerName = serverInfoMap[s.url]?.server?.owner?.name || s.owner;
                    return (
                      <div key={s.url} className="discovery-page-card">
                        <div className="discovery-page-card-header">
                          <div className="discovery-page-card-icon">
                            {s.icon ? (
                              <img src={s.icon} alt={s.name} />
                            ) : (
                              <span>{s.name[0]?.toUpperCase()}</span>
                            )}
                          </div>
                          <div className="discovery-page-card-meta">
                            <h3 className="discovery-page-card-name">{s.name}</h3>
                            <div className="discovery-page-card-url">{s.url}</div>
                          </div>
                        </div>

                        {s.description && (
                          <p className="discovery-page-card-desc">{s.description}</p>
                        )}

                        <div className="discovery-page-card-tags">
                          {tags.map((t) => (
                            <span
                              key={t}
                              className={`discovery-tag-pill small${activeTag === t ? " active" : ""}`}
                              onClick={() => setActiveTag(t)}
                            >
                              {t}
                            </span>
                          ))}
                        </div>

                        <div className="discovery-page-card-footer">
                          <div className="discovery-page-card-info">
                            {alreadyJoined && serverStats.totalUsers > 0 && (
                              <span>
                                <Icon name="Users" size={12} />
                                {serverStats.totalUsers} members
                              </span>
                            )}
                            {!alreadyJoined && serverInfoMap[s.url]?.stats && (
                              <span>
                                <Icon name="Users" size={12} />
                                {serverInfoMap[s.url].stats?.total_users ?? 0} members
                              </span>
                            )}
                            {alreadyJoined && serverStats.onlineUsers > 0 && (
                              <span>
                                <Icon name="Radio" size={12} />
                                {serverStats.onlineUsers} online
                              </span>
                            )}
                            {!alreadyJoined && serverInfoMap[s.url]?.stats && (
                              <span>
                                <Icon name="Radio" size={12} />
                                {serverInfoMap[s.url].stats?.online_users ?? 0} online
                              </span>
                            )}
                            <span className="discovery-page-card-owner-info">
                              <UserAvatar username={ownerName} alt={ownerName} />
                              {ownerName}
                            </span>
                            <span>
                              <Icon name="Clock" size={12} />
                              {timeAgo(s.created_at)}
                            </span>
                          </div>
                          <button
                            className={`btn${alreadyJoined ? " btn-secondary" : " btn-primary"}`}
                            style={{ fontSize: 13, padding: "6px 16px" }}
                            disabled={isJoining}
                            onClick={() => handleJoin(s.url)}
                          >
                            {isJoining ? "Joining…" : alreadyJoined ? "Visit" : "Join"}
                          </button>
                        </div>
                        {hasError && (
                          <div className="discovery-page-card-error">
                            Could not connect to this server.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="discovery-conditions">
            <div className="discovery-conditions-section">
              <h2>
                <Icon name="CheckCircle" size={18} />
                Requirements
              </h2>
              <p>To be listed in discovery, a server must meet all of the following conditions:</p>
              <ul>
                <li>
                  <Icon name="Check" size={14} />
                  <span>
                    <strong>Publicly accessible</strong> — the server must accept connections from
                    any user without an invite or whitelist.
                  </span>
                </li>
                <li>
                  <Icon name="Check" size={14} />
                  <span>
                    <strong>Actively maintained</strong> — the server must be online and responsive.
                    Servers that go offline for extended periods will be removed.
                  </span>
                </li>
                <li>
                  <Icon name="Check" size={14} />
                  <span>
                    <strong>Running OriginChats</strong> — the server must be a valid
                    OriginChats-compatible WebSocket server.
                  </span>
                </li>
                <li>
                  <Icon name="Check" size={14} />
                  <span>
                    <strong>Safe for general audiences</strong> — NSFW content, harassment, hate
                    speech, and illegal material are not permitted on listed servers.
                  </span>
                </li>
                <li>
                  <Icon name="Check" size={14} />
                  <span>
                    <strong>Owned by a real account</strong> — the listed owner must be a valid
                    rotur.dev account that can be contacted if needed.
                  </span>
                </li>
              </ul>
            </div>

            <div className="discovery-conditions-section">
              <h2>
                <Icon name="PlusCircle" size={18} />
                How to submit your server
              </h2>
              <p>Discovery is curated manually. To request that your server is added:</p>
              <ol>
                <li>
                  <span className="discovery-conditions-step">1</span>
                  <span>Make sure your server meets all the requirements above.</span>
                </li>
                <li>
                  <span className="discovery-conditions-step">2</span>
                  <span>
                    Open a pull request on the{" "}
                    <a
                      href="https://github.com/Mistium/originChats-client"
                      target="_blank"
                      rel="noreferrer"
                    >
                      originChats-client
                    </a>{" "}
                    repository adding your server to <code>discovery.json</code>.
                  </span>
                </li>
                <li>
                  <span className="discovery-conditions-step">3</span>
                  <span>
                    Include your server's <code>url</code>, <code>name</code>, <code>owner</code>{" "}
                    (your rotur.dev username), and an <code>icon</code> URL (square image, at least
                    128×128px).
                  </span>
                </li>
                <li>
                  <span className="discovery-conditions-step">4</span>
                  <span>
                    A maintainer will review your submission. Servers that pass the conditions will
                    be merged and appear in discovery on the next release.
                  </span>
                </li>
              </ol>
            </div>

            <div className="discovery-conditions-section">
              <h2>
                <Icon name="AlertTriangle" size={18} />
                Removal
              </h2>
              <p>
                A server may be removed from discovery at any time if it no longer meets the
                requirements, becomes inaccessible, or receives reports of harmful content. Server
                owners will be contacted before removal where possible.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
