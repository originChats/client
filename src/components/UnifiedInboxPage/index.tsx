import { signal, useSignalEffect } from "@preact/signals";
import { useState, useEffect, useCallback } from "preact/hooks";
import {
  servers,
  serverCapabilitiesByServer,
  usersByServer,
  DM_SERVER_URL,
  serverUrl as currentServerUrl,
} from "../../state";
import {
  unifiedInboxMessages,
  unifiedInboxLoading,
} from "../../lib/ui-signals";
import { wsSend } from "../../lib/websocket";
import { switchServer, selectChannel } from "../../lib/actions";
import { Icon } from "../Icon";
import { MessageGroupRow } from "../MessageGroupRow";
import { showContextMenu } from "../../lib/ui-signals";
import "./UnifiedInboxPage.css";

const selectedServerFilter = signal<string | null>(null);
const pendingServers = signal<Set<string>>(new Set());
const collectedPings = signal<any[]>([]);

function formatFullDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function UnifiedInboxPage() {
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchPings = useCallback(() => {
    setHasLoaded(true);
    collectedPings.value = [];
    const pending = new Set<string>();
    const caps = serverCapabilitiesByServer.value;

    servers.value
      .filter((s) => s.url !== DM_SERVER_URL)
      .forEach((s) => {
        const serverCaps = caps[s.url] ?? [];
        if (serverCaps.includes("pings_get")) {
          pending.add(s.url);
          wsSend({ cmd: "pings_get", limit: 50, offset: 0 }, s.url);
        }
      });

    pendingServers.value = pending;
    unifiedInboxLoading.value = pending.size > 0;
  }, []);

  useSignalEffect(() => {
    if (!hasLoaded) {
      fetchPings();
    }
  });

  useSignalEffect(() => {
    const pending = pendingServers.value;
    if (pending.size === 0 && hasLoaded) {
      const sorted = [...collectedPings.value].sort(
        (a, b) => b.timestamp - a.timestamp,
      );
      unifiedInboxMessages.value = sorted;
      unifiedInboxLoading.value = false;
    }
  });

  const msgs = unifiedInboxMessages.value;
  const loading = unifiedInboxLoading.value;
  const filter = selectedServerFilter.value;

  const filteredMsgs = filter
    ? msgs.filter((m) => m.serverUrl === filter)
    : msgs;

  const handleContextMenu = (e: any, msg: any) => {
    e.preventDefault();
    showContextMenu(e, [
      {
        label: "Copy text",
        icon: "Copy",
        fn: () => navigator.clipboard.writeText(msg.content),
      },
    ]);
  };

  const jumpToMessage = async (msg: any) => {
    const targetServer = servers.value.find((s) => s.url === msg.serverUrl);
    if (targetServer && currentServerUrl.value !== msg.serverUrl) {
      switchServer(msg.serverUrl);
    }
    setTimeout(async () => {
      const { channels } = await import("../../state");
      const targetChannel = channels.value.find(
        (c: any) => c.name === msg.channel,
      );
      if (targetChannel) {
        selectChannel(targetChannel);
      }
      setTimeout(() => {
        const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("highlight-flash");
          setTimeout(() => el.classList.remove("highlight-flash"), 2000);
        }
      }, 200);
    }, 200);
  };

  const InboxRow = ({ msg }: { msg: any }) => {
    const replyUserColor = msg.reply_to?.user
      ? usersByServer.value[msg.serverUrl]?.[msg.reply_to.user?.toLowerCase()]
          ?.color || undefined
      : undefined;

    return (
      <div className="unified-inbox-row">
        <div className="unified-inbox-context">
          <span className="unified-context-server">{msg.serverName}</span>
          <Icon name="ChevronRight" size={10} />
          <span className="unified-context-channel">
            <Icon name="Hash" size={10} />
            {msg.channel}
          </span>
          <span className="unified-context-time">
            {formatFullDateTime(msg.timestamp)}
          </span>
        </div>
        <MessageGroupRow
          group={{ head: msg, following: [] }}
          onClick={() => jumpToMessage(msg)}
          onContextMenu={(e: any) => handleContextMenu(e, msg)}
          showReply={true}
          replyUserColor={replyUserColor}
        />
      </div>
    );
  };

  return (
    <div className="unified-inbox-page">
      <div className="unified-inbox-sidebar">
        <div className="unified-inbox-sidebar-header">
          <Icon name="Bell" size={18} />
          <span>Inbox</span>
          <button
            className="unified-inbox-refresh"
            onClick={fetchPings}
            disabled={loading}
            aria-label="Refresh"
          >
            <Icon name="RefreshCw" size={14} />
          </button>
        </div>
        <div className="unified-inbox-server-list">
          <div
            className={`unified-inbox-server-item${!filter ? " active" : ""}`}
            onClick={() => (selectedServerFilter.value = null)}
          >
            <Icon name="Globe" size={16} />
            <span>All Servers</span>
            {msgs.length > 0 && (
              <span className="unified-inbox-count">{msgs.length}</span>
            )}
          </div>
          {servers.value
            .filter((s) => s.url !== DM_SERVER_URL)
            .map((s) => {
              const count = msgs.filter((m) => m.serverUrl === s.url).length;
              return (
                <div
                  key={s.url}
                  className={`unified-inbox-server-item${filter === s.url ? " active" : ""}`}
                  onClick={() => (selectedServerFilter.value = s.url)}
                >
                  {s.icon ? (
                    <img
                      src={s.icon}
                      alt={s.name}
                      className="unified-inbox-server-icon"
                    />
                  ) : (
                    <div className="unified-inbox-server-placeholder">
                      {s.name[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <span>{s.name}</span>
                  {count > 0 && (
                    <span className="unified-inbox-count">{count}</span>
                  )}
                </div>
              );
            })}
        </div>
      </div>
      <div className="unified-inbox-content">
        <div className="unified-inbox-header">
          <h2>
            {filter
              ? `Mentions in ${servers.value.find((s) => s.url === filter)?.name || "Server"}`
              : "All Mentions"}
          </h2>
        </div>
        <div className="unified-inbox-messages">
          {loading ? (
            <div className="unified-inbox-empty">
              <div className="loading-throbber" />
              <span>Loading mentions...</span>
            </div>
          ) : filteredMsgs.length === 0 ? (
            <div className="unified-inbox-empty">
              <Icon name="BellOff" size={48} />
              <span>No mentions found</span>
            </div>
          ) : (
            filteredMsgs.map((msg) => (
              <InboxRow key={`${msg.serverUrl}-${msg.id}`} msg={msg} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function handleUnifiedInboxPingsGet(msg: any, sUrl: string) {
  const server = servers.value.find((s) => s.url === sUrl);
  if (!server) return;

  const pending = pendingServers.value;
  if (!pending.has(sUrl)) return;

  const incoming = msg.messages || [];
  const enriched = incoming.map((m: any) => ({
    ...m,
    serverUrl: sUrl,
    serverName: server.name,
  }));

  collectedPings.value = [...collectedPings.value, ...enriched];

  const newPending = new Set(pending);
  newPending.delete(sUrl);
  pendingServers.value = newPending;
}
