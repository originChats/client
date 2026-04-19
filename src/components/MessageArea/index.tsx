import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { Fragment, type h } from "preact";
import { memo } from "preact/compat";
import { useSignalEffect } from "@preact/signals";
import {
  parseEmojisInContainer,
  emojiImgUrl,
  isCustomEmoji,
  getCustomEmojiUrl,
} from "../../lib/emoji";
import { SkeletonMessageList } from "../Skeleton";
import styles from "./MessageArea.module.css";
import { addUniversalContextMenuItems } from "../../lib/link-context-menu";
import { downloadAttachment } from "../../lib/download-attachment";



import {
  currentChannel,
  currentThread,
  messages,
  messagesByServer,
  currentUser,
  replyTo,
  replyPing,
  serverUrl,
  users,
  usersByServer,
  channels,
  typingUsersByServer,
  sendTypingIndicators,
  DM_SERVER_URL,
  SPECIAL_CHANNELS,
  blockedUsers,
  blockedMessageDisplay,
  slashCommandsByServer,
  pingsInboxMessages,
  pingsInboxTotal,
  pingsInboxLoading,
  pingsInboxOffset,
  PINGS_INBOX_LIMIT,
  reachedOldestByServer,
  reachedNewestByServer,
  missedMessagesCount,
  serverCapabilities,
  hasCapability,
  currentUserByServer,
  threadsByServer,
  attachmentConfigByServer,
  rolesByServer,
  customEmojisByServer,
  servers,
} from "../../state";

import {
  rightPanelView,
  pinnedMessages,
  pinnedLoading,
  searchResults,
  searchLoading,
  mobilePanelOpen,
  showContextMenu,
  showVoiceCallView,
  showError,
  translatedMessages,
  translatingMessageId,
  renderMessagesSignal,
  missedMessagesAppearSignal,
} from "../../lib/ui-signals";
import { voiceState, voiceManager } from "../../voice";
import { dmVoiceStates } from "../../lib/commands/voice/voice";
import { wsSend, fetchMissingReplyMessage, jumpToMessageAround } from "../../lib/websocket";
import { setPendingOlderLoad, setPendingNewerLoad } from "../../lib/commands/message/s_around";
import {
  highlightCodeInContainer,
  replaceShortcodes,
  convertChannelMentionsToLinks,
} from "../../lib/markdown";
import { selectChannel, switchServer, joinThread, selectThread } from "../../lib/actions";
import { loadShortcodes } from "../../lib/shortcodes";

function transformCustomEmojisToUrls(text: string): string {
  return text.replace(/:[\w][\w-]*:/g, (match) => {
    const name = match.slice(1, -1);
    for (const sUrl of customEmojisByServer.keys()) {
      const emojis = customEmojisByServer.read(sUrl);
      for (const emoji of Object.values(emojis)) {
        if (emoji.name === name) {
          return `originChats:<emoji>//${sUrl}/${emoji.id}`;
        }
      }
    }
    return match;
  });
}
import { Icon } from "../Icon";
import { MembersList } from "../MembersList";
import { UserContextMenu, useUserContextMenu } from "../UserContextMenu";
import { ConfirmDialog } from "../Modal";
import { ImageViewer } from "../ImageViewer";
import { UnifiedPicker } from "../UnifiedPicker";
import { uploadImage, getEnabledMediaServer } from "../../lib/media-uploader";
import {
  uploadAttachment,
  mimeTypeToAcceptString,
  isMimeTypeAllowed,
  cancelUpload,
} from "../../lib/attachment-uploader";
import type { PendingAttachment } from "../../lib/attachment-uploader";
import { MessageContent } from "../MessageContent";
import { MessageGroupRow } from "../MessageGroupRow";
import { pendingMessages } from "../../lib/state/pending-messages";
import {
  FloatingActionButtons,
  showActionButtons,
  hideActionButtons,
} from "../MessageActionButtons/FloatingActionButtons";
import { WebhookBadge } from "../WebhookBadge";
import { AttachmentPreview } from "../AttachmentPreview";
import { openUserPopout } from "../UserPopout";
import { UserProfileCard } from "../UserProfile";
import { imageViewerState } from "../../lib/ui-signals";
import { InputAutocomplete, useInputAutocomplete } from "../InputAutocomplete";
import { SlashCommandInput } from "../SlashCommandInput";
import type { SlashCommandArgs } from "../SlashCommandInput";
import { useScrollLock } from "../UserProfile/useScrollLock";
import { PollCreateModal } from "../PollCreateModal";
import type { Message, SlashCommand } from "../../types";
import { avatarUrl } from "../../utils";
import { UserAvatar } from "../UserAvatar";
import { useDisplayName, getDisplayName } from "../../lib/useDisplayName";
import { SwipeableMessage } from "./SwipeableMessage";

function MessageUsername({
  username,
  color,
  className = "username",
  onClick,
  onContextMenu,
}: {
  username: string;
  color?: string;
  className?: string;
  onClick?: (e: any) => void;
  onContextMenu?: (e: any) => void;
}) {
  const displayName = useDisplayName(username);
  return (
    <span
      className={className}
      style={color ? { color } : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {displayName}
    </span>
  );
}
import { ErrorBannerStack } from "../ErrorBanner";
import { createGift, ROTUR_GIFT_URL } from "../../lib/rotur-api";
import { VoiceCallView } from "../VoiceCallView";
import { Header } from "../Header";
import { startChannelLoad } from "../../lib/image-cache";
import { formatMessageTime, formatShortDateTime, formatRelativeTimeSec } from "../../lib/date-utils";

const highlightTimeouts = new Set<ReturnType<typeof setTimeout>>();

function highlightMessageElement(id: string): boolean {
  const el = document.querySelector(`[data-msg-id="${id}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("highlight-flash");
    const timeoutId = setTimeout(() => {
      el.classList.remove("highlight-flash");
      highlightTimeouts.delete(timeoutId);
    }, 2000);
    highlightTimeouts.add(timeoutId);
    return true;
  }
  return false;
}

function getThreadInfo() {
  const isThread = !!(currentChannel.value?.type === "thread" && currentThread.value);
  const threadId = isThread ? currentThread.value!.id : null as string | null;
  const ch = (isThread
    ? (currentChannel.value as any).parent_channel
    : currentChannel.value?.name) || "";
  const messageKey = threadId || ch;
  return { isThread, threadId, ch, messageKey };
}



interface PendingImage {
  url: string;
  fileName: string;
  id: number;
}

// Module-level pending images so sendMessage can access them
let pendingImageUploads: PendingImage[] = [];
let setPendingImagesRef: ((imgs: PendingImage[]) => void) | null = null;

let pendingAttachmentUploads: PendingAttachment[] = [];
let setPendingAttachmentsRef: ((atts: PendingAttachment[]) => void) | null = null;

function resetInputHeight() {
  const input = document.getElementById("message-input") as HTMLTextAreaElement;
  if (input) {
    input.style.height = "auto";
  }
}

// Module-level ref so sendMessage() can read slash command state set by the component
let activeSlashCmdRef: SlashCommand | null = null;
let slashArgsRef: SlashCommandArgs = {};
let dismissSlashCmdRef: (() => void) | null = null;
let editingMessageRef: Message | null = null;

function commitEditOrSend() {
  if (editingMessageRef) {
    const input = document.getElementById("message-input") as HTMLTextAreaElement;
    if (input && input.value.trim()) {
      const { isThread, threadId } = getThreadInfo();
      wsSend({
        cmd: "message_edit",
        id: editingMessageRef.id,
        channel: currentChannel.value?.name,
        ...(isThread && { thread_id: threadId }),
        content: convertChannelMentionsToLinks(
          replaceShortcodes(input.value.trim()),
          serverUrl.value,
          new Set(channels.value.filter((c) => c.name).map((c) => c.name.toLowerCase()))
        ),
      });
      editingMessageRef = null;
      input.value = "";
      resetInputHeight();
    }
  } else {
    sendMessage();
  }
}

async function sendMessage() {
  // ── Slash command mode ────────────────────────────────────────────────────
  if (activeSlashCmdRef) {
    if (!currentChannel.value) return;
    const cmd = activeSlashCmdRef;
    const args = slashArgsRef;
    const sUrl = serverUrl.value;
    // Build the typed args object — coerce numeric types
    const typedArgs: Record<string, string | number | boolean> = {};
    for (const opt of cmd.options) {
      const raw = args[opt.name];
      if (raw === undefined || raw === "") continue;
      if (opt.type === "int") typedArgs[opt.name] = parseInt(raw, 10);
      else if (opt.type === "float") typedArgs[opt.name] = parseFloat(raw);
      else if (opt.type === "bool") typedArgs[opt.name] = raw === "true" || raw === "1";
      else typedArgs[opt.name] = raw;
    }
    wsSend(
      {
        cmd: "slash_call",
        channel: currentChannel.value.name,
        command: cmd.name,
        args: typedArgs,
      },
      sUrl
    );
    dismissSlashCmdRef?.();
    return;
  }

  // ── Normal message mode ───────────────────────────────────────────────────
  const input = document.getElementById("message-input") as HTMLTextAreaElement;
  const content = input?.value?.trim() || "";
  const hasImages = pendingImageUploads.length > 0;
  const hasAttachments = pendingAttachmentUploads.length > 0;
  const hasText = content.length > 0;

  if (!hasText && !hasImages && !hasAttachments) return;
  if (!currentChannel.value) return;

  const thread = currentThread.value;
  const myUsername = currentUserByServer.read(serverUrl.value)?.username;
  const isThread = currentChannel.value?.type === "thread";
  if (isThread && thread && hasCapability("thread_join")) {
    const isParticipant = thread.participants?.includes(myUsername || "");
    if (!isParticipant) {
      joinThread(thread.id);
    }
  }

  let finalContent = content;
  if (hasImages && !hasCapability("attachment_upload")) {
    const imageUrls = pendingImageUploads.map((img) => img.url);
    if (hasText) {
      finalContent = content + "\n" + imageUrls.join("\n");
    } else {
      finalContent = imageUrls.join("\n");
    }
  }

  if (input) {
    input.value = "";
    resetInputHeight();
  }

  // Clear pending images
  pendingImageUploads = [];
  if (setPendingImagesRef) setPendingImagesRef([]);

  // Clear pending attachments
  const attachmentsToSend = [...pendingAttachmentUploads];
  pendingAttachmentUploads = [];
  if (setPendingAttachmentsRef) setPendingAttachmentsRef([]);

  const msg: any = {
    cmd: "message_new",
    content: convertChannelMentionsToLinks(
      replaceShortcodes(transformCustomEmojisToUrls(finalContent)),
      serverUrl.value,
      new Set(channels.value.filter((c) => c.name).map((c) => c.name.toLowerCase()))
    ),
    ...(isThread
      ? {
          thread_id: currentThread.value?.id,
          channel: (currentChannel.value as any).parent_channel,
        }
      : { channel: currentChannel.value.name }),
  };
  if (attachmentsToSend.length > 0) {
    msg.attachments = attachmentsToSend.map((att) => ({ id: att.id }));
  }
  if (replyTo.value) {
    msg.reply_to = replyTo.value.id;
    if (!replyPing.value) msg.ping = false;
    replyTo.value = null;
    replyPing.value = true;
  }

  // Add pending message for optimistic UI
  if (myUsername) {
    const channelKey = isThread ? currentThread.value?.id : currentChannel.value?.name;
    if (channelKey) {
      pendingMessages.add(serverUrl.value, channelKey, {
        user: myUsername,
        content: msg.content,
        timestamp: Math.floor(Date.now() / 1000),
        reply_to: msg.reply_to ? { id: msg.reply_to, user: "" } : undefined,
        attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      });
      renderMessagesSignal.value++;
    }
  }

  wsSend(msg);
}

interface MessageGroup {
  head: Message;
  following: Message[];
}

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;

  for (const msg of messages) {
    const shouldStartNewGroup =
      !currentGroup ||
      msg.user !== currentGroup.head.user ||
      msg.timestamp - currentGroup.head.timestamp >= 300 ||
      !!msg.reply_to;

    if (shouldStartNewGroup) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { head: msg, following: [] };
    } else if (currentGroup) {
      currentGroup.following.push(msg);
    }
  }

  if (currentGroup) groups.push(currentGroup);
  return groups;
}

function scrollToMessage(id: string): void {
  mobilePanelOpen.value = false;
  const messageKey = currentThread.value?.id || currentChannel.value?.name;
  const msgs = messageKey ? messages.value[messageKey] || [] : [];
  const exists = msgs.some((m) => m.id === id);

  if (exists) {
    highlightMessageElement(id);
  } else {
    const caps = serverCapabilities.value;
    const hasAround = caps.includes("messages_around");
    if (hasAround && currentChannel.value?.name) {
      const sUrl = serverUrl.value;
      const threadId =
        currentChannel.value?.type === "thread" ? currentThread.value?.id : undefined;
      jumpToMessageAround(sUrl, currentChannel.value.name, id, threadId);
    }
  }
}

function RightPanelMessageCard({
  msg,
  onAttachmentContextMenu,
}: {
  msg: any;
  onAttachmentContextMenu?: (e: MouseEvent, att: { id: string }) => void;
}) {
  const caps = serverCapabilities.value;
  const canPin = caps.includes("message_pin") && caps.includes("messages_pinned");

  return (
    <div key={msg.id} className="right-panel-message" onClick={() => scrollToMessage(msg.id)}>
      <div className="right-panel-message-header">
        <UserAvatar username={msg.user} className="right-panel-avatar" alt={msg.user} />
        <MessageUsername
          username={msg.user}
          color={users.value[msg.user?.toLowerCase()]?.color ?? undefined}
          className="right-panel-username"
        />
        <span className="right-panel-time">{formatRelativeTimeSec(msg.timestamp)}</span>
      </div>
      <div className="right-panel-message-content">
        <MessageContent
          content={msg.content}
          currentUsername={currentUser.value?.username}
          authorUsername={msg.user}
          pings={msg.pings}
        />
        {msg.attachments && msg.attachments.length > 0 && (
          <AttachmentPreview
            attachments={msg.attachments}
            hasContent={!!msg.content}
            onContextMenu={onAttachmentContextMenu}
          />
        )}
      </div>
      <div className="right-panel-message-actions">
        {canPin && (
          <button
            className="right-panel-unpin-btn"
            onClick={(e) => {
              e.stopPropagation();
              wsSend({
                cmd: "message_pin",
                id: msg.id,
                channel: currentChannel.value?.name,
                pinned: false,
              });
              pinnedMessages.value = pinnedMessages.value.filter((m) => m.id !== msg.id);
            }}
            title="Unpin"
          >
            <Icon name="PinOff" size={14} />
          </button>
        )}
        <div className="right-panel-message-action">
          <Icon name="ExternalLink" size={14} />
        </div>
      </div>
    </div>
  );
}

function RightPanelInner() {
  const [searchQuery, setSearchQuery] = useState("");
  const panelView = rightPanelView.value;
  const isDMServer = serverUrl.value === DM_SERVER_URL;
  const panelOpen = mobilePanelOpen.value;
  const panelClass = `right-panel${panelOpen ? " open" : ""}`;

  const caps = serverCapabilities.value;
  const canPin = caps.includes("message_pin") && caps.includes("messages_pinned");
  const canSearch = caps.includes("messages_search");
  const canInbox = caps.includes("pings_get");

  // Derive the DM recipient username from the current channel's display_name
  let dmUser: string | null = null;
  if (isDMServer) {
    const chName = currentChannel.value?.name;
    if (chName && !SPECIAL_CHANNELS.has(chName)) {
      dmUser = currentChannel.value?.display_name || null;
    }
  }

  if (!panelView) return null;

  if (panelView === "members") {
    // A 1-on-1 DM has icon matching "https://avatars.rotur.dev/{display_name}";
    // anything else (group chat) should show the normal members list
    const is1on1DM =
      isDMServer &&
      dmUser &&
      currentChannel.value?.icon === avatarUrl(currentChannel.value?.display_name ?? "");

    if (is1on1DM) {
      return (
        <div className={`members-list ${panelClass} dm-profile-panel`}>
          <div className="dm-profile-panel-body">
            <UserProfileCard key={dmUser} username={dmUser!} compactActions />
          </div>
        </div>
      );
    }
    return <MembersList />;
  }

  if (panelView === "pinned") {
    const msgs = pinnedMessages.value;
    const loading = pinnedLoading.value;
    const pinnedGroups = groupMessages(msgs);

    const handlePinnedMessageContextMenu = (e: any, msg: Message) => {
      e.preventDefault();
      const isOwn = msg.user === currentUser.value?.username;
      const menuItems: any[] = [];

      menuItems.push({
        label: "Copy text",
        icon: "Copy",
        fn: () => navigator.clipboard.writeText(msg.content),
      });

      if (canPin) {
        menuItems.push({
          label: "Unpin",
          icon: "PinOff",
          fn: () => {
            wsSend({
              cmd: "message_pin",
              id: msg.id,
              channel: currentChannel.value?.name,
              pinned: false,
            });
            pinnedMessages.value = pinnedMessages.value.filter((m) => m.id !== msg.id);
          },
        });
      }

      showContextMenu(e, addUniversalContextMenuItems(e, menuItems));
    };

    return (
      <div className={`members-list ${panelClass}`}>
        <div className="right-panel-header">
          <Icon name="Pin" size={18} />
          <span>Pinned Messages</span>
          <button
            className="right-panel-close"
            onClick={() => {
              mobilePanelOpen.value = false;
            }}
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className={`right-panel-content ${styles.rightPanelContentMessages}`}>
          {!canPin ? (
            <div className="right-panel-unsupported">
              <Icon name="Pin" size={32} />
              <span>This feature doesn't seem to be supported on this server.</span>
            </div>
          ) : loading ? (
            <div className="right-panel-empty">
              <div className="loading-throbber" />
            </div>
          ) : msgs.length === 0 ? (
            <div className="right-panel-empty">
              <Icon name="Pin" size={40} />
              <span>No pinned messages</span>
            </div>
          ) : (
            pinnedGroups.map((group) => (
              <MessageGroupRow
                key={group.head.id}
                group={group}
                onContextMenu={(e: any) => handlePinnedMessageContextMenu(e, group.head)}
                translatedMessages={translatedMessages.value}
                translatingMessageId={translatingMessageId.value}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  const handleCopyContextMenu = (e: any, text: string) => {
    e.preventDefault();
    const menuItems: any[] = [
      {
        label: "Copy text",
        icon: "Copy",
        fn: () => navigator.clipboard.writeText(text),
      },
    ];
    showContextMenu(e, menuItems);
  };

  if (panelView === "search") {
    const results = searchResults.value;
    const loading = searchLoading.value;

    const performSearch = () => {
      const query = searchQuery.trim();
      if (!query || !currentChannel.value || !canSearch) return;
      searchLoading.value = true;
      searchResults.value = [];
      wsSend({
        cmd: "messages_search",
        channel: currentChannel.value.name,
        query,
      });
    };

    return (
      <div className={`members-list ${panelClass}`}>
        <div className="right-panel-header">
          <Icon name="Search" size={18} />
          <span>Search</span>
          <button
            className="right-panel-close"
            onClick={() => {
              mobilePanelOpen.value = false;
            }}
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="right-panel-search-input">
          <input
            type="text"
            placeholder={`Search in #${currentChannel.value?.name || ""}...`}
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") performSearch();
            }}
            autoFocus
          />
          <button className="search-submit-btn" onClick={performSearch}>
            <Icon name="Search" size={16} />
          </button>
        </div>
        {!loading && results && results.length > 0 && (
          <div className="right-panel-search-count">
            {results.length} result{results.length === 1 ? "" : "s"}
          </div>
        )}
        <div className={`right-panel-content ${styles.rightPanelContentMessages}`}>
          {!canSearch ? (
            <div className="right-panel-unsupported">
              <Icon name="Search" size={32} />
              <span>This feature doesn't seem to be supported on this server.</span>
            </div>
          ) : loading ? (
            <div className="right-panel-empty">
              <div className="loading-throbber" />
            </div>
          ) : results.length === 0 && searchQuery.trim() ? (
            <div className="right-panel-empty">
              <Icon name="Search" size={40} />
              <span>No results found</span>
            </div>
          ) : results.length === 0 ? (
            <div className="right-panel-empty">
              <Icon name="Search" size={40} />
              <span>Enter a search term</span>
            </div>
          ) : (
            results.map((msg) => (
              <MessageGroupRow
                key={msg.id}
                group={{ head: msg, following: [] }}
                onClick={() => scrollToMessage(msg.id!)}
                onContextMenu={(e: any) => handleCopyContextMenu(e, msg.content)}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  if (panelView === "inbox") {
    const msgs = pingsInboxMessages.value;
    const total = pingsInboxTotal.value;
    const loading = pingsInboxLoading.value;
    const offset = pingsInboxOffset.value;
    const hasMore = offset + msgs.length < total;
    const currentServerData = servers.value.find((s) => s.url === serverUrl.value);
    const serverName = currentServerData?.name || serverUrl.value;

    const loadMore = () => {
      if (!canInbox) return;
      const nextOffset = offset + PINGS_INBOX_LIMIT;
      pingsInboxLoading.value = true;
      wsSend({
        cmd: "pings_get",
        limit: PINGS_INBOX_LIMIT,
        offset: nextOffset,
      });
    };

    const jumpToMessage = async (msg: any) => {
      const { selectChannel } = await import("../../lib/actions");
      const targetChannel = channels.value.find((c: any) => c.name === msg.channel);

      const caps = serverCapabilities.value;
      const hasAround = caps.includes("messages_around");
      const sUrl = serverUrl.value;

      if (targetChannel && currentChannel.value?.name !== msg.channel) {
        selectChannel(targetChannel);
      }

      mobilePanelOpen.value = false;

      if (hasAround && targetChannel) {
        jumpToMessageAround(sUrl, msg.channel, msg.id);
      } else {
        const scrollToMsg = () => highlightMessageElement(msg.id);

        if (!scrollToMsg()) {
          const checkInterval = setInterval(() => {
            if (scrollToMsg()) {
              clearInterval(checkInterval);
            }
          }, 100);
          setTimeout(() => clearInterval(checkInterval), 5000);
        }
      }
    };

    const InboxMessageRow = ({ msg }: { msg: any }) => {
      const msgWithTimestamp = {
        ...msg,
        timestamp: msg.timestamp,
      };
      const replyUserColor = msg.reply_to?.user
        ? users.value[msg.reply_to.user?.toLowerCase()]?.color || undefined
        : undefined;
      return (
        <div className={styles.inboxMessageRow}>
          <div className={styles.inboxMessageContext}>
            <Icon name="Hash" size={12} />
            <span className={styles.inboxContextChannel}>{msg.channel}</span>
            <span className={styles.inboxContextTime}>{formatShortDateTime(msg.timestamp)}</span>
          </div>
          <MessageGroupRow
            key={msg.id}
            group={{ head: msgWithTimestamp, following: [] }}
            onClick={() => jumpToMessage(msg)}
            onContextMenu={(e: any) => handleCopyContextMenu(e, msg.content)}
            showReply={true}
            replyUserColor={replyUserColor}
          />
        </div>
      );
    };

    return (
      <div className={`members-list ${panelClass}`}>
        <div className="right-panel-header">
          <Icon name="Bell" size={18} />
          <span>Inbox</span>
          {total > 0 && <span className={styles.inboxPanelTotal}>{total}</span>}
          <button
            className="right-panel-close"
            onClick={() => {
              mobilePanelOpen.value = false;
            }}
            aria-label="Close"
          >
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className={`right-panel-content ${styles.rightPanelContentMessages}`}>
          {!canInbox ? (
            <div className="right-panel-unsupported">
              <Icon name="Bell" size={32} />
              <span>This feature doesn\'t seem to be supported on this server.</span>
            </div>
          ) : loading && msgs.length === 0 ? (
            <div className="right-panel-empty">
              <div className="loading-throbber" />
            </div>
          ) : msgs.length === 0 ? (
            <div className="right-panel-empty">
              <Icon name="BellOff" size={40} />
              <span>No mentions yet</span>
            </div>
          ) : (
            <>
              {msgs.map((msg) => (
                <InboxMessageRow key={msg.id || `${msg.channel}-${msg.timestamp}`} msg={msg} />
              ))}
              {hasMore && (
                <button className={styles.inboxPanelLoadMore} onClick={loadMore} disabled={loading}>
                  {loading ? "Loading..." : "Load more"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}

const RightPanel = memo(RightPanelInner);

// ─── Blocked message collapse banner ─────────────────────────────────────────

function BlockedMessageBanner({
  count,
  username,
  children,
}: {
  count: number;
  username: string;
  children: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = count === 1 ? "1 message" : `${count} messages`;
  return (
    <div className={styles.blockedMessageBanner}>
      <button className={styles.blockedMessageToggle} onClick={() => setExpanded((v) => !v)}>
        <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={14} />
        <span>
          {label} from blocked user <strong>{username}</strong>
        </span>
      </button>
      {expanded && <div className={styles.blockedMessageContent}>{children}</div>}
    </div>
  );
}

export function MessageArea() {
  const lastChannelRef = useRef<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [channelLoading, setChannelLoading] = useState(false);
  const loadingOlderStartTime = useRef<number | null>(null);
  const loadingNewerStartTime = useRef<number | null>(null);
  const MIN_SKELETON_DISPLAY_MS = 300;

  const clearLoadingOlder = useCallback(() => {
    const elapsed = loadingOlderStartTime.current
      ? Date.now() - loadingOlderStartTime.current
      : MIN_SKELETON_DISPLAY_MS;
    const remaining = Math.max(0, MIN_SKELETON_DISPLAY_MS - elapsed);

    setTimeout(() => {
      setLoadingOlder(false);
      loadingOlderStartTime.current = null;
    }, remaining);
  }, []);

  const clearLoadingNewer = useCallback(() => {
    const elapsed = loadingNewerStartTime.current
      ? Date.now() - loadingNewerStartTime.current
      : MIN_SKELETON_DISPLAY_MS;
    const remaining = Math.max(0, MIN_SKELETON_DISPLAY_MS - elapsed);

    setTimeout(() => {
      setLoadingNewer(false);
      loadingNewerStartTime.current = null;
    }, remaining);
  }, []);

  const {
    containerRef: messagesContainerRef,
    showScrollBtn,
    scrollToBottom,
    scrollToMessage: scrollToMessageFromHook,
    resetForChannel,
    beginLoadOlder,
    beginLoadNewer,
    overscrollPadding,
    topSentinelRef,
    bottomSentinelRef,
  } = useScrollLock({
    isLoadingOlder: loadingOlder,
    onOlderLoaded: clearLoadingOlder,
    onLoadOlder: () => {
      const { isThread, threadId, ch, messageKey } = getThreadInfo();
      const sUrl = serverUrl.value;
      if (!ch || !sUrl) return;
      if (!isThread && SPECIAL_CHANNELS.has(ch)) return;
      if (reachedOldestByServer[sUrl]?.has(messageKey)) return;
      const msgs = messages.value[messageKey] || [];
      if (msgs.length === 0) return;

      const caps = serverCapabilities.value;
      const hasAround = caps.includes("messages_around");

      beginLoadOlder();
      loadingOlderStartTime.current = Date.now();
      setLoadingOlder(true);

      if (hasAround) {
        const oldestMsg = msgs[0];
        if (oldestMsg?.id) {
          setPendingOlderLoad(sUrl, messageKey);
          wsSend(
            threadId
              ? {
                  cmd: "messages_around",
                  thread_id: threadId,
                  around: oldestMsg.id,
                  bounds: { above: 0, below: 100 },
                }
              : {
                  cmd: "messages_around",
                  channel: ch,
                  around: oldestMsg.id,
                  bounds: { above: 0, below: 100 },
                },
            sUrl
          );
        } else {
          setLoadingOlder(false);
        }
      } else {
        wsSend(
          threadId
            ? {
                cmd: "messages_get",
                thread_id: threadId,
                start: msgs.length,
                limit: 100,
              }
            : {
                cmd: "messages_get",
                channel: ch,
                start: msgs.length,
                limit: 100,
              },
          sUrl
        );
      }
    },
    onLoadNewer: () => {
      const { isThread, threadId, ch, messageKey } = getThreadInfo();
      const sUrl = serverUrl.value;
      if (!ch || !sUrl) return;
      if (!isThread && SPECIAL_CHANNELS.has(ch)) return;
      const msgs = messages.value[messageKey] || [];
      if (msgs.length === 0) return;

      const caps = serverCapabilities.value;
      const hasAround = caps.includes("messages_around");

      beginLoadNewer();
      loadingNewerStartTime.current = Date.now();
      setLoadingNewer(true);

      if (hasAround) {
        const newestMsg = msgs[msgs.length - 1];
        if (newestMsg?.id) {
          setPendingNewerLoad(sUrl, messageKey);
          wsSend(
            threadId
              ? {
                  cmd: "messages_around",
                  thread_id: threadId,
                  around: newestMsg.id,
                  bounds: { above: 100, below: 0 },
                }
              : {
                  cmd: "messages_around",
                  channel: ch,
                  around: newestMsg.id,
                  bounds: { above: 100, below: 0 },
                },
            sUrl
          );
        } else {
          setLoadingNewer(false);
        }
      } else {
        // Fallback: request messages from current position
        wsSend(
          threadId
            ? {
                cmd: "messages_get",
                thread_id: threadId,
                start: 0,
                limit: 100,
              }
            : {
                cmd: "messages_get",
                channel: ch,
                start: 0,
                limit: 100,
              },
          sUrl
        );
      }
    },
    isLoadingNewer: loadingNewer,
    onNewerLoaded: clearLoadingNewer,
    onUnloadMessages: (count: number, fromStart: boolean) => {
      const { isThread, threadId, ch, messageKey } = getThreadInfo();
      const sUrl = serverUrl.value;
      if (!ch || !sUrl || !messageKey) return;

      const msgs = messagesByServer.value[sUrl]?.[messageKey] || [];
      const MAX_MSGS = 200;
      if (msgs.length <= MAX_MSGS) return;

      const container = messagesContainerRef.current;
      if (!container) return;

      // Get the first visible message to anchor scroll position
      const visibleMessages = container.querySelectorAll("[data-msg-id]");
      let anchorMsgId: string | null = null;
      let anchorOffset = 0;

      for (let i = 0; i < visibleMessages.length; i++) {
        const el = visibleMessages[i] as HTMLElement;
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (rect.top >= containerRect.top && rect.top <= containerRect.bottom) {
          anchorMsgId = el.getAttribute("data-msg-id");
          anchorOffset = rect.top - containerRect.top;
          break;
        }
      }

      // Trim messages
      const newMsgs = fromStart ? msgs.slice(count) : msgs.slice(0, -count);

      messagesByServer.value = {
        ...messagesByServer.value,
        [sUrl]: {
          ...messagesByServer.value[sUrl],
          [messageKey]: newMsgs,
        },
      };
      renderMessagesSignal.value++;

      // Clear reached state when unloading from that end
      if (fromStart && reachedOldestByServer[sUrl]?.has(messageKey)) {
        reachedOldestByServer[sUrl].delete(messageKey);
      }
      if (!fromStart && reachedNewestByServer[sUrl]?.has(messageKey)) {
        reachedNewestByServer[sUrl].delete(messageKey);
      }

      // Restore scroll position to anchor message
      if (anchorMsgId) {
        requestAnimationFrame(() => {
          const anchorEl = container.querySelector(`[data-msg-id="${anchorMsgId}"]`);
          if (anchorEl) {
            const newOffset =
              (anchorEl as HTMLElement).getBoundingClientRect().top -
              container.getBoundingClientRect().top;
            container.scrollTop += newOffset - anchorOffset;
          }
        });
      }
    },
  });

  // Jump to bottom - request latest messages and scroll
  const jumpToBottom = useCallback(() => {
    const { isThread, threadId } = getThreadInfo();
    const ch = isThread ? (currentChannel.value as any).parent_channel : currentChannel.value?.name;
    const messageKey = threadId || ch;
    const sUrl = serverUrl.value;
    if (!ch || !sUrl || !messageKey) return;

    // Clear reached states, missed messages, and request fresh messages
    reachedOldestByServer[sUrl]?.delete(messageKey);
    reachedNewestByServer[sUrl]?.delete(messageKey);
    if (missedMessagesCount.read(sUrl)) {
      missedMessagesCount.update(sUrl, (counts) => ({
        ...counts,
        [messageKey]: 0,
      }));
    }

    wsSend(
      threadId
        ? { cmd: "messages_get", thread_id: threadId, start: 0, limit: 100 }
        : { cmd: "messages_get", channel: ch, start: 0, limit: 100 },
      sUrl
    );
    scrollToBottom();
  }, [scrollToBottom]);

  const [editingMessageState, setEditingMessageState] = useState<Message | null>(null);
  const setEditingMessage = (msg: Message | null) => {
    setEditingMessageState(msg);
    editingMessageRef = msg;
  };
  const editingMessage = editingMessageState;
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<"emoji" | "gif">("emoji");
  const [reactingToMessage, setReactingToMessage] = useState<Message | null>(null);
  const [reactionModal, setReactionModal] = useState<{
    emoji: string;
    users: string[];
  } | null>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef<number>(0);
  const [typingUsers, setTypingUsers] = useState<
    { username: string; displayName: string; color?: string | null }[]
  >([]);
  const [prevTypingUsers, setPrevTypingUsers] = useState<
    { username: string; displayName: string; color?: string | null }[]
  >([]);
  const [isTypingExiting, setIsTypingExiting] = useState(false);
  const typingExitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const { showUserMenu, closeUserMenu, userMenu } = useUserContextMenu();
  const autocomplete = useInputAutocomplete("message-input");

  // ── Slash command mode ─────────────────────────────────────────────────────
  const [activeSlashCmd, setActiveSlashCmd] = useState<SlashCommand | null>(null);
  const [slashArgs, setSlashArgs] = useState<SlashCommandArgs>({});

  const activateSlashCommand = useCallback((item: { type: string; label: string }): boolean => {
    if (item.type !== "slash") return false;
    const sUrl = serverUrl.value;
    const cmd = (slashCommandsByServer.read(sUrl) || []).find((c) => c.name === item.label);
    if (!cmd) return false;
    const input = document.getElementById("message-input") as HTMLTextAreaElement | null;
    if (input) {
      input.value = "";
      resetInputHeight();
    }
    autocomplete.close();
    setActiveSlashCmd(cmd);
    setSlashArgs({});
    return true;
  }, [autocomplete, setActiveSlashCmd, setSlashArgs]);

  const dismissSlashCmd = useCallback(() => {
    setActiveSlashCmd(null);
    setSlashArgs({});
    activeSlashCmdRef = null;
    slashArgsRef = {};
    // Return focus to the normal textarea
    setTimeout(() => {
      (document.getElementById("message-input") as HTMLTextAreaElement | null)?.focus();
    }, 0);
  }, []);

  // Keep module-level refs in sync so sendMessage() can read them
  useEffect(() => {
    activeSlashCmdRef = activeSlashCmd;
  }, [activeSlashCmd]);

  useEffect(() => {
    slashArgsRef = slashArgs;
  }, [slashArgs]);

  useEffect(() => {
    dismissSlashCmdRef = dismissSlashCmd;
    return () => {
      dismissSlashCmdRef = null;
    };
  }, [dismissSlashCmd]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  // Sync module-level ref so sendMessage() can access pending images
  useEffect(() => {
    setPendingImagesRef = setPendingImages;
    return () => {
      setPendingImagesRef = null;
    };
  }, []);

  useEffect(() => {
    setPendingAttachmentsRef = setPendingAttachments;
    return () => {
      setPendingAttachmentsRef = null;
    };
  }, []);

  // Close plus-button dropdown when clicking outside
  useEffect(() => {
    if (!showPlusMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showPlusMenu]);

  useEffect(() => {
    pendingImageUploads = pendingImages;
  }, [pendingImages]);

  useEffect(() => {
    pendingAttachmentUploads = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable;
      if (isEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      const input = document.getElementById("message-input") as HTMLTextAreaElement | null;
      if (!input) return;
      input.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Send typing event (throttled to once per 3 seconds)
  const sendTypingEvent = useCallback(() => {
    if (!sendTypingIndicators.value) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 3000) return;
    if (!currentChannel.value) return;
    lastTypingSent.current = now;
    wsSend({ cmd: "typing", channel: currentChannel.value.name });
  }, []);

  const typingSubRef = useRef<{
    unsub: (() => void) | null;
    sUrl: string;
    chName: string;
    prevUsernames: string;
  }>({ unsub: null, sUrl: "", chName: "", prevUsernames: "" });

  const computeTypingUsers = useCallback((sUrl: string, chName: string) => {
    const serverTyping = typingUsersByServer.read(sUrl);
    if (!serverTyping || !serverTyping[chName]) {
      typingSubRef.current.prevUsernames = "";
      setTypingUsers([]);
      return;
    }
    const map = serverTyping[chName] as Map<string, number>;
    const now = Date.now();
    const myName = currentUser.value?.username;
    const typingList: {
      username: string;
      displayName: string;
      color?: string | null;
    }[] = [];
    const newMap = new Map<string, number>();
    let hasExpired = false;
    for (const [user, expiry] of map.entries()) {
      if (expiry < now) {
        hasExpired = true;
      } else {
        newMap.set(user, expiry);
        if (user !== myName) {
          const serverUser = usersByServer.read(sUrl)?.[user.toLowerCase()];
          typingList.push({
            username: user,
            displayName: getDisplayName(user),
            color: serverUser?.color,
          });
        }
      }
    }
    if (hasExpired) {
      typingUsersByServer.update(sUrl, (current) => ({
        ...current,
        [chName]: newMap,
      }));
    }
    const usernames = typingList.map((t) => t.username).join(",");
    if (usernames !== typingSubRef.current.prevUsernames) {
      typingSubRef.current.prevUsernames = usernames;
      setTypingUsers(typingList);
    }
  }, []);

  useEffect(() => {
    const sUrl = serverUrl.value;
    const chName = currentChannel.value?.name;
    if (typingSubRef.current.unsub) typingSubRef.current.unsub();
    typingSubRef.current.sUrl = sUrl || "";
    typingSubRef.current.chName = chName || "";
    typingSubRef.current.prevUsernames = "";

    if (sUrl && chName) computeTypingUsers(sUrl, chName);
    else setTypingUsers([]);

    const typingSignal = typingUsersByServer.get(sUrl || "");
    const unsub = typingSignal.subscribe(() => {
      const cur = typingSubRef.current;
      if (!cur.sUrl || !cur.chName) return;
      const serverTyping = typingUsersByServer.read(cur.sUrl);
      if (!serverTyping) {
        if (cur.prevUsernames !== "") {
          cur.prevUsernames = "";
          setTypingUsers([]);
        }
        return;
      }
      const currentMap = serverTyping[cur.chName];
      if (!currentMap || (currentMap as Map<string, number>).size === 0) {
        if (cur.prevUsernames !== "") {
          cur.prevUsernames = "";
          setTypingUsers([]);
        }
        return;
      }
      computeTypingUsers(cur.sUrl, cur.chName);
    });
    typingSubRef.current.unsub = unsub;

    return () => {
      unsub();
      typingSubRef.current.unsub = null;
    };
  }, [serverUrl.value, currentChannel.value?.name, computeTypingUsers]);

  useEffect(() => {
    const interval = setInterval(() => {
      const cur = typingSubRef.current;
      if (!cur.sUrl || !cur.chName) return;
      const serverTyping = typingUsersByServer.read(cur.sUrl);
      if (!serverTyping || !serverTyping[cur.chName]) return;
      const map = serverTyping[cur.chName] as Map<string, number>;
      const now = Date.now();
      let hasExpired = false;
      for (const [, expiry] of map.entries()) {
        if (expiry < now) {
          hasExpired = true;
          break;
        }
      }
      if (hasExpired) computeTypingUsers(cur.sUrl, cur.chName);
    }, 2000);
    return () => clearInterval(interval);
  }, [computeTypingUsers]);

  // Handle typing indicator exit animation
  useEffect(() => {
    if (typingUsers.length === 0 && prevTypingUsers.length > 0) {
      setIsTypingExiting(true);
      if (typingExitTimeoutRef.current) {
        clearTimeout(typingExitTimeoutRef.current);
      }
      typingExitTimeoutRef.current = setTimeout(() => {
        setIsTypingExiting(false);
        setPrevTypingUsers([]);
      }, 150);
    } else if (typingUsers.length > 0) {
      setPrevTypingUsers(typingUsers);
      setIsTypingExiting(false);
      if (typingExitTimeoutRef.current) {
        clearTimeout(typingExitTimeoutRef.current);
      }
    }
  }, [typingUsers, prevTypingUsers.length]);

  useEffect(() => {
    return () => {
      highlightTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      highlightTimeouts.clear();
    };
  }, []);

  useEffect(() => {
    loadShortcodes();
  }, []);

  useSignalEffect(() => {
    const channelName = currentChannel.value?.name;
    const isChannelSwitch = lastChannelRef.current !== channelName;
    lastChannelRef.current = channelName || null;
    if (isChannelSwitch) {
      setLoadingOlder(false);
      resetForChannel();

      const ch = currentChannel.value;
      if (ch && !SPECIAL_CHANNELS.has(ch.name)) {
        const msgs =
          currentChannel.value?.type === "thread" && currentThread.value
            ? messages.value[currentThread.value.id] || []
            : messages.value[ch.name] || [];

        if (msgs.length > 0) {
          const imageUrls: string[] = [];
          msgs.forEach((msg) => {
            if (msg.content) {
              const urlMatch = msg.content.match(
                /https?:\/\/[^\s<>"']+\.(?:jpg|jpeg|png|gif|webp|avif)/gi
              );
              if (urlMatch) imageUrls.push(...urlMatch);
            }
          });

          if (imageUrls.length > 0) {
            const channelId =
              ch.type === "thread" && currentThread.value ? currentThread.value.id : ch.name;
            setChannelLoading(true);
            startChannelLoad(channelId, imageUrls).then(() => {
              setChannelLoading(false);
            });
          }
        }
      }
    }
  });

  const emojiParseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSignalEffect(() => {
    renderMessagesSignal.value;
    currentChannel.value;
    blockedUsers.value;
    blockedMessageDisplay.value;
    pendingMessages.versionSignal.value;
    missedMessagesAppearSignal.value;

    if (emojiParseTimerRef.current) clearTimeout(emojiParseTimerRef.current);
    emojiParseTimerRef.current = setTimeout(() => {
      emojiParseTimerRef.current = null;
      const messagesContainer = document.getElementById("messages");
      if (!messagesContainer) return;
      parseEmojisInContainer(messagesContainer);
      highlightCodeInContainer(messagesContainer);
    }, 32);
  });

  const currentMessages = currentChannel.value
    ? messages.value[
        currentChannel.value.type === "thread" && currentThread.value
          ? currentThread.value.id
          : currentChannel.value.name
      ] || []
    : [];
  const messageKey =
    currentChannel.value?.type === "thread" && currentThread.value
      ? currentThread.value.id
      : currentChannel.value?.name || "";

  const sUrl = serverUrl.value;
  const hasReachedNewest = reachedNewestByServer[sUrl]?.has(messageKey);
  const missedCount = missedMessagesCount.read(sUrl)?.[messageKey] || 0;

  const pendingForChannel = pendingMessages.get(serverUrl.value, messageKey);
  const messagesWithPending = [...currentMessages];
  for (const pm of pendingForChannel) {
    const isDuplicate = messagesWithPending.some(
      (m) =>
        m.id === pm.id ||
        (m.content === pm.content && m.user === pm.user && Math.abs(m.timestamp - pm.timestamp) < 5)
    );
    if (!isDuplicate) {
      messagesWithPending.push(pm);
    }
  }
  messagesWithPending.sort((a, b) => a.timestamp - b.timestamp);

  const messageGroups = groupMessages(messagesWithPending);

  const handleKeyDown = (e: h.JSX.TargetedKeyboardEvent<HTMLTextAreaElement>) => {
    if (autocomplete.state.value.active && (e.key === "Tab" || e.key === "Enter") && !e.shiftKey) {
      const item = autocomplete.state.value.items[autocomplete.state.value.selectedIndex];
      if (item?.type === "slash") {
        e.preventDefault();
        if (activateSlashCommand(item)) return;
      }
    }

    if (autocomplete.handleKeyDown(e as unknown as KeyboardEvent)) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const wasEditing = editingMessage;
      commitEditOrSend();
      if (wasEditing) setEditingMessage(null);
    } else if (e.key === "Escape") {
      if (editingMessage) {
        setEditingMessage(null);
        const input = document.getElementById("message-input") as HTMLTextAreaElement;
        if (input) {
          input.value = "";
          resetInputHeight();
        }
      } else if (replyTo.value) {
        replyTo.value = null;
        replyPing.value = true;
      }
    } else if (e.key === "ArrowUp" && !editingMessage) {
      const input = e.currentTarget;
      if (input.value === "" || input.selectionStart === 0) {
        const currentMessages = currentChannel.value
          ? messages.value[currentChannel.value.name] || []
          : [];
        const lastOwn = [...currentMessages]
          .reverse()
          .find((msg) => msg.user === currentUser.value?.username);
        if (lastOwn) {
          e.preventDefault();
          startEdit(lastOwn);
        }
      }
    } else if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      e.currentTarget.value += "\n";
      autoResize(e.currentTarget);
    }
  };

  const handleFileUpload = async (files: File[]) => {
    const sUrl = serverUrl.value;
    const attachmentConfig = attachmentConfigByServer.read(sUrl);
    const useNativeUpload = hasCapability("attachment_upload");

    if (useNativeUpload) {
      if (!attachmentConfig) {
        showError("Attachment configuration not loaded. Please try again.", {
          autoDismissMs: 5000,
        });
        return;
      }
      for (const file of files) {
        if (!isMimeTypeAllowed(file.type, attachmentConfig.allowed_types)) {
          showError(`File type ${file.type} is not allowed on this server`, {
            autoDismissMs: 5000,
          });
          continue;
        }
        if (file.size > attachmentConfig.max_size) {
          showError(
            `File ${file.name} exceeds maximum size of ${Math.round(attachmentConfig.max_size / 1024 / 1024)}MB`,
            { autoDismissMs: 5000 }
          );
          continue;
        }
        try {
          setUploading(true);

          const localUrl = URL.createObjectURL(file);
          const tempId = `temp_${Date.now()}_${Math.random()}`;

          setPendingAttachments((prev) => [
            ...prev,
            {
              id: tempId,
              name: file.name,
              mime_type: file.type,
              size: file.size,
              url: localUrl,
              uploading: true,
              progress: 0,
              localUrl,
            },
          ]);

          const result = await uploadAttachment(
            file,
            currentChannel.value?.name || "",
            tempId,
            (progress) => {
              setPendingAttachments((prev) =>
                prev.map((att) => (att.id === tempId ? { ...att, progress } : att))
              );
            }
          );

          setPendingAttachments((prev) =>
            prev.map((att) =>
              att.id === tempId
                ? {
                    ...att,
                    id: result.id,
                    url: result.url,
                    uploading: false,
                    expires_at: result.expires_at,
                    permanent: result.permanent,
                  }
                : att
            )
          );
        } catch (error: any) {
          showError(`Failed to upload ${file.name}: ${error.message || "Unknown error"}`);
          setPendingAttachments((prev) =>
            prev.filter((att) => att.name !== file.name || !att.uploading)
          );
        } finally {
          setUploading(false);
        }
      }
      return;
    }

    const server = await getEnabledMediaServer();
    if (!server) {
      showError("No media server configured. Please add a media server in settings.", {
        autoDismissMs: 5000,
      });
      return;
    }

    for (const file of files) {
      try {
        setUploading(true);

        const imageUrl = await uploadImage(file, server);

        setPendingImages((prev) => [
          ...prev,
          {
            url: imageUrl,
            fileName: file.name,
            id: Date.now() + Math.random(),
          },
        ]);
      } catch (error: any) {
        showError(`Failed to upload ${file.name}: ${error.message || "Unknown error"}`);
        return;
      } finally {
        setUploading(false);
      }
    }
  };

  const handleImageUpload = async (e: h.JSX.TargetedEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;

    const useNativeUpload = hasCapability("attachment_upload");

    if (useNativeUpload) {
      const filesArray = Array.from(files);
      e.currentTarget.value = "";
      await handleFileUpload(filesArray);
      return;
    }

    const imageFiles = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );

    if (imageFiles.length === 0) {
      showError("Only image and video files are supported", {
        autoDismissMs: 3000,
      });
      return;
    }

    e.currentTarget.value = "";
    await handleFileUpload(imageFiles);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const currentTarget = e.currentTarget as HTMLElement | null;
    if (e.relatedTarget === null || !currentTarget?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!e.dataTransfer?.files) return;
    const useNativeUpload = hasCapability("attachment_upload");
    const files = Array.from(e.dataTransfer.files);
    if (useNativeUpload) {
      if (files.length > 0) handleFileUpload(files);
    } else {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length > 0) handleFileUpload(imageFiles);
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    const useNativeUpload = hasCapability("attachment_upload");
    const items = Array.from(e.clipboardData.items);
    if (useNativeUpload) {
      const files = items
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter(Boolean) as File[];
      if (files.length > 0) {
        e.preventDefault();
        handleFileUpload(files);
      }
    } else {
      const imageFiles = items
        .filter((item) => item.type.indexOf("image") !== -1)
        .map((item) => item.getAsFile())
        .filter(Boolean) as File[];
      if (imageFiles.length > 0) {
        e.preventDefault();
        handleFileUpload(imageFiles);
      }
    }
  };

  const removePendingImage = (id: number) => {
    setPendingImages((prev) => prev.filter((img) => img.id !== id));
  };

  const removePendingAttachment = (id: string) => {
    const att = pendingAttachments.find((a) => a.id === id);
    if (att?.uploading) {
      cancelUpload(id);
    }
    setPendingAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.localUrl) {
        URL.revokeObjectURL(attachment.localUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleEmojiSelect = (
    emoji: string,
    isCustom?: boolean,
    emojiData?: { name: string; serverUrl: string; id?: string }
  ) => {
    if (reactingToMessage) {
      let emojiToSend = emoji;
      if (isCustom && emojiData?.serverUrl && emojiData?.id) {
        emojiToSend = `originChats://${emojiData.serverUrl}/emojis/${emojiData.id}`;
      }
      wsSend(
        {
          cmd: "message_react_add",
          id: reactingToMessage.id,
          emoji: emojiToSend,
          channel: currentChannel.value?.name,
        },
        serverUrl.value
      );
      setReactingToMessage(null);
      setShowPicker(false);
      return;
    }
    const input = document.getElementById("message-input") as HTMLTextAreaElement;
    if (input) {
      const cursorStart = input.selectionStart;
      const cursorEnd = input.selectionEnd;
      const value = input.value;
      const insertText = emoji;
      const newValue = value.substring(0, cursorStart) + insertText + value.substring(cursorEnd);
      input.value = newValue;
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(cursorStart + insertText.length, cursorStart + insertText.length);
      });
    }
  };

  const handleGifSelect = (gifUrl: string) => {
    const input = document.getElementById("message-input") as HTMLTextAreaElement;
    if (input) {
      input.value = gifUrl;
      requestAnimationFrame(() => {
        input.focus();
      });
    }
  };

  const startReply = (msg: Message) => {
    replyTo.value = msg;
    const input = document.getElementById("message-input") as HTMLTextAreaElement;
    if (input) input.focus();
  };

  const startEdit = (msg: Message) => {
    setEditingMessage(msg);
    const input = document.getElementById("message-input") as HTMLTextAreaElement;
    if (input) {
      input.value = msg.content;
      input.focus();
      autoResize(input);
    }
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    const input = document.getElementById("message-input") as HTMLTextAreaElement;
    if (input) {
      input.value = "";
      resetInputHeight();
    }
  };

  const handleImageClick = (e: h.JSX.TargetedMouseEvent<HTMLImageElement>) => {
    const url = e.currentTarget.dataset.imageUrl || e.currentTarget.src;
    imageViewerState.value = { url };
  };

  // Event delegation for image clicks and spoiler reveals within messages
  const handleMessagesClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;

    // Spoiler reveal — toggle .revealed on the spoiler span
    const spoiler = target.closest(".spoiler") as HTMLElement | null;
    if (spoiler) {
      e.preventDefault();
      e.stopPropagation();
      spoiler.classList.toggle("revealed");
      return;
    }

    // #channel-mention — navigate to that channel/thread
    const channelMention = target.closest(".channel-mention") as HTMLElement | null;
    if (channelMention) {
      e.preventDefault();
      e.stopPropagation();
      const channelName = channelMention.dataset.channel;
      const targetServerUrl = channelMention.dataset.server;
      const threadId = channelMention.dataset.thread;

      const navigate = () => {
        if (threadId) {
          const allThreads = threadsByServer.read(targetServerUrl || serverUrl.value) || {};
          for (const channelThreads of Object.values(allThreads)) {
            const thread = channelThreads.find((t) => t.id === threadId);
            if (thread) {
              selectThread(thread);
              return;
            }
          }
        }
        if (channelName) {
          const ch = channels.value.find((c) => c.name === channelName);
          if (ch) selectChannel(ch);
        }
      };

      if (targetServerUrl && targetServerUrl !== serverUrl.value) {
        switchServer(targetServerUrl).then(navigate);
      } else {
        navigate();
      }
      return;
    }

    // @mention — open user popout
    const mention = target.closest(".mention") as HTMLElement | null;
    if (mention) {
      e.preventDefault();
      e.stopPropagation();
      const username = mention.dataset.user;
      if (username) openUserPopout(e, username);
      return;
    }

    const img = target.closest(".message-image, .tenor-gif") as HTMLImageElement | null;
    if (img) {
      e.preventDefault();
      e.stopPropagation();
      const url = img.dataset.imageUrl || img.src;
      if (url) imageViewerState.value = { url };
    }
  };

  const translateMessage = async (msg: Message) => {
    if (!msg.id || !msg.content) return;

    const targetLang = navigator.language.split("-")[0] || "en";
    const existingTranslation = msg.id ? translatedMessages.value[msg.id] : null;
    if (existingTranslation) {
      translatedMessages.value = {
        ...translatedMessages.value,
      };
      delete translatedMessages.value[msg.id];
      return;
    }

    if (!msg.id) return;
    translatingMessageId.value = msg.id;

    try {
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(msg.content)}`
      );
      const data = await response.json();
      const translatedText = data[0]
        .map((item: any[]) => item[0])
        .filter(Boolean)
        .join("");
      translatedMessages.value = {
        ...translatedMessages.value,
        [msg.id]: translatedText,
      };
    } catch (error) {
      console.error("Translation failed:", error);
    } finally {
      translatingMessageId.value = null;
    }
  };

  const handleMessageContextMenu = (e: h.JSX.TargetedMouseEvent<HTMLDivElement>, msg: Message) => {
    e.preventDefault();
    const replyMsg = getReplyMessage(msg);
    const isOwn = msg.user === currentUser.value?.username;

    const menuItems: any[] = [];

    if (isOwn) {
      menuItems.push({
        label: "Edit",
        icon: "Edit3",
        fn: () => startEdit(msg),
      });
    }

    menuItems.push({
      label: "Reply",
      icon: "MessageCircle",
      fn: () => startReply(msg),
    });
    menuItems.push({
      label: "Copy text",
      icon: "Copy",
      fn: () => {
        navigator.clipboard.writeText(msg.content);
      },
    });
    menuItems.push({
      label: "Translate",
      icon: "Languages",
      fn: () => translateMessage(msg),
    });
    menuItems.push({
      label: "Copy ID",
      icon: "Hash",
      fn: () => {
        navigator.clipboard.writeText(msg.id!);
      },
    });
    menuItems.push({
      label: "Quote",
      icon: "CornerUpRight",
      fn: () => {
        const input = document.getElementById("message-input") as HTMLTextAreaElement;
        if (input) {
          const qt = msg.content ? `> ${msg.content.replace(/\n/g, "\n> ")}` : "> [Attachment]";
          input.value = qt + "\n\n" + input.value;
          input.focus();
          input.selectionStart = input.selectionEnd = 0;
          input.dispatchEvent(new Event("input"));
        }
      },
    });
    if (canReact) {
      menuItems.push({
        label: "React",
        icon: "Smile",
        fn: () => {
          setReactingToMessage(msg);
          setPickerTab("emoji");
          setShowPicker(true);
        },
      });
    }
    if (canPin) {
      menuItems.push({
        label: msg.pinned ? "Unpin" : "Pin",
        icon: msg.pinned ? "PinOff" : "Pin",
        fn: () => {
          wsSend({
            cmd: "message_pin",
            id: msg.id,
            channel: currentChannel.value?.name,
            pinned: !msg.pinned,
          });
        },
      });
    }

    menuItems.push({ separator: true });
    menuItems.push({
      label: "Delete",
      icon: "Trash2",
      danger: true,
      fn: () =>
        setConfirmDialog({
          isOpen: true,
          title: "Delete Message",
          message: "Are you sure you want to delete this message? This action cannot be undone.",
          onConfirm: () => {
            const { isThread, threadId } = getThreadInfo();
            wsSend(
              {
                cmd: "message_delete",
                id: msg.id,
                channel: currentChannel.value?.name,
                ...(isThread && { thread_id: threadId }),
              },
              serverUrl.value
            );
          },
        }),
    });

    showContextMenu(
      e,
      addUniversalContextMenuItems(e, menuItems, {
        onViewReactions: (emoji: string) => {
          const liveMsg = (messages.value[messageKey] || []).find((m) => m.id === msg.id);
          const liveUsers: string[] = (liveMsg?.reactions?.[emoji] as string[]) ?? [];
          setReactionModal({ emoji, users: liveUsers });
        },
      })
    );
  };

  const handleAttachmentContextMenu = (
    e: MouseEvent,
    att: { id: string; url?: string; name?: string }
  ) => {
    e.preventDefault();
    console.log("Full attachment object:", JSON.stringify(att, null, 2));
    console.log("Attachment name:", att.name);
    console.log("Attachment URL:", att.url);
    const sUrl = serverUrl.value;
    const currentRoles = rolesByServer.read(sUrl) || {};
    const myUsername = currentUser.value?.username?.toLowerCase();
    const userRoles = users.value[myUsername || ""]?.roles || [];
    const isAdminOrOwner = userRoles.some((roleName) => {
      const role = currentRoles[roleName];
      return (
        role?.name === "admin" ||
        role?.name === "owner" ||
        (role?.permissions as string[] | undefined)?.includes("*")
      );
    });

    const menuItems: any[] = [];

    if (att.url) {
      menuItems.push({
        label: "Copy Image URL",
        icon: "Image",
        fn: () => {
          navigator.clipboard.writeText(att.url!).catch(() => {});
        },
      });
      menuItems.push({
        label: "Open Image",
        icon: "ExternalLink",
        fn: () => {
          window.open(att.url, "_blank", "noopener,noreferrer");
        },
      });
      menuItems.push({
        label: "Save Image",
        icon: "Download",
        fn: () => {
          const filename = att.name || att.url?.split("/").pop() || "download";
          downloadAttachment(att.url!, filename);
        },
      });
    }

    menuItems.push({
      label: "Copy attachment ID",
      icon: "Hash",
      fn: () => {
        navigator.clipboard.writeText(att.id);
      },
    });

    if (isAdminOrOwner) {
      menuItems.push({ separator: true });
      menuItems.push({
        label: "Delete",
        icon: "Trash2",
        danger: true,
        fn: () =>
          setConfirmDialog({
            isOpen: true,
            title: "Delete Attachment",
            message:
              "Are you sure you want to delete this attachment? This action cannot be undone.",
            onConfirm: () => {
              wsSend({
                cmd: "attachment_delete",
                attachment_id: att.id,
              });
            },
          }),
      });
    }

    showContextMenu(e, menuItems);
  };

  const handleReaction = (msg: Message, emoji: string) => {
    const channelMsgs = messages.value[messageKey] || [];
    const liveMsg = channelMsgs.find((m) => m.id === msg.id);
    const liveUsers: string[] = (liveMsg?.reactions?.[emoji] ?? []) as string[];
    const hasReacted = liveUsers.includes(currentUser.value?.username ?? "");
    const { isThread, threadId } = getThreadInfo();
    wsSend(
      {
        cmd: hasReacted ? "message_react_remove" : "message_react_add",
        id: msg.id,
        emoji,
        channel: currentChannel.value?.name,
        ...(isThread && { thread_id: threadId }),
      },
      serverUrl.value
    );
  };

  const getReplyMessage = (msg: Message): Message | null => {
    if (!msg.reply_to) return null;
    const channelMessages = messages.value[messageKey] || [];
    const replyMsg = channelMessages.find((m) => m.id === msg.reply_to?.id);
    if (!replyMsg && currentChannel.value?.name && msg.reply_to?.id) {
      fetchMissingReplyMessage(serverUrl.value, currentChannel.value.name, msg.reply_to.id);
    }
    return replyMsg || null;
  };



  const getReplyPreview = (msg: Message): string => {
    const replyMsg = getReplyMessage(msg);
    const content = replyMsg?.content || "";
    return content.split("\n")[0];
  };

  const getReplyName = (msg: Message): string => {
    const replyMsg = getReplyMessage(msg);
    const userName = replyMsg?.user || msg.reply_to?.user || "";
    return getDisplayName(userName);
  };

  const getUserColor = (username: string): string | undefined => {
    const u = usersByServer.read(serverUrl.value)?.[username?.toLowerCase()];
    return u?.color || undefined;
  };

  const renderTranslation = (msg: Message) => {
    if (!msg.id) return null;
    const translation = translatedMessages.value[msg.id];
    const isTranslating = translatingMessageId.value === msg.id;

    if (isTranslating) {
      return <div className="translation-loading">Translating...</div>;
    }
    if (translation) {
      return <div className="translation-result">{translation}</div>;
    }
    return null;
  };

  function renderMessageBody(msg: Message, displayName: string, isHead: boolean, webhook: any, reactions: Record<string, string[]>, showAttachmentMenu: boolean) {
  const hasAttachments = msg.attachments && msg.attachments.length > 0;
  return (
    <div className="message-group-content">
      {(isHead || webhook) && (
        <div className="message-header">
          <span
            className="username clickable"
            style={webhook ? undefined : { color: getUserColor(msg.user) }}
            onClick={(e: any) => !webhook && openUserPopout(e, msg.user)}
            onContextMenu={(e: any) => !webhook && showUserMenu(e, msg.user)}
          >
            {displayName}
          </span>
          {webhook && <WebhookBadge name={webhook.name} />}
          <span className="timestamp">{formatMessageTime(msg.timestamp)}</span>
        </div>
      )}
      <MessageContent
        content={msg.content}
        currentUsername={currentUser.value?.username}
        authorUsername={msg.user}
        messageId={msg.id}
        pings={msg.pings}
        messageEmbeds={msg.embeds}
      />
      {renderTranslation(msg)}
      {hasAttachments && (
        <AttachmentPreview
          attachments={msg.attachments}
          hasContent={!!msg.content}
          {...(showAttachmentMenu ? { onContextMenu: handleAttachmentContextMenu } : {})}
        />
      )}
      {msg.edited && <span className="edited-indicator">(edited)</span>}
      {renderReactions(msg, reactions)}
    </div>
  );
}

function renderGroupedMessages(group: MessageGroup) {
    const allMessages = [group.head, ...group.following];
    const headIsReply = !!group.head.reply_to;

    return allMessages.map((msg, idx) => {
      const replyMsg = getReplyMessage(msg);
      const reactions = msg.reactions || {};
      const replyTo = msg.reply_to;
      const isOwn = msg.user === currentUser.value?.username;
      const isHead = idx === 0;

      const interaction = msg.interaction;
      const webhook = msg.webhook;
      const displayName = webhook?.name || getDisplayName(msg.user);
      const isPending = (msg as any)._pending;
      const groupClass =
        (isHead || interaction || webhook
          ? (replyTo && canReply) || interaction
            ? "message-group has-reply"
            : "message-group"
          : "message-single") + (isPending ? " pending-message" : "");

      return (
        <SwipeableMessage
          key={msg.id || (msg as any)._pendingKey || msg.timestamp}
          canEdit={isOwn}
          canReply={canReply}
          onReply={() => startReply(msg)}
          onEdit={() => startEdit(msg)}
        >
          <div
            className={groupClass}
            data-msg-id={msg.id}
            onContextMenu={(e: any) => handleMessageContextMenu(e, msg)}
            onMouseEnter={(e: any) => {
              const target = e.currentTarget as HTMLElement;
              showActionButtons({
                element: target,
                message: msg,
                onReply: () => startReply(msg),
                onReact: (emoji: string) => handleReaction(msg, emoji),
                onOpenEmojiPicker: () => {
                  setReactingToMessage(msg);
                  setPickerTab("emoji");
                  setShowPicker(true);
                },
                onContextMenu: (e: MouseEvent) => handleMessageContextMenu(e as any, msg),
                canReact,
                canReply,
                isOwn,
              });
            }}
            onMouseLeave={(e: any) => {
              const relatedTarget = e.relatedTarget as HTMLElement;
              if (relatedTarget?.closest(".messageActionButtons")) {
                return;
              }
              hideActionButtons();
            }}
          >
            {replyTo && canReply && (
              <div
                className="message-reply"
                onClick={(e) => {
                  e.stopPropagation();
                  const replyMsg = getReplyMessage(msg);
                  if (replyMsg) {
                    const original = document.querySelector(`[data-msg-id="${replyMsg.id}"]`);
                    if (original)
                      original.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                  }
                }}
              >
                <Icon name="CornerUpRight" size={20} />
                <UserAvatar
                  username={replyTo.user}
                  nickname={users.value[replyTo.user?.toLowerCase()]?.nickname}
                  pfp={users.value[replyTo.user?.toLowerCase()]?.pfp}
                  cracked={users.value[replyTo.user?.toLowerCase()]?.cracked}
                  className="avatar-small"
                />
                <div className="reply-text">
                  <span
                    className="reply-username"
                    style={{ color: getUserColor(getReplyName(msg)) }}
                  >
                    {getReplyName(msg)}
                  </span>
                  <span className="reply-content">
                    <MessageContent
                      content={getReplyPreview(msg)}
                      currentUsername={currentUser.value?.username}
                      authorUsername={getReplyName(msg)}
                      isReply
                    />
                  </span>
                </div>
              </div>
            )}
            {!replyTo && interaction && (
              <div className="message-reply">
                <Icon name="CornerUpRight" size={20} />
                <UserAvatar
                  username={interaction.username}
                  nickname={users.value[interaction.username?.toLowerCase()]?.nickname}
                  pfp={users.value[interaction.username?.toLowerCase()]?.pfp}
                  cracked={users.value[interaction.username?.toLowerCase()]?.cracked}
                  className="avatar-small"
                />
                <div className="reply-text">
                  <span
                    className="reply-username"
                    style={{ color: getUserColor(interaction.username) }}
                  >
                    {interaction.username}
                  </span>
                  <span className="reply-content">
                    <span className="interaction-command">/{interaction.command}</span>
                  </span>
                </div>
              </div>
            )}
            {(isHead || interaction || webhook) && (
              <>
                {replyTo || interaction ? (
                  <div className="message-group-body">
                    <UserAvatar
                      username={msg.user}
                      nickname={users.value[msg.user?.toLowerCase()]?.nickname}
                      pfp={users.value[msg.user?.toLowerCase()]?.pfp}
                      cracked={users.value[msg.user?.toLowerCase()]?.cracked}
                      className="avatar clickable"
                      alt={displayName}
                      onClick={(e: any) => !webhook && openUserPopout(e, msg.user)}
                      onContextMenu={(e: any) => !webhook && showUserMenu(e, msg.user)}
                    />
                    <div className="message-group-content">
                      <div className="message-header">
                        <span
                          className="username clickable"
                          style={webhook ? undefined : { color: getUserColor(msg.user) }}
                          onClick={(e: any) => !webhook && openUserPopout(e, msg.user)}
                          onContextMenu={(e: any) => !webhook && showUserMenu(e, msg.user)}
                        >
                          {displayName}
                        </span>
                        {webhook && <WebhookBadge name={webhook.name} />}
                        <span className="timestamp">{formatMessageTime(msg.timestamp)}</span>
                      </div>
                      <MessageContent
                        content={msg.content}
                        currentUsername={currentUser.value?.username}
                        authorUsername={msg.user}
                        messageId={msg.id}
                        messageEmbeds={msg.embeds}
                      />
                      {renderTranslation(msg)}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <AttachmentPreview
                          attachments={msg.attachments}
                          hasContent={!!msg.content}
                        />
                      )}
                      {msg.edited && <span className="edited-indicator">(edited)</span>}
                      {renderReactions(msg, reactions)}
                    </div>
                  </div>
                ) : (
                  <>
                    <UserAvatar
                      username={msg.user}
                      nickname={users.value[msg.user?.toLowerCase()]?.nickname}
                      pfp={webhook?.avatar || users.value[msg.user?.toLowerCase()]?.pfp}
                      cracked={users.value[msg.user?.toLowerCase()]?.cracked}
                      className="avatar clickable"
                      alt={displayName}
                      onClick={(e: any) => !webhook && openUserPopout(e, msg.user)}
                      onContextMenu={(e: any) => !webhook && showUserMenu(e, msg.user)}
                    />
                    <div className="message-group-content">
                      <div className="message-header">
                        <span
                          className="username clickable"
                          style={webhook ? undefined : { color: getUserColor(msg.user) }}
                          onClick={(e: any) => !webhook && openUserPopout(e, msg.user)}
                          onContextMenu={(e: any) => !webhook && showUserMenu(e, msg.user)}
                        >
                          {displayName}
                        </span>
                        {webhook && <WebhookBadge name={webhook.name} />}
                        <span className="timestamp">{formatMessageTime(msg.timestamp)}</span>
                      </div>
                      <MessageContent
                        content={msg.content}
                        currentUsername={currentUser.value?.username}
                        authorUsername={msg.user}
                        messageId={msg.id}
                        pings={msg.pings}
                        messageEmbeds={msg.embeds}
                      />
                      {renderTranslation(msg)}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <AttachmentPreview
                          attachments={msg.attachments}
                          hasContent={!!msg.content}
                          onContextMenu={handleAttachmentContextMenu}
                        />
                      )}
                      {msg.edited && <span className="edited-indicator">(edited)</span>}
                      {renderReactions(msg, reactions)}
                    </div>
                  </>
                )}
              </>
            )}
            {!isHead && !interaction && !webhook && (
              <div className="message-group-content">
                <MessageContent
                  content={msg.content}
                  currentUsername={currentUser.value?.username}
                  authorUsername={msg.user}
                  pings={msg.pings}
                />
                {renderTranslation(msg)}
                {msg.attachments && msg.attachments.length > 0 && (
                  <AttachmentPreview
                    attachments={msg.attachments}
                    hasContent={!!msg.content}
                    onContextMenu={handleAttachmentContextMenu}
                  />
                )}
                {msg.edited && <span className="edited-indicator">(edited)</span>}
                {renderReactions(msg, reactions)}
              </div>
            )}
          </div>
        </SwipeableMessage>
      );
    });
  }

  const renderReactions = (msg: Message, reactions: Record<string, string[]>) => {
    if (!canReact) return null;
    if (Object.entries(reactions).length === 0) return null;
    return (
      <div className="message-reactions">
        {Object.entries(reactions).map(([emoji, users]) => {
          if (!users || users.length === 0) return null;
          const hasReacted = users.includes(currentUser.value?.username ?? "");
          const previewUsers = users.slice(0, 2);
          const overflow = users.length - previewUsers.length;
          return (
            <span
              key={emoji}
              className={`reaction ${hasReacted ? "reacted" : ""}`}
              onClick={() => handleReaction(msg, emoji)}
              onContextMenu={(e: any) => {
                e.preventDefault();
                e.stopPropagation();
                const liveMsg = (messages.value[messageKey] || []).find((m) => m.id === msg.id);
                const liveUsers: string[] = (liveMsg?.reactions?.[emoji] as string[]) ?? users;
                setReactionModal({ emoji, users: liveUsers });
              }}
            >
              {isCustomEmoji(emoji) ? (
                <img
                  className="reaction-emoji"
                  src={getCustomEmojiUrl(emoji)!}
                  alt="custom emoji"
                  draggable={false}
                />
              ) : emojiImgUrl(emoji, true) ? (
                <img
                  className="reaction-emoji"
                  src={emojiImgUrl(emoji, true)!}
                  alt={emoji}
                  draggable={false}
                />
              ) : (
                <span className="reaction-emoji reaction-emoji-system">{emoji}</span>
              )}
              <span className="reaction-count">{users.length}</span>
              <span className="reaction-tooltip">
                <span className="reaction-tooltip-avatars">
                  {previewUsers.map((u) => (
                    <UserAvatar key={u} username={u} className="reaction-tooltip-avatar" alt={u} />
                  ))}
                </span>
                <span className="reaction-tooltip-names">
                  {previewUsers.join(", ")}
                  {overflow > 0 ? ` +${overflow} more` : ""}
                </span>
              </span>
            </span>
          );
        })}
      </div>
    );
  };

  const isDM = serverUrl.value === DM_SERVER_URL;

  const caps = serverCapabilities.value;
  const canPin = caps.includes("message_pin") && caps.includes("messages_pinned");
  const canReply = caps.includes("message_replies");
  const canReact = caps.includes("message_react_add") && caps.includes("message_react_remove");

  const ch = currentChannel.value;
  const isChatChannel = ch !== null && ch.type === "chat";
  const voice = voiceState.value;
  const inCallHere = isChatChannel && voice.currentChannel === ch?.name;
  const rawDmCallUsers = isDM && ch ? dmVoiceStates.get(ch.name) : undefined;
  const myUsername = currentUserByServer.read(serverUrl.value)?.username;
  const dmCallUsers = rawDmCallUsers?.filter((u) => u.username !== myUsername);
  const hasIncomingDmCall = isDM && dmCallUsers && dmCallUsers.length > 0 && !inCallHere;

  const canSendInChannel = (() => {
    if (isDM) return true;
    if (!ch) return true;
    const sendPerms = (ch as any).permissions?.send;
    if (!sendPerms) return true;
    const myUsername = currentUserByServer.read(serverUrl.value)?.username;
    const myRoles = users.value[myUsername?.toLowerCase() || ""]?.roles || [];
    if (myUsername === "admin") return true;
    return sendPerms.some(
      (r: string) =>
        myRoles.includes(r) || r === "user" || r.toLowerCase() === myUsername?.toLowerCase()
    );
  })();

  return (
    <div className="main-content-wrapper">
      <Header />
      <ErrorBannerStack />
      {inCallHere && !showVoiceCallView.value && <VoiceCallView embedded />}
      {hasIncomingDmCall && <IncomingDMCall users={dmCallUsers!} />}
      <div className="main-content-area">
        <div
          className={styles.messagesContainer}
          onDragOver={handleDragOver as any}
          onDragLeave={handleDragLeave as any}
          onDrop={handleDrop as any}
        >
          <FloatingActionButtons />
          {isDragging && (
            <div className="drag-drop-overlay">
              <div className="drag-drop-content">
                <Icon name="Upload" size={48} />
                <span>Drop files to upload</span>
              </div>
            </div>
          )}
          {channelLoading && currentMessages.length > 0 && (
            <div className="channel-loading-overlay">
              <div className="loading-throbber" />
            </div>
          )}
          <div
            id="messages"
            ref={messagesContainerRef}
            className={styles.messages}
            onClick={handleMessagesClick as any}
          >
            {(!reachedOldestByServer[sUrl]?.has(messageKey) || loadingOlder) && (
              <div className={styles.overscrollArea} style={{ height: overscrollPadding }}>
                {!reachedOldestByServer[sUrl]?.has(messageKey) && (
                  <div ref={topSentinelRef} style={{ height: 1 }} />
                )}
                {loadingOlder && (
                  <div className={styles.skeletonMessagesTop}>
                    <SkeletonMessageList count={4} />
                  </div>
                )}
              </div>
            )}
            {currentMessages.length === 0 && channelLoading ? (
              <div style={{ padding: "20px" }}>
                <SkeletonMessageList count={3} />
              </div>
            ) : currentMessages.length === 0 ? (
              <div className="empty-channel-message">
                <div className="empty-channel-icon">💬</div>
                <div className="empty-channel-title">
                  Welcome to #
                  {(currentChannel.value as any)?.display_name ||
                    currentChannel.value?.name ||
                    "home"}
                </div>
                <div className="empty-channel-text">
                  This is the start of the{" "}
                  <strong>
                    #
                    {(currentChannel.value as any)?.display_name ||
                      currentChannel.value?.name ||
                      "home"}
                  </strong>{" "}
                  channel.
                </div>
                <div className="empty-channel-text">Be the first to send a message!</div>
              </div>
            ) : (
              messageGroups.flatMap((group) => {
                const isBlocked = blockedUsers.value.includes(group.head.user);
                const displayMode = blockedMessageDisplay.value;

                if (isBlocked && displayMode === "hide") return [];

                if (isBlocked && displayMode === "collapse") {
                  const count = 1 + group.following.length;
                  return [
                    <BlockedMessageBanner
                      key={group.head.id}
                      count={count}
                      username={group.head.user}
                    >
                      {renderGroupedMessages(group)}
                    </BlockedMessageBanner>,
                  ];
                }

                return renderGroupedMessages(group);
              })
            )}
            {(!hasReachedNewest || loadingNewer) && (
              <>
                <div ref={bottomSentinelRef} style={{ height: 1 }} />
                {loadingNewer && (
                  <div className={styles.skeletonMessagesBottom}>
                    <SkeletonMessageList count={4} />
                  </div>
                )}
              </>
            )}
            {showScrollBtn && (
              <button
                className={styles.scrollToBottomBtn}
                onClick={jumpToBottom}
                title="Jump to bottom"
              >
                <Icon name="ArrowDown" size={20} />
              </button>
            )}
            {missedCount > 0 && !hasReachedNewest && (
              <button
                className={styles.missedMessagesBtn}
                onClick={() => {
                  if (missedMessagesCount.read(sUrl)) {
                    missedMessagesCount.update(sUrl, (counts) => ({
                      ...counts,
                      [messageKey]: 0,
                    }));
                  }
                  jumpToBottom();
                }}
              >
                {missedCount} unread message{missedCount !== 1 ? "s" : ""}
              </button>
            )}
          </div>
          {(replyTo.value || editingMessage) && (
            <ReplyBar
              replyMessage={replyTo.value || undefined}
              editMessage={editingMessage || undefined}
              onClose={() => {
                if (editingMessage) {
                  cancelEdit();
                } else {
                  replyTo.value = null;
                  replyPing.value = true;
                }
              }}
            />
          )}
          {pendingImages.length > 0 && (
            <div className="pending-images-container">
              {pendingImages.map((img) => (
                <div key={img.id} className="pending-image-wrapper">
                  <img
                    src={img.url}
                    className="pending-image-preview"
                    alt={img.fileName}
                    onClick={() => (imageViewerState.value = { url: img.url })}
                  />
                  <button
                    className="pending-image-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePendingImage(img.id);
                    }}
                  >
                    <Icon name="X" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {pendingAttachments.length > 0 && (
            <div className="pending-attachments-container">
              {pendingAttachments.map((att) => {
                const daysUntilExpiry = att.expires_at
                  ? Math.max(0, Math.ceil((att.expires_at - Date.now() / 1000) / 86400))
                  : null;
                const showExpiry =
                  !att.permanent &&
                  !att.uploading &&
                  daysUntilExpiry !== null &&
                  daysUntilExpiry <= 7;

                return (
                  <div key={att.id} className="pending-attachment-wrapper">
                    {att.uploading ? (
                      <div className="pending-attachment-loading">
                        <svg className="upload-progress-ring" viewBox="0 0 36 36">
                          <circle
                            className="upload-progress-bg"
                            cx="18"
                            cy="18"
                            r="16"
                            fill="none"
                            strokeWidth="3"
                          />
                          <circle
                            className="upload-progress-fill"
                            cx="18"
                            cy="18"
                            r="16"
                            fill="none"
                            strokeWidth="3"
                            strokeDasharray={`${(att.progress || 0) * 100} ${100 - (att.progress || 0) * 100}`}
                            strokeDashoffset="25"
                          />
                        </svg>
                        <span className="upload-progress-text">
                          {Math.round((att.progress || 0) * 100)}%
                        </span>
                      </div>
                    ) : att.mime_type.startsWith("image/") ? (
                      <img src={att.url} className="pending-attachment-preview" alt={att.name} />
                    ) : (
                      <div className="pending-attachment-file">
                        <Icon
                          name={
                            att.mime_type.startsWith("video/")
                              ? "Video"
                              : att.mime_type.startsWith("audio/")
                                ? "Music"
                                : att.mime_type === "application/pdf"
                                  ? "FileText"
                                  : "File"
                          }
                          size={24}
                        />
                        <span className="pending-attachment-name">
                          {att.name.length > 12
                            ? att.name.slice(0, 9) + "..." + att.name.slice(-3)
                            : att.name}
                        </span>
                      </div>
                    )}
                    {showExpiry && (
                      <div className="pending-attachment-expiry">
                        {daysUntilExpiry === 0
                          ? "Expires today"
                          : daysUntilExpiry === 1
                            ? "Expires in 1 day"
                            : `Expires in ${daysUntilExpiry} days`}
                      </div>
                    )}
                    <button
                      className="pending-attachment-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePendingAttachment(att.id);
                      }}
                    >
                      <Icon name="X" size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div
            className={styles.inputArea}
            onDragOver={handleDragOver as any}
            onDrop={handleDrop as any}
          >
            {!activeSlashCmd && (
              <InputAutocomplete
                state={autocomplete.state.value}
                onSelect={(index) => {
                  const item = autocomplete.state.value.items[index];
                  if (item?.type === "slash") {
                    const sUrl = serverUrl.value;
                    const cmd = (slashCommandsByServer.read(sUrl) || []).find(
                      (c) => c.name === item.label
                    );
                    if (cmd) {
                      const input = document.getElementById(
                        "message-input"
                      ) as HTMLTextAreaElement | null;
                      if (input) {
                        input.value = "";
                        resetInputHeight();
                      }
                      autocomplete.close();
                      setActiveSlashCmd(cmd);
                      setSlashArgs({});
                      return;
                    }
                  }
                  autocomplete.selectItem(index);
                }}
                onHover={autocomplete.setSelectedIndex}
              />
            )}
            {activeSlashCmd ? (
              <SlashCommandInput
                command={activeSlashCmd}
                args={slashArgs}
                onArgsChange={setSlashArgs}
                onSubmit={sendMessage}
                onDismiss={dismissSlashCmd}
              />
            ) : (
              <div className={styles.inputWrapper}>
                {(typingUsers.length > 0 || isTypingExiting) && prevTypingUsers.length > 0 && (
                  <div className={styles.typingPill} data-exiting={isTypingExiting || undefined}>
                    <div className={styles.typingPillAvatars}>
                      {prevTypingUsers.slice(0, 3).map((u) => (
                        <UserAvatar
                          key={u.username}
                          username={u.username}
                          className={styles.typingPillAvatar}
                          alt={u.displayName}
                        />
                      ))}
                    </div>
                    {prevTypingUsers.length === 1 ? (
                      <span className={styles.typingPillText}>
                        <span style={{ color: prevTypingUsers[0].color ?? undefined }}>
                          {prevTypingUsers[0].displayName}
                        </span>
                        {" is typing..."}
                      </span>
                    ) : prevTypingUsers.length === 2 ? (
                      <span className={styles.typingPillText}>
                        <span style={{ color: prevTypingUsers[0].color ?? undefined }}>
                          {prevTypingUsers[0].displayName}
                        </span>
                        {" and "}
                        <span style={{ color: prevTypingUsers[1].color ?? undefined }}>
                          {prevTypingUsers[1].displayName}
                        </span>
                        {" are typing..."}
                      </span>
                    ) : prevTypingUsers.length === 3 ? (
                      <span className={styles.typingPillText}>
                        <span style={{ color: prevTypingUsers[0].color ?? undefined }}>
                          {prevTypingUsers[0].displayName}
                        </span>
                        {", "}
                        <span style={{ color: prevTypingUsers[1].color ?? undefined }}>
                          {prevTypingUsers[1].displayName}
                        </span>
                        {", and "}
                        <span style={{ color: prevTypingUsers[2].color ?? undefined }}>
                          {prevTypingUsers[2].displayName}
                        </span>
                        {" are typing..."}
                      </span>
                    ) : (
                      <span className={styles.typingPillText}>
                        <span style={{ color: prevTypingUsers[0].color ?? undefined }}>
                          {prevTypingUsers[0].displayName}
                        </span>
                        {", "}
                        <span style={{ color: prevTypingUsers[1].color ?? undefined }}>
                          {prevTypingUsers[1].displayName}
                        </span>
                        {`, and ${prevTypingUsers.length - 2} others are typing...`}
                      </span>
                    )}
                  </div>
                )}
                <div className={styles.plusBtnWrapper} ref={plusMenuRef}>
                  <button
                    className="icon-btn"
                    title="More options"
                    onClick={() => setShowPlusMenu((v) => !v)}
                  >
                    <Icon name="Plus" />
                  </button>
                  {showPlusMenu && (
                    <div className={styles.plusDropdown}>
                      <div
                        className={styles.plusDropdownItem}
                        onClick={() => {
                          setShowPlusMenu(false);
                          fileInputRef.current?.click();
                        }}
                      >
                        <Icon
                          name={hasCapability("attachment_upload") ? "File" : "Image"}
                          size={16}
                        />
                        <span>
                          {hasCapability("attachment_upload") ? "Upload File" : "Upload Image"}
                        </span>
                      </div>
                      <div
                        className={styles.plusDropdownItem}
                        onClick={() => {
                          setShowPlusMenu(false);
                          setShowPollModal(true);
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 11l3 3L22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        <span>Create Poll</span>
                      </div>
                      <div
                        className={styles.plusDropdownItem}
                        onClick={() => {
                          setShowPlusMenu(false);
                          setShowGiftModal(true);
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="8" width="18" height="4" rx="1" />
                          <path d="M12 8v13" />
                          <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                          <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
                        </svg>
                        <span>Send Gift</span>
                      </div>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={
                    hasCapability("attachment_upload")
                      ? (() => {
                          const types = attachmentConfigByServer.read(
                            serverUrl.value
                          )?.allowed_types;
                          if (types && types.includes("*")) return "*/*";
                          return mimeTypeToAcceptString(types || ["image/*", "video/*"]);
                        })()
                      : "image/*,video/*"
                  }
                  multiple
                  style={{ display: "none" }}
                  onChange={handleImageUpload}
                />
                <textarea
                  id="message-input"
                  placeholder={
                    editingMessage
                      ? "Edit your message..."
                      : canSendInChannel
                        ? "Type a message..."
                        : "You can't talk here"
                  }
                  rows={1}
                  onKeyDown={handleKeyDown}
                  onInput={(e) => {
                    autoResize(e.currentTarget);
                    sendTypingEvent();
                    autocomplete.handleInput();
                  }}
                  onPaste={handlePaste as any}
                  disabled={!canSendInChannel}
                  className={!canSendInChannel ? "disabled-input" : ""}
                />
                <button
                  ref={pickerButtonRef}
                  className="icon-btn"
                  title="Emoji & GIFs"
                  onClick={() => setShowPicker(!showPicker)}
                >
                  <Icon name="Smile" />
                </button>
                <button className={`${styles.sendBtn} icon-btn`} onClick={sendMessage}>
                  <Icon name="Send" />
                </button>
              </div>
            )}
          </div>
        </div>
        <RightPanel />
      </div>
      {userMenu && (
        <UserContextMenu
          username={userMenu.username}
          x={userMenu.x}
          y={userMenu.y}
          onClose={closeUserMenu}
        />
      )}
      {confirmDialog && (
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          danger={true}
        />
      )}
      {imageViewerState.value && (
        <ImageViewer
          isOpen={!!imageViewerState.value}
          imageUrl={imageViewerState.value.url}
          expiresAt={imageViewerState.value.expiresAt}
          images={imageViewerState.value.images}
          currentIndex={imageViewerState.value.currentIndex}
          onClose={() => (imageViewerState.value = null)}
          onNavigate={(index) => {
            if (imageViewerState.value?.images?.[index]) {
              const newImage = imageViewerState.value.images[index];
              imageViewerState.value = {
                ...imageViewerState.value,
                url: newImage.url,
                expiresAt: newImage.expiresAt,
                currentIndex: index,
              };
            }
          }}
        />
      )}
      <UnifiedPicker
        isOpen={showPicker}
        onClose={() => {
          setShowPicker(false);
          setReactingToMessage(null);
          requestAnimationFrame(() => {
            const input = document.getElementById("message-input") as HTMLTextAreaElement;
            if (input) input.focus();
          });
        }}
        onEmojiSelect={handleEmojiSelect}
        onGifSelect={handleGifSelect}
        anchorRef={pickerButtonRef}
        initialTab={pickerTab}
      />
      <GiftModal
        isOpen={showGiftModal}
        onClose={() => setShowGiftModal(false)}
        onGiftCreated={(giftUrl) => {
          const input = document.getElementById("message-input") as HTMLTextAreaElement;
          if (input) {
            const currentText = input.value.trim();
            input.value = currentText ? `${currentText}\n${giftUrl}` : giftUrl;
            input.focus();
          }
        }}
      />
      {showPollModal && <PollCreateModal onClose={() => setShowPollModal(false)} />}
      {reactionModal && (
        <ReactionModal
          emoji={reactionModal.emoji}
          users={reactionModal.users}
          onClose={() => setReactionModal(null)}
        />
      )}
    </div>
  );
}

interface ReplyBarProps {
  replyMessage?: Message;
  editMessage?: Message;
  onClose: () => void;
}

function ReplyBar({ replyMessage, editMessage, onClose }: ReplyBarProps) {
  if (!replyMessage && !editMessage) return null;

  const msg = replyMessage || editMessage!;
  const isEdit = !!editMessage;
  const pingOn = replyPing.value;

  return (
    <div className={`${styles.replyBar} ${isEdit ? styles.editingMode : ""} ${styles.active}`}>
      <div className={styles.replyBarIcon}>
        {isEdit ? <Icon name="Pencil" size={16} /> : <Icon name="CornerUpLeft" size={16} />}
      </div>
      <div className={styles.replyBarBody}>
        <div className={styles.replyBarLabel}>
          {isEdit ? "Editing message" : `Replying to ${getDisplayName(msg.user)}`}
        </div>
        <div className={styles.replyBarPreview}>
          <MessageContent
            content={msg.content}
            currentUsername={currentUser.value?.username}
            authorUsername={msg.user}
            isReply
          />
        </div>
      </div>
      {!isEdit && (
        <button
          className={`${styles.replyBarPing} ${pingOn ? styles.active : ""}`}
          onClick={() => {
            replyPing.value = !replyPing.value;
          }}
          title={
            pingOn ? "Ping on: click to suppress notification" : "Ping off: click to notify user"
          }
        >
          <Icon name={pingOn ? "Bell" : "BellOff"} size={14} />
        </button>
      )}
      <button className={styles.replyBarClose} onClick={onClose} title="Cancel">
        <Icon name="X" size={14} />
      </button>
    </div>
  );
}

interface GiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGiftCreated: (giftUrl: string) => void;
}

function GiftModal({ isOpen, onClose, onGiftCreated }: GiftModalProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [expiryHrs, setExpiryHrs] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount) || 0;
  const tax = parsedAmount * 0.01;
  const total = parsedAmount + tax;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleClose = () => {
    setAmount("");
    setNote("");
    setExpiryHrs("0");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const data = await createGift(numAmount, note || undefined, parseInt(expiryHrs));
      const giftUrl = `${ROTUR_GIFT_URL}?code=${data.code}`;
      onGiftCreated(giftUrl);
      handleClose();
    } catch (err: any) {
      setError(err.message || "Failed to create gift");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="modal gift-modal">
        <div className="modal-header">
          <div className="modal-title">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: 8 }}
            >
              <rect x="3" y="8" width="18" height="4" rx="1" />
              <path d="M12 8v13" />
              <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
              <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
            </svg>
            Send a Gift
          </div>
          <button className="icon-btn" onClick={handleClose} aria-label="Close">
            <Icon name="X" size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Amount (RC)</label>
            <input
              className="form-input"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Note (optional)</label>
            <input
              className="form-input"
              type="text"
              placeholder="A message for the recipient..."
              value={note}
              onInput={(e) => setNote((e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Expires in</label>
            <div className="gift-expiry-options">
              {[
                { label: "Never", value: "0" },
                { label: "24h", value: "24" },
                { label: "72h", value: "72" },
                { label: "1 week", value: "168" },
              ].map((opt) => (
                <label key={opt.value} className="gift-expiry-radio">
                  <input
                    type="radio"
                    name="gift-expiry"
                    value={opt.value}
                    checked={expiryHrs === opt.value}
                    onChange={() => setExpiryHrs(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          {parsedAmount > 0 && (
            <div className="gift-summary">
              <div className="gift-summary-row">
                <span>Amount</span>
                <span>{parsedAmount.toFixed(2)} RC</span>
              </div>
              <div className="gift-summary-row">
                <span>Tax (1%)</span>
                <span>{tax.toFixed(2)} RC</span>
              </div>
              <div className="gift-summary-row gift-summary-total">
                <span>Total</span>
                <span>{total.toFixed(2)} RC</span>
              </div>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || parsedAmount <= 0}
          >
            {submitting ? "Creating..." : "Create Gift"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReactionModalProps {
  emoji: string;
  users: string[];
  onClose: () => void;
}

function ReactionModal({ emoji, users, onClose }: ReactionModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="reaction-modal">
        <div className="reaction-modal-header">
          {isCustomEmoji(emoji) ? (
            <img
              className="reaction-modal-emoji"
              src={getCustomEmojiUrl(emoji)!}
              alt="custom emoji"
              draggable={false}
            />
          ) : emojiImgUrl(emoji, true) ? (
            <img
              className="reaction-modal-emoji"
              src={emojiImgUrl(emoji, true)!}
              alt={emoji}
              draggable={false}
            />
          ) : (
            <span className="reaction-modal-emoji reaction-modal-emoji-system">{emoji}</span>
          )}
          <div className="reaction-modal-header-text">
            <span className="reaction-modal-title">Reacted with {emoji}</span>
            <span className="reaction-modal-subtitle">
              {users.length} {users.length === 1 ? "person" : "people"}
            </span>
          </div>
          <button className="icon-btn reaction-modal-close" onClick={onClose} aria-label="Close">
            <Icon name="X" size={16} />
          </button>
        </div>

        {users.length === 0 ? (
          <div className="reaction-modal-empty">No reactions yet</div>
        ) : (
          users.map((username) => <ReactionUserItem key={username} username={username} />)
        )}
      </div>
    </div>
  );
}

function ReactionUserItem({ username }: { username: string }) {
  const displayName = useDisplayName(username);
  return (
    <div className="reaction-modal-user">
      <UserAvatar username={username} className="reaction-modal-avatar" alt={displayName} />
      <span className="reaction-modal-username">{displayName}</span>
    </div>
  );
}

function IncomingDMCall({ users }: { users: { username: string; muted?: boolean }[] }) {
  const ch = currentChannel.value;
  const myUsername = currentUserByServer.read(serverUrl.value)?.username;

  const handleJoin = () => {
    if (ch) {
      voiceManager.joinChannel(ch.name, myUsername, ch.type);
    }
  };

  return (
    <div className={styles.incomingCall}>
      <div className={styles.incomingCallHeader}>
        <Icon name="Phone" size={20} />
        <span>Incoming Call</span>
      </div>
      <div className={styles.incomingCallUsers}>
        {users.map((u) => (
          <div key={u.username} className={styles.incomingCallUser}>
            <UserAvatar username={u.username} className={styles.incomingCallAvatar} />
            <span className={styles.incomingCallUsername}>{u.username}</span>
            {u.muted && <Icon name="MicOff" size={14} />}
          </div>
        ))}
      </div>
      <div className={styles.incomingCallActions}>
        <button className={styles.incomingCallJoin} onClick={handleJoin}>
          <Icon name="Phone" size={18} />
          <span>Join</span>
        </button>
      </div>
    </div>
  );
}
