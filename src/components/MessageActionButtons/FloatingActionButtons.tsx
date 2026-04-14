import { signal } from "@preact/signals";
import { useState, useEffect } from "preact/hooks";
import { Icon } from "../Icon";
import { emojiImgUrl } from "../../lib/emoji";
import { useSystemEmojis } from "../../state";
import type { Message } from "../../types";
import styles from "./MessageActionButtons.module.css";

const QUICK_REACTIONS = ["👍", "👎", "😄", "❤️"];

interface ActionButtonsState {
  message: Message | null;
  position: { top: number; right: number } | null;
  onReply: (() => void) | null;
  onReact: ((emoji: string) => void) | null;
  onOpenEmojiPicker: (() => void) | null;
  onContextMenu: ((e: MouseEvent) => void) | null;
  canReact: boolean;
  canReply: boolean;
  isOwn: boolean;
}

const actionButtonsState = signal<ActionButtonsState>({
  message: null,
  position: null,
  onReply: null,
  onReact: null,
  onOpenEmojiPicker: null,
  onContextMenu: null,
  canReact: false,
  canReply: false,
  isOwn: false,
});

export function showActionButtons(
  state: Omit<ActionButtonsState, "position"> & { element: HTMLElement }
) {
  const element = state.element;
  const rect = element.getBoundingClientRect();
  const container = document.getElementById("messages");
  const containerRect = container?.getBoundingClientRect();

  if (containerRect) {
    actionButtonsState.value = {
      message: state.message,
      position: {
        top: rect.top - containerRect.top,
        right: containerRect.right - rect.right + 16,
      },
      onReply: state.onReply,
      onReact: state.onReact,
      onOpenEmojiPicker: state.onOpenEmojiPicker,
      onContextMenu: state.onContextMenu,
      canReact: state.canReact,
      canReply: state.canReply,
      isOwn: state.isOwn,
    };
  } else {
    const messagesArea = document.querySelector("#messages");
    const messagesRect = messagesArea?.getBoundingClientRect();

    if (messagesRect && messagesArea) {
      actionButtonsState.value = {
        message: state.message,
        position: {
          top: rect.top - messagesRect.top + messagesArea.scrollTop,
          right: 60,
        },
        onReply: state.onReply,
        onReact: state.onReact,
        onOpenEmojiPicker: state.onOpenEmojiPicker,
        onContextMenu: state.onContextMenu,
        canReact: state.canReact,
        canReply: state.canReply,
        isOwn: state.isOwn,
      };
    }
  }
}

export function hideActionButtons() {
  actionButtonsState.value = {
    message: null,
    position: null,
    onReply: null,
    onReact: null,
    onOpenEmojiPicker: null,
    onContextMenu: null,
    canReact: false,
    canReply: false,
    isOwn: false,
  };
}

export function FloatingActionButtons() {
  const [state, setState] = useState<ActionButtonsState>(actionButtonsState.value);

  useEffect(() => {
    return actionButtonsState.subscribe((newValue) => {
      setState(newValue);
    });
  }, []);

  if (!state.message || !state.position) {
    return null;
  }

  const handleMoreClick = (e: MouseEvent) => {
    e.stopPropagation();
    state.onContextMenu?.(e);
  };

  return (
    <div
      class={`messageActionButtons ${styles.messageActionButtons}`}
      style={{
        position: "absolute",
        top: `${state.position.top}px`,
        right: `${state.position.right}px`,
        zIndex: 100,
      }}
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
    >
      {state.canReact &&
        QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            class={`${styles.actionBtn} ${styles.quickReaction}`}
            onClick={(e) => {
              e.stopPropagation();
              state.onReact?.(emoji);
            }}
          >
            {useSystemEmojis.value ? (
              emoji
            ) : (
              <img
                src={emojiImgUrl(emoji, true) || undefined}
                alt={emoji}
                style={{ width: 16, height: 16 }}
              />
            )}
          </button>
        ))}
      {state.canReact && (
        <button
          class={styles.actionBtn}
          title="React"
          onClick={(e) => {
            e.stopPropagation();
            state.onOpenEmojiPicker?.();
          }}
        >
          <Icon name="SmilePlus" size={16} />
        </button>
      )}
      {state.canReply && (
        <button
          class={styles.actionBtn}
          title="Reply"
          onClick={(e) => {
            e.stopPropagation();
            state.onReply?.();
          }}
        >
          <Icon name="MessageCircle" size={16} />
        </button>
      )}
      <button class={styles.actionBtn} title="More" onClick={handleMoreClick}>
        <Icon name="MoreHorizontal" size={16} />
      </button>
    </div>
  );
}
