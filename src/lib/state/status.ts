import { signal } from "@preact/signals";

type ServerUrl = string;
type Username = string;

interface UserStatus {
  status: "online" | "idle" | "dnd" | "offline";
  text?: string;
}

type StatusMap = Record<ServerUrl, Record<Username, UserStatus>>;

class StatusState {
  readonly byServer = signal<StatusMap>({});

  getStatus(serverUrl: ServerUrl, username: Username): UserStatus | undefined {
    return this.byServer.value[serverUrl]?.[username.toLowerCase()];
  }

  getServerStatuses(serverUrl: ServerUrl): Record<Username, UserStatus> {
    return this.byServer.value[serverUrl] || {};
  }

  setStatus(
    serverUrl: ServerUrl,
    username: Username,
    status: UserStatus,
  ): void {
    const lowerUsername = username.toLowerCase();
    const current = this.byServer.value[serverUrl] || {};
    this.byServer.value = {
      ...this.byServer.value,
      [serverUrl]: {
        ...current,
        [lowerUsername]: status,
      },
    };
  }

  updateFromStatusGet(
    serverUrl: ServerUrl,
    username: Username,
    status: UserStatus,
  ): void {
    this.setStatus(serverUrl, username, status);
  }

  updateFromReady(
    serverUrl: ServerUrl,
    username: Username,
    status: UserStatus,
  ): void {
    this.setStatus(serverUrl, username, status);
  }

  clearServer(serverUrl: ServerUrl): void {
    if (this.byServer.value[serverUrl]) {
      const next = { ...this.byServer.value };
      delete next[serverUrl];
      this.byServer.value = next;
    }
  }

  clearAll(): void {
    this.byServer.value = {};
  }
}

export const statusState = new StatusState();
