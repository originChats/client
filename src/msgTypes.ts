import type { Channel, Message, ServerUser, Thread } from "./types";

interface UsersList {
  cmd: "users_list";
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
  range: {
    start: number;
    end: number;
  };
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

interface ThreadGet {
  cmd: "thread_get";
  thread: Thread;
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

export type {
  UserConnect,
  UserDisconnect,
  Ping,
  ChannelsGet,
  MessagesGet,
  MessageGet,
  MessageNew,
  MessageEdit,
  MessageDelete,
  MessagePin,
  MessageUnpin,
  Typing,
  ThreadCreate,
  ThreadDelete,
  ThreadGet,
  StatusSet,
  StatusGet,
};
