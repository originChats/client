import type {
  Channel,
  Message,
  Role,
  ServerUser,
  Thread,
  VoiceUser,
  Webhook,
  CustomEmoji,
} from "./types";

interface UsersList {
  cmd: "users_list";
  users: ServerUser[];
}

interface UsersOnline {
  cmd: "users_online";
  users: ServerUser[];
}

interface UserConnect {
  cmd: "user_connect";
  user: ServerUser;
}

interface UserDisconnect {
  cmd: "user_disconnect";
  username: string;
}

interface Ping {
  cmd: "ping";
}

interface ChannelsGet {
  cmd: "channels_get";
  channels: Channel[];
}

interface MessagesGet {
  cmd: "messages_get";
  channel: string;
  messages: Message[];
  range: { start: number; end: number };
  thread_id?: string;
}

interface MessagesAround {
  cmd: "messages_around";
  channel: string;
  messages: Message[];
  range: { start: number; end: number };
  thread_id?: string;
}

interface MessageGet {
  cmd: "message_get";
  channel: string;
  message: Message;
  thread_id?: string;
}

interface MessageNew {
  cmd: "message_new";
  channel: string;
  message: Message;
  thread_id?: string;
}

interface MessageEdit {
  cmd: "message_edit";
  id: string;
  content: string;
  message: Message;
  channel: string;
  thread_id?: string;
}

interface MessageDelete {
  cmd: "message_delete";
  id: string;
  channel: string;
  thread_id?: string;
}

interface MessagePin {
  cmd: "message_pin";
  id: string;
  channel: string;
  thread_id?: string;
}

interface MessageUnpin {
  cmd: "message_unpin";
  id: string;
  channel: string;
  thread_id?: string;
}

interface Typing {
  cmd: "typing";
  channel: string;
  user: string;
}

interface ThreadCreate {
  cmd: "thread_create";
  thread: Thread;
  channel: string;
  global?: boolean;
}

interface ThreadDelete {
  cmd: "thread_delete";
  thread_id: string;
  channel: string;
  global?: boolean;
}

interface ThreadUpdate {
  cmd: "thread_update";
  thread: Thread;
  channel: string;
  global?: boolean;
}

interface ThreadGet {
  cmd: "thread_get";
  thread: Thread;
}

interface ThreadJoin {
  cmd: "thread_join";
  thread: Thread;
  thread_id: string;
}

interface ThreadLeave {
  cmd: "thread_leave";
  thread: Thread;
  thread_id: string;
}

interface StatusSet {
  cmd: "status_set";
  status: {
    status: "online" | "idle" | "dnd" | "offline";
    text?: string;
  };
}

interface StatusGet {
  cmd: "status_get";
  username: string;
  status: {
    status: "online" | "idle" | "dnd" | "offline";
    text?: string;
  };
}

interface Handshake {
  cmd: "handshake";
  val: {
    validator_key: string;
    capabilities?: string[];
    attachments?: {
      enabled?: boolean;
      max_size: number;
      allowed_types: string[];
      max_attachments_per_user?: number;
      permanent_tiers?: string[];
    };
    server?: {
      icon?: string;
      banner?: string;
      name?: string;
    };
  };
}

interface Ready {
  cmd: "ready";
  user: ServerUser & {
    status?: {
      status: "online" | "idle" | "dnd" | "offline";
      text?: string;
    };
  };
}

interface AuthSuccess {
  cmd: "auth_success";
}

interface RolesList {
  cmd: "roles_list";
  roles: Record<string, Role>;
}

interface RoleReorder {
  cmd: "role_reorder";
  roles: string[];
}

interface UserRolesSet {
  cmd: "user_roles_set";
  user: string;
  roles: string[];
}

interface UserRolesGet {
  cmd: "user_roles_get";
  user: string;
  roles: string[];
  color?: string;
}

interface UsersBannedList {
  cmd: "users_banned_list";
  users: string[];
}

interface MessageReactAdd {
  cmd: "message_react_add";
  emoji: string;
  channel: string;
  id: string;
  from: string;
  thread_id?: string;
  global: boolean;
}

interface MessageReactRemove {
  cmd: "message_react_remove";
  emoji: string;
  channel: string;
  id: string;
  from: string;
  thread_id?: string;
  global: boolean;
}

interface MessagesSearch {
  cmd: "messages_search";
  results: Array<{
    id: string;
    channel: string;
    content: string;
    user: string;
    timestamp: number;
  }>;
}

interface PingsGet {
  cmd: "pings_get";
  messages: Array<{
    id: string;
    channel: string;
    content: string;
    user: string;
    timestamp: number;
  }>;
  offset: number;
  total: number;
}

interface ListPings {
  cmd: "list_pings";
  messages: Array<{ channel: string; timestamp: number }>;
}

interface MessagesPinned {
  cmd: "messages_pinned";
  messages: Message[];
}

interface UserJoin {
  cmd: "user_join";
  user: ServerUser;
}

interface UserLeave {
  cmd: "user_leave";
  username: string;
}

interface UserStatus {
  cmd: "user_status";
  username: string;
  status: {
    status: "online" | "idle" | "dnd" | "offline";
    text?: string;
  };
}

interface NicknameUpdate {
  cmd: "nickname_update";
  username: string;
  nickname: string;
}

interface NicknameRemove {
  cmd: "nickname_remove";
  username: string;
}

interface UserUpdate {
  cmd: "user_update";
  user: string;
  nickname?: string | null;
  username?: string;
}

interface VoiceJoin {
  cmd: "voice_join";
  channel: string;
  participants?: VoiceUser[];
}

interface VoiceUserJoined {
  cmd: "voice_user_joined";
  channel: string;
  user: VoiceUser;
}

interface VoiceUserLeft {
  cmd: "voice_user_left";
  channel: string;
  username: string;
}

interface VoiceUserUpdated {
  cmd: "voice_user_updated";
  channel: string;
  user: VoiceUser;
}

interface VoiceLeave {
  cmd: "voice_leave";
  channel: string;
}

interface SlashList {
  cmd: "slash_list";
  commands: Array<{
    name: string;
    description: string;
    options: Array<{
      name: string;
      description: string;
      type: string;
      required: boolean;
      choices: string[] | null;
    }>;
    whitelistRoles: string[] | null;
    blacklistRoles: string[] | null;
    ephemeral: boolean;
    registeredBy: string;
  }>;
}

interface SlashAdd {
  cmd: "slash_add";
  commands?: Array<{
    name: string;
    description: string;
    options: Array<{
      name: string;
      description: string;
      type: string;
      required: boolean;
      choices: string[] | null;
    }>;
    whitelistRoles: string[] | null;
    blacklistRoles: string[] | null;
    ephemeral: boolean;
    registeredBy: string;
  }>;
  command?: {
    name: string;
    description: string;
    options: Array<{
      name: string;
      description: string;
      type: string;
      required: boolean;
      choices: string[] | null;
    }>;
    whitelistRoles: string[] | null;
    blacklistRoles: string[] | null;
    ephemeral: boolean;
    registeredBy: string;
  };
}

interface SlashRemove {
  cmd: "slash_remove";
  commands?: string[];
  command?: string;
}

interface EmojiGetAll {
  cmd: "emoji_get_all";
  emojis: Record<string, { name: string; fileName: string }>;
}

interface EmojiAdd {
  cmd: "emoji_add";
  id: string | number;
  name: string;
  fileName?: string;
  added: boolean;
}

interface EmojiDelete {
  cmd: "emoji_delete";
  id: string | number;
  deleted: boolean;
}

interface EmojiUpdate {
  cmd: "emoji_update";
  id: string | number;
  name?: string;
  fileName?: string;
  updated: boolean;
}

interface PushVapid {
  cmd: "push_vapid";
  key?: string;
  vapid_key?: string;
  val?: string;
}

interface PushSubscribed {
  cmd: "push_subscribed";
  success: boolean;
}

interface ChannelUpdate {
  cmd: "channel_update";
  channel: Channel;
  current_name?: string;
  updated?: boolean;
  val?: string;
}

interface WebhookCreate {
  cmd: "webhook_create";
  webhook?: Webhook;
  val?: string;
}

interface WebhookList {
  cmd: "webhook_list";
  webhooks: Webhook[];
}

interface WebhookGet {
  cmd: "webhook_get";
  webhook: Webhook;
}

interface WebhookUpdate {
  cmd: "webhook_update";
  webhook: Webhook;
  updated?: boolean;
  val?: string;
}

interface WebhookRegenerate {
  cmd: "webhook_regenerate";
  webhook: Webhook;
}

interface WebhookDelete {
  cmd: "webhook_delete";
  id: string;
  deleted: boolean;
  val?: string;
}

interface AttachmentDeleted {
  cmd: "attachment_deleted";
  attachment_id: string;
  deleted: boolean;
}

interface ServerError {
  cmd: "error" | "err";
  val?: string;
  message?: string;
  error?: string;
}

export type {
  UsersList,
  UsersOnline,
  UserConnect,
  UserDisconnect,
  Ping,
  ChannelsGet,
  MessagesGet,
  MessagesAround,
  MessageGet,
  MessageNew,
  MessageEdit,
  MessageDelete,
  MessagePin,
  MessageUnpin,
  Typing,
  ThreadCreate,
  ThreadDelete,
  ThreadUpdate,
  ThreadGet,
  ThreadJoin,
  ThreadLeave,
  StatusSet,
  StatusGet,
  Handshake,
  Ready,
  AuthSuccess,
  RolesList,
  RoleReorder,
  UserRolesSet,
  UserRolesGet,
  UsersBannedList,
  MessageReactAdd,
  MessageReactRemove,
  MessagesSearch,
  PingsGet,
  ListPings,
  MessagesPinned,
  UserJoin,
  UserLeave,
  UserStatus,
  NicknameUpdate,
  NicknameRemove,
  UserUpdate,
  VoiceJoin,
  VoiceUserJoined,
  VoiceUserLeft,
  VoiceUserUpdated,
  VoiceLeave,
  SlashList,
  SlashAdd,
  SlashRemove,
  EmojiGetAll,
  EmojiAdd,
  EmojiDelete,
  EmojiUpdate,
  PushVapid,
  PushSubscribed,
  ChannelUpdate,
  WebhookCreate,
  WebhookList,
  WebhookGet,
  WebhookUpdate,
  WebhookRegenerate,
  WebhookDelete,
  AttachmentDeleted,
  ServerError,
  PollCreate,
  PollVote,
  PollVoteUpdate,
  PollEnd,
  PollResults,
  PollGet,
};

interface PollOption {
  id: string;
  text: string;
  emoji?: string;
}

interface PollResult {
  id: string;
  text: string;
  emoji?: string;
  votes: number;
  voted?: boolean;
  voters?: string[];
}

interface PollResults {
  poll_id: string;
  question: string;
  allow_multiselect?: boolean;
  ended?: boolean;
  ended_at?: number;
  total_votes: number;
  results: PollResult[];
}

interface PollCreate {
  cmd: "poll_create";
  poll_id: string;
  message_id: string;
  channel?: string;
  thread_id?: string;
  question: string;
  options: PollOption[];
  allow_multiselect?: boolean;
  expires_at?: number;
}

interface PollVote {
  cmd: "poll_vote";
  poll_id: string;
  option_ids: string[];
  results: PollResults;
}

interface PollVoteUpdate {
  cmd: "poll_vote_update";
  poll_id: string;
  message_id: string;
  channel?: string;
  thread_id?: string;
  user: string;
  option_ids: string[];
  results: PollResults;
}

interface PollEnd {
  cmd: "poll_end";
  poll_id: string;
  message_id?: string;
  channel?: string;
  thread_id?: string;
  results: PollResults;
}

interface PollResultsMsg {
  cmd: "poll_results";
  poll_id: string;
  message_id?: string;
  results: PollResults;
}

interface PollGet {
  cmd: "poll_get";
  poll: {
    id: string;
    message_id: string;
    channel?: string;
    thread_id?: string;
    question: string;
    options: PollOption[];
    allow_multiselect?: boolean;
    expires_at?: number;
    created_by: string;
    created_at: number;
    ended?: boolean;
    ended_at?: number;
    user_votes: string[];
  };
}
