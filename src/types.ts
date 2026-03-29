export interface Channel {
  name: string;
  type: string;
  display_name?: string;
  icon?: string;
  permissions?: {
    view?: string[];
    send?: string[];
    create_thread?: string[];
    delete?: string[];
    delete_own?: string[];
    edit_own?: string[];
    pin?: string[];
    react?: string[];
  };
  voice_state?: VoiceUser[];
  last_message?: number;
  size?: number;
  threads?: Thread[];
}

export interface Webhook {
  id: string;
  channel: string;
  name: string;
  created_by: string;
  created_at: number;
  avatar?: string | null;
  token?: string;
}

export interface Thread {
  id: string;
  name: string;
  parent_channel: string;
  created_by: string;
  created_at: number;
  locked: boolean;
  archived: boolean;
  participants?: string[];
}

export interface ThreadUpdate {
  id?: string;
  name?: string;
  parent_channel?: string;
  created_by?: string;
  created_at?: number;
  locked?: boolean;
  archived?: boolean;
  participants?: string[];
}

export interface VoiceUser {
  username: string;
  muted?: boolean;
  pfp?: string;
}

export interface RoturAccount {
  username: string;
  pfp?: string;
  banner?: string;
  bio?: string;
  pronouns?: string;
  created?: number;
  followers?: number;
  following?: number;
  currency?: number;
  subscription?: string;
  system?: string;
}

export interface ServerUser {
  username: string;
  nickname?: string;
  roles?: string[];
  color?: string | null;
  status?: {
    status: "online" | "idle" | "dnd" | "offline";
    text?: string;
  };
  account?: RoturAccount;
}

export interface MessageEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface MessageEmbedAuthor {
  name: string;
  url?: string;
  icon_url?: string;
}

export interface MessageEmbedFooter {
  text: string;
  icon_url?: string;
}

export interface MessageEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  author?: MessageEmbedAuthor;
  footer?: MessageEmbedFooter;
  fields?: MessageEmbedField[];
  image?: { url: string };
  thumbnail?: { url: string };
}

export interface WebhookInfo {
  id: string;
  name: string;
  avatar?: string;
}

export interface Message {
  id?: string;
  user: string;
  content: string;
  timestamp: number;
  edited?: boolean;
  pinned?: boolean;
  reply_to?: { id: string; user: string };
  ping?: boolean;
  reactions?: Record<string, string[]>;
  interaction?: { command: string; username: string };
  pings?: {
    users: string[];
    roles: string[];
    replies: string[];
  };
  webhook?: WebhookInfo;
  embeds?: MessageEmbed[];
  attachments?: Array<{
    id: string;
    name: string;
    mime_type: string;
    size: number;
    url: string;
    expires_at?: number | null;
    permanent?: boolean;
  }>;
}

export interface Server {
  name: string;
  url: string;
  icon?: string | null;
  banner?: string | null;
}

export interface ServerFolder {
  id: string;
  name: string;
  color?: string;
  serverUrls: string[];
  collapsed?: boolean;
}

export interface DMServer {
  channel: string;
  name: string;
  username: string;
  last_message?: number;
}

export interface MediaServer {
  id: string;
  name: string;
  enabled: boolean;
  uploadUrl: string;
  method: string;
  fileParamName?: string;
  headers: Array<{ key: string; value: string }>;
  bodyParams: Array<{ key: string; value: string }>;
  responseUrlPath: string;
  urlTemplate: string;
  requiresAuth: boolean;
  authType: "session" | "token" | "apiKey";
  apiKey?: string;
}

export interface Role {
  name: string;
  color?: string | null;
  description?: string;
  hoisted?: boolean;
  category?: string | null;
  permissions?: string[] | Record<string, any>;
  position?: number;
}

export interface SelfAssignableRole {
  name: string;
  description: string;
  color: string | null;
  assigned: boolean;
}

export type SlashOptionType = "str" | "int" | "float" | "bool" | "enum";

export interface SlashCommandOption {
  name: string;
  description: string;
  type: SlashOptionType;
  required: boolean;
  choices: string[] | null;
}

export interface SlashCommand {
  name: string;
  description: string;
  options: SlashCommandOption[];
  whitelistRoles: string[] | null;
  blacklistRoles: string[] | null;
  ephemeral: boolean;
  registeredBy: string;
}

// ── Rotur API types ──────────────────────────────────────────────────────────

/** Extended profile data returned by GET /profile */
export interface RoturProfile extends RoturAccount {
  standing?: string;
  /** true = the authenticated caller is following this user */
  followed?: boolean;
  /** true = this user is following the authenticated caller */
  follows_me?: boolean;
  "sys.friends"?: string[];
  "sys.requests"?: string[];
  "sys.blocked"?: string[];
  "sys.notes"?: Record<string, string>;
  posts?: RoturPost[];
  groups?: string[];
  /** Custom status object — same shape as UserStatus in the API */
  customStatus?: RoturStatusUpdate;
}

export interface RoturPost {
  id: string;
  user: string;
  content: string;
  timestamp: number;
  likes?: number;
  dislikes?: number;
  replies?: number;
  repost_of?: string;
  pinned?: boolean;
}

export interface RoturGroup {
  tag: string;
  name: string;
  description?: string;
  icon?: string;
  member_count?: number;
  owner?: string;
  is_member?: boolean;
}

export interface RoturGroupDetails extends RoturGroup {
  members?: string[];
  roles?: Record<string, any>;
  announcements?: RoturAnnouncement[];
  created?: number;
}

export interface RoturAnnouncement {
  id: string;
  content: string;
  author: string;
  timestamp: number;
}

export interface RoturStanding {
  standing: string;
  level?: number;
  history?: Array<{
    action: string;
    reason: string;
    timestamp: number;
  }>;
}

export interface RoturGift {
  id?: string;
  code?: string;
  amount: number;
  note?: string;
  creator?: string;
  claimed_by?: string;
  claimed_at?: number;
  cancelled_at?: number;
  expires_at?: number;
  is_expired?: boolean;
  created_at?: number;
}

export interface RoturFollowersResult {
  followers: string[];
  count: number;
}

export interface RoturFollowingResult {
  following: string[];
  count: number;
}

/** Shape of the `status` object returned by GET /status/get */
export interface RoturStatusUpdate {
  /** "simple" | "activity" */
  type?: string;
  /** Plain-text content for simple statuses (may include a leading emoji) */
  content?: string;
  activity?: {
    name: string;
    description?: string;
    image?: string;
  };
  created?: number;
  expires?: number;
}

export interface CustomEmoji {
  id: string;
  name: string;
  fileName: string;
}

export interface RoturEconomyStats {
  total_credits?: number;
  total_users?: number;
  average_credits?: number;
  [key: string]: any;
}

export interface RoturUserStats {
  total_users?: number;
  active_users?: number;
  new_users_today?: number;
  [key: string]: any;
}
