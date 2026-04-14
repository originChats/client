type EmbedType =
  | "youtube"
  | "tenor"
  | "github_user"
  | "github_org"
  | "github_repo"
  | "github_commit"
  | "github_pr"
  | "video"
  | "image"
  | "gift"
  | "wikipedia"
  | "spotify"
  | "steam"
  | "mistwarp"
  | "originchats_server"
  | "link_preview"
  | "unknown";

export interface EmbedInfo {
  type: EmbedType;
  url: string;
  videoId?: string;
  tenorId?: string;
  giftCode?: string;
  owner?: string;
  repo?: string;
  sha?: string;
  path?: string;
  prNumber?: number;
  articleTitle?: string;
  wikiLang?: string;
  spotifyUrl?: string;
  steamAppId?: string;
  mistWarpId?: string;
  originChatsHost?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}
