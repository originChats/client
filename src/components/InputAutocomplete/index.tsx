import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import {
  users,
  channels,
  slashCommands,
  rolesByServer,
  serverUrl,
  currentChannel,
} from "../../state";
import { avatarUrl } from "../../utils";
import { emojiImgUrl } from "../../lib/emoji";
import joypixels from "../../../public/joypixels.json";

type AutocompleteType = "user" | "channel" | "emoji" | "slash" | "role";

interface AutocompleteItem {
  type: AutocompleteType;
  label: string;
  insertText: string;
  icon?: string;
  hexcode?: string;
  description?: string;
  registeredBy?: string;
}

interface AutocompleteState {
  active: boolean;
  type: AutocompleteType | null;
  query: string;
  triggerStart: number;
  items: AutocompleteItem[];
  selectedIndex: number;
}

const INITIAL_STATE: AutocompleteState = {
  active: false,
  type: null,
  query: "",
  triggerStart: 0,
  items: [],
  selectedIndex: 0,
};

interface TriggerInfo {
  type: AutocompleteType;
  query: string;
  triggerStart: number;
}

function detectTrigger(text: string, cursorPos: number): TriggerInfo | null {
  const beforeCursor = text.substring(0, cursorPos);

  for (let i = beforeCursor.length - 1; i >= 0; i--) {
    const char = beforeCursor[i];

    if (char === " " || char === "\n" || char === "\r" || char === "\t") {
      return null;
    }

    if (char === "@") {
      if (i > 0 && !/\s/.test(beforeCursor[i - 1])) return null;
      // Check for @& (role ping) — the & immediately follows @
      if (beforeCursor[i + 1] === "&") {
        return {
          type: "role",
          query: beforeCursor.substring(i + 2),
          triggerStart: i,
        };
      }
      return {
        type: "user",
        query: beforeCursor.substring(i + 1),
        triggerStart: i,
      };
    }

    if (char === "#") {
      if (i > 0 && !/\s/.test(beforeCursor[i - 1])) return null;
      return {
        type: "channel",
        query: beforeCursor.substring(i + 1),
        triggerStart: i,
      };
    }

    if (char === ":") {
      if (i > 0 && !/\s/.test(beforeCursor[i - 1])) return null;
      const query = beforeCursor.substring(i + 1);
      if (query.includes(":")) return null;
      if (query.length < 2) return null;
      return { type: "emoji", query, triggerStart: i };
    }

    if (char === "/") {
      // Only trigger slash autocomplete when / is the very first character
      // of the message (position 0). A slash anywhere else (mid-sentence,
      // after whitespace, in a URL, etc.) must not open the autocomplete.
      if (i !== 0) return null;
      return {
        type: "slash",
        query: beforeCursor.substring(i + 1),
        triggerStart: i,
      };
    }
  }

  return null;
}

function searchUsers(query: string): AutocompleteItem[] {
  const userMap = users.value;
  const q = query.toLowerCase();
  const results: AutocompleteItem[] = [];

  const channel = currentChannel.value;
  const viewRoles = channel?.permissions?.view;

  const eligibleUsers = Object.values(userMap).filter((u) => {
    if (!viewRoles || viewRoles.length === 0) return true;
    const userRoles = u.roles || [];
    return viewRoles.some((r) => userRoles.includes(r));
  });

  for (const u of eligibleUsers) {
    const username = u.username;
    if (username.toLowerCase().includes(q)) {
      results.push({
        type: "user",
        label: username,
        insertText: `@${username} `,
        icon: avatarUrl(username),
      });
    }
    if (results.length >= 10) break;
  }

  return results;
}

function searchChannels(query: string): AutocompleteItem[] {
  const channelList = channels.value;
  const q = query.toLowerCase();
  const results: AutocompleteItem[] = [];

  for (const ch of channelList) {
    if (!ch?.name) continue;
    const display = ch.display_name || ch.name;
    if (
      ch.name.toLowerCase().includes(q) ||
      display.toLowerCase().includes(q)
    ) {
      results.push({
        type: "channel",
        label: display,
        insertText: `#${ch.name} `,
      });
    }
    if (results.length >= 10) break;
  }

  return results;
}

function searchRoles(query: string): AutocompleteItem[] {
  const rolesMap = rolesByServer.value[serverUrl.value] || {};
  const q = query.toLowerCase();
  const results: AutocompleteItem[] = [];

  for (const [name, role] of Object.entries(rolesMap)) {
    if (name.toLowerCase().includes(q)) {
      results.push({
        type: "role",
        label: name,
        insertText: `@&${name} `,
        icon: role.color || "#5865F2",
      });
    }
    if (results.length >= 10) break;
  }

  return results;
}

interface EmojiEntry {
  label: string;
  hexcode: string;
  emoji: string;
  tags?: string[];
}

function searchEmojis(query: string): AutocompleteItem[] {
  const emojis: EmojiEntry[] = (window as any).emojis || [];
  const q = query.toLowerCase();
  const exact: AutocompleteItem[] = [];
  const rest: AutocompleteItem[] = [];

  for (const entry of emojis) {
    if (!entry.emoji || !entry.label) continue;
	let shortcode = joypixels[entry.hexcode];
    if(!shortcode) continue;
	const matchesLabel = shortcode.includes(q);
    const matchesTags = entry.tags?.some((t) => t.toLowerCase().includes(q));
    if (!matchesLabel && !matchesTags) continue;
    if(Array.isArray(shortcode)) shortcode = shortcode[0];
	
    const item: AutocompleteItem = {
      type: "emoji",
      label: shortcode,
      insertText: `:${shortcode}:`,
      icon: entry.emoji,
      hexcode: entry.hexcode,
    };

    if (shortcode === q) {
      exact.push(item);
    } else {
      rest.push(item);
    }

    if (exact.length + rest.length >= 20) break;
  }

  return [...exact, ...rest].slice(0, 10);
}

function searchSlashCommands(query: string): AutocompleteItem[] {
  const cmdList = slashCommands.value;
  const q = query.toLowerCase();
  const results: AutocompleteItem[] = [];

  for (const cmd of cmdList) {
    if (!cmd?.name) continue;
    if (cmd.name.toLowerCase().includes(q)) {
      results.push({
        type: "slash",
        label: cmd.name,
        insertText: `/${cmd.name} `,
        description: cmd.description,
        registeredBy: cmd.registeredBy,
        icon: cmd.registeredBy ? avatarUrl(cmd.registeredBy) : undefined,
      });
    }
  }

  return results;
}

export function useInputAutocomplete(inputId: string) {
  const [state, setState] = useState<AutocompleteState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const close = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const handleInput = useCallback(() => {
    const input = document.getElementById(inputId) as HTMLTextAreaElement;
    if (!input) return;

    const cursorPos = input.selectionStart;
    const text = input.value;
    const trigger = detectTrigger(text, cursorPos);

    if (!trigger) {
      if (stateRef.current.active) close();
      return;
    }

    let items: AutocompleteItem[];
    switch (trigger.type) {
      case "user":
        items = [...searchUsers(trigger.query), ...searchRoles(trigger.query)];
        break;
      case "channel":
        items = searchChannels(trigger.query);
        break;
      case "role":
        items = searchRoles(trigger.query);
        break;
      case "emoji":
        items = searchEmojis(trigger.query);
        break;
      case "slash":
        items = searchSlashCommands(trigger.query);
        break;
    }

    if (items.length === 0) {
      if (stateRef.current.active) close();
      return;
    }

    setState({
      active: true,
      type: trigger.type,
      query: trigger.query,
      triggerStart: trigger.triggerStart,
      items,
      selectedIndex: 0,
    });
  }, [inputId, close]);

  const selectItem = useCallback(
    (index: number) => {
      const current = stateRef.current;
      if (!current.active || index < 0 || index >= current.items.length) return;

      const item = current.items[index];
      const input = document.getElementById(inputId) as HTMLTextAreaElement;
      if (!input) return;

      const before = input.value.substring(0, current.triggerStart);
      const after = input.value.substring(input.selectionStart);
      const insertion = item.insertText.endsWith(" ")
        ? item.insertText
        : item.insertText + " ";
      input.value = before + insertion + after;

      const newCursorPos = before.length + insertion.length;
      input.setSelectionRange(newCursorPos, newCursorPos);
      input.focus();

      close();
    },
    [inputId, close],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      const current = stateRef.current;
      if (!current.active) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setState((prev) => ({
          ...prev,
          selectedIndex: Math.min(
            prev.selectedIndex + 1,
            prev.items.length - 1,
          ),
        }));
        return true;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setState((prev) => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0),
        }));
        return true;
      }

      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        selectItem(current.selectedIndex);
        return true;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return true;
      }

      return false;
    },
    [selectItem, close],
  );

  const setSelectedIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, selectedIndex: index }));
  }, []);

  return {
    state,
    handleInput,
    handleKeyDown,
    selectItem,
    close,
    setSelectedIndex,
  };
}

interface InputAutocompleteProps {
  state: AutocompleteState;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}

export function InputAutocomplete({
  state,
  onSelect,
  onHover,
}: InputAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [activeUser, setActiveUser] = useState<string | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[
      state.selectedIndex
    ] as HTMLElement;
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }, [state.selectedIndex]);

  // When slash items change, reset activeUser filter
  useEffect(() => {
    if (state.type === "slash") {
      setActiveUser(null);
    }
  }, [state.type, state.items]);

  if (!state.active || state.items.length === 0) return null;

  // ── Non-slash types: original flat layout ────────────────────────────────

  if (state.type !== "slash") {
    const typeLabel =
      state.type === "user"
        ? "Members & Roles"
        : state.type === "channel"
          ? "Channels"
          : state.type === "role"
            ? "Roles"
            : "Emoji";

    return (
      <div className="input-autocomplete">
        <div className="autocomplete-header">{typeLabel}</div>
        <div className="autocomplete-list" ref={listRef}>
          {state.items.map((item, i) => (
            <div
              key={`${item.type}-${item.label}-${i}`}
              className={`autocomplete-item ${i === state.selectedIndex ? "selected" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(i);
              }}
              onMouseEnter={() => onHover(i)}
            >
              {item.type === "user" && item.icon && (
                <img src={item.icon} className="autocomplete-avatar" alt="" />
              )}
              {item.type === "role" && (
                <span
                  className="autocomplete-role-dot"
                  style={{ background: item.icon || "#5865F2" }}
                />
              )}
              {item.type === "emoji" &&
                item.hexcode &&
                (() => {
                  const url = emojiImgUrl(item.hexcode);
                  return url ? (
                    <img
                      src={url}
                      alt={item.icon}
                      className="autocomplete-emoji-icon"
                      draggable={false}
                    />
                  ) : (
                    <span className="autocomplete-emoji-icon autocomplete-emoji-system">
                      {item.icon}
                    </span>
                  );
                })()}
              {item.type === "channel" && (
                <span className="autocomplete-icon-hash">#</span>
              )}
              <span className="autocomplete-label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Slash type: Discord-style sidebar + grouped layout ────────────────────

  // Collect unique registeredBy users in order of first appearance
  const allUsers = Array.from(
    new Map(
      state.items
        .filter((item) => item.registeredBy)
        .map((item) => [item.registeredBy!, item]),
    ).entries(),
  ).map(([username, item]) => ({ username, icon: item.icon }));

  // Items filtered to active user (or all if none selected)
  const visibleItems =
    activeUser !== null
      ? state.items.filter((item) => item.registeredBy === activeUser)
      : state.items;

  // Group visible items by registeredBy
  const groups: {
    user: string;
    icon?: string;
    items: { item: AutocompleteItem; globalIndex: number }[];
  }[] = [];
  for (const { item: visItem, globalIndex } of visibleItems.map((item, _) => {
    const globalIndex = state.items.indexOf(item);
    return { item, globalIndex };
  })) {
    const user = visItem.registeredBy || "";
    const existing = groups.find((g) => g.user === user);
    if (existing) {
      existing.items.push({ item: visItem, globalIndex });
    } else {
      groups.push({
        user,
        icon: visItem.icon,
        items: [{ item: visItem, globalIndex }],
      });
    }
  }

  const scrollToUser = (username: string) => {
    setActiveUser((prev) => (prev === username ? null : username));
  };

  return (
    <div className="input-autocomplete input-autocomplete--slash">
      {/* Left sidebar: one pfp button per registeredBy user */}
      {allUsers.length > 1 && (
        <div className="autocomplete-slash-sidebar">
          {allUsers.map(({ username, icon }) => (
            <button
              key={username}
              className={`autocomplete-slash-sidebar-btn${activeUser === username ? " active" : ""}`}
              title={username}
              onMouseDown={(e) => {
                e.preventDefault();
                scrollToUser(username);
              }}
            >
              <img
                src={icon || avatarUrl(username)}
                alt={username}
                className="autocomplete-slash-sidebar-avatar"
              />
            </button>
          ))}
        </div>
      )}

      {/* Right: scrollable command list grouped by user */}
      <div className="autocomplete-slash-body">
        <div className="autocomplete-slash-list" ref={listRef}>
          {groups.map(({ user, icon, items }) => (
            <div key={user} className="autocomplete-slash-group">
              <div className="autocomplete-slash-group-header">
                <img
                  src={icon || avatarUrl(user)}
                  alt={user}
                  className="autocomplete-slash-group-avatar"
                />
                <span className="autocomplete-slash-group-name">{user}</span>
              </div>
              {items.map(({ item, globalIndex }) => (
                <div
                  key={`slash-${item.label}`}
                  className={`autocomplete-item${globalIndex === state.selectedIndex ? " selected" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(globalIndex);
                  }}
                  onMouseEnter={() => onHover(globalIndex)}
                >
                  <span className="autocomplete-icon-slash">/</span>
                  <span className="autocomplete-label">{item.label}</span>
                  {item.description && (
                    <span className="autocomplete-description">
                      {item.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
