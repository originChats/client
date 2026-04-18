import { type EmbedInfo } from "./types";
import { YouTubeEmbed } from "./youtube";
import { TenorEmbed } from "./tenor";
import { GitHubUserEmbed } from "./github-user";
import { GitHubRepoEmbed } from "./github-repo";
import { GitHubCommitEmbed } from "./github-commit";
import { GitHubPREmbed } from "./github-pr";
import { VideoEmbed } from "./video";
import { ImageEmbed } from "./image";
import { GiftEmbed } from "./gift";
import { WikipediaEmbed } from "./wikipedia";
import { SpotifyEmbed } from "./spotify";
import { SteamEmbed } from "./steam";
import { MistWarpEmbed } from "./mistwarp";
import { OriginChatsServerEmbed } from "./originchats-server";
import { LinkPreviewEmbed } from "./link-preview";
import { EmbedFallback } from "./embed-fallback";

interface EmbedProps {
  info: EmbedInfo;
}

export function Embed({ info }: EmbedProps) {
  switch (info.type) {
    case "youtube":
      return <YouTubeEmbed videoId={info.videoId!} originalUrl={info.url} />;
    case "tenor":
      return <TenorEmbed tenorId={info.tenorId!} originalUrl={info.url} />;
    case "github_user":
      return <GitHubUserEmbed username={info.path!} originalUrl={info.url} />;
    case "github_repo": {
      const pathMatch = info.path!.match(/^([^/]+)\/([^/]+)$/);
      if (pathMatch) {
        return <GitHubRepoEmbed owner={pathMatch[1]} repo={pathMatch[2]} originalUrl={info.url} />;
      }
      return <GitHubUserEmbed username={info.path!} originalUrl={info.url} />;
    }
    case "github_commit":
      return (
        <GitHubCommitEmbed
          owner={info.owner!}
          repo={info.repo!}
          sha={info.sha!}
          originalUrl={info.url}
        />
      );
    case "github_pr":
      return (
        <GitHubPREmbed
          owner={info.owner!}
          repo={info.repo!}
          prNumber={info.prNumber!}
          originalUrl={info.url}
        />
      );
    case "video":
      return <VideoEmbed url={info.url} />;
    case "image":
      return <ImageEmbed url={info.url} />;
    case "gift":
      return <GiftEmbed giftCode={info.giftCode!} originalUrl={info.url} />;
    case "wikipedia":
      return (
        <WikipediaEmbed
          articleTitle={info.articleTitle!}
          lang={info.wikiLang!}
          originalUrl={info.url}
        />
      );
    case "spotify":
      return <SpotifyEmbed spotifyUrl={info.spotifyUrl!} originalUrl={info.url} />;
    case "steam":
      return <SteamEmbed appId={info.steamAppId!} originalUrl={info.url} />;
    case "mistwarp":
      return <MistWarpEmbed projectId={info.mistWarpId!} originalUrl={info.url} />;
    case "originchats_server":
      return <OriginChatsServerEmbed serverHost={info.originChatsHost!} originalUrl={info.url} />;
    case "link_preview":
      return (
        <LinkPreviewEmbed
          originalUrl={info.url}
          title={info.title!}
          description={info.description}
          image={info.image}
          siteName={info.siteName}
          favicon={info.favicon}
        />
      );
    default:
      return <EmbedFallback originalUrl={info.url} type={info.type} />;
  }
}
