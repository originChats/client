import { h, ComponentChildren } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { Icon } from "../Icon";
import { globalContextMenu, closeContextMenu } from "../../lib/ui-signals";
import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  iconColor?: string;
  danger?: boolean;
  separator?: boolean;
  fn: (event?: Event) => void;
  /** If set, hovering this item opens a nested submenu instead of calling fn. */
  children?: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  header?: ComponentChildren;
}

const PAD = 6;

// ── Submenu panel (no backdrop-filter, positioned as sibling via callback) ────

interface SubMenuPanelProps {
  items: ContextMenuItem[];
  anchorEl: HTMLDivElement;
  onClose: () => void;
  preferLeft: boolean;
  /** Called with the resolved preferLeft so nested submenus can inherit it. */
  onOpenChild: (
    idx: number | null,
    anchorEl: HTMLDivElement | null,
    preferLeft: boolean,
  ) => void;
  openChildIdx: number | null;
  header?: ComponentChildren;
}

function SubMenuPanel({
  items,
  anchorEl,
  onClose,
  preferLeft,
  onOpenChild,
  openChildIdx,
  header,
}: SubMenuPanelProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemEls = useRef<(HTMLDivElement | null)[]>([]);
  const resolvedPreferLeft = useRef(preferLeft);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const anchor = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left: number;
    if (!preferLeft && anchor.right + menu.offsetWidth + PAD <= vw) {
      left = anchor.right;
      resolvedPreferLeft.current = false;
    } else {
      left = anchor.left - menu.offsetWidth;
      resolvedPreferLeft.current = true;
    }
    left = Math.max(PAD, Math.min(left, vw - menu.offsetWidth - PAD));
    const top = Math.max(
      PAD,
      Math.min(anchor.top, vh - menu.offsetHeight - PAD),
    );

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = "visible";
  }, []);

  return (
    <div
      ref={menuRef}
      className={`${styles.contextMenu} ${styles.contextMenuSub}`}
      style="position:fixed;display:block;visibility:hidden"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {header && <div className={styles.contextMenuHeader}>{header}</div>}
      {items.map((item, idx) => {
        if (item.separator)
          return <div key={idx} className={styles.contextMenuSeparator} />;
        const hasChildren = !!item.children?.length;
        return (
          <div
            key={idx}
            ref={(el) => {
              itemEls.current[idx] = el;
            }}
            className={`${styles.contextMenuItem}${item.danger ? ` ${styles.danger}` : ""}${hasChildren ? ` ${styles.hasSubmenu}` : ""}`}
            onMouseEnter={() =>
              onOpenChild(
                hasChildren ? idx : null,
                hasChildren ? itemEls.current[idx] : null,
                resolvedPreferLeft.current,
              )
            }
            onClick={(e) => {
              if (!hasChildren) {
                e.stopPropagation();
                item.fn(e);
                onClose();
              }
            }}
          >
            {item.icon && (
              <Icon
                name={item.icon as any}
                size={16}
                color={item.danger ? "var(--danger)" : item.iconColor}
                fill={
                  item.danger || item.iconColor ? "currentColor" : undefined
                }
              />
            )}
            <span>{item.label}</span>
            {hasChildren && (
              <span className={styles.contextMenuArrow}>
                <Icon name="ChevronRight" size={14} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Root ContextMenu ──────────────────────────────────────────────────────────
// Renders the root menu + all open submenu levels as *siblings* in a zero-size
// wrapper, so no submenu is ever a DOM descendant of a backdrop-filter element.

export function ContextMenu({
  x,
  y,
  items,
  onClose,
  header,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemEls = useRef<(HTMLDivElement | null)[]>([]);
  const preferLeftRef = useRef(false);

  // Each level of open submenu: { items, anchorEl, preferLeft }
  const [submenuStack, setSubmenuStack] = useState<
    Array<{
      items: ContextMenuItem[];
      anchorEl: HTMLDivElement;
      preferLeft: boolean;
    }>
  >([]);

  const openSubmenuAt = (
    depth: number,
    idx: number | null,
    anchorEl: HTMLDivElement | null,
    preferLeft: boolean,
  ) => {
    if (idx === null || !anchorEl) {
      // Close this depth and everything below it
      setSubmenuStack((s) => s.slice(0, depth));
      return;
    }
    const parentItems = depth === 0 ? items : submenuStack[depth - 1]?.items;
    if (!parentItems) return;
    const children = parentItems[idx]?.children;
    if (!children?.length) return;
    setSubmenuStack((s) => [
      ...s.slice(0, depth),
      { items: children, anchorEl, preferLeft },
    ]);
  };

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let finalX = x;
    let finalY = y;

    if (finalX + menu.offsetWidth > vw - PAD) {
      finalX = vw - menu.offsetWidth - PAD;
      preferLeftRef.current = true;
    } else {
      preferLeftRef.current = false;
    }
    if (finalY + menu.offsetHeight > vh - PAD)
      finalY = vh - menu.offsetHeight - PAD;
    finalX = Math.max(PAD, finalX);
    finalY = Math.max(PAD, finalY);

    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;
    menu.style.visibility = "visible";
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    // Zero-size wrapper — position:fixed creates a stacking context; give it an explicit
    // z-index so it wins over message row stacking contexts (which use z-index: var(--z-base)).
    <div style="position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:var(--z-context-menu)">
      {/* Root menu */}
      <div
        ref={menuRef}
        className={styles.contextMenu}
        style="position:fixed;display:block;visibility:hidden"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {header && <div className={styles.contextMenuHeader}>{header}</div>}
        {items.map((item, idx) => {
          if (item.separator)
            return <div key={idx} className={styles.contextMenuSeparator} />;
          const hasChildren = !!item.children?.length;
          return (
            <div
              key={idx}
              ref={(el) => {
                itemEls.current[idx] = el;
              }}
              className={`${styles.contextMenuItem}${item.danger ? ` ${styles.danger}` : ""}${hasChildren ? ` ${styles.hasSubmenu}` : ""}`}
              onMouseEnter={() =>
                openSubmenuAt(
                  0,
                  hasChildren ? idx : null,
                  hasChildren ? itemEls.current[idx] : null,
                  preferLeftRef.current,
                )
              }
              onClick={(e) => {
                if (!hasChildren) {
                  e.stopPropagation();
                  item.fn(e);
                  onClose();
                }
              }}
            >
              {item.icon && (
                <Icon
                  name={item.icon as any}
                  size={16}
                  color={item.danger ? "var(--danger)" : item.iconColor}
                  fill={
                    item.danger || item.iconColor ? "currentColor" : undefined
                  }
                />
              )}
              <span>{item.label}</span>
              {hasChildren && (
                <span className={styles.contextMenuArrow}>
                  <Icon name="ChevronRight" size={14} />
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Submenu levels — siblings of the root menu, not children */}
      {submenuStack.map((level, depth) => (
        <SubMenuPanel
          key={depth}
          items={level.items}
          anchorEl={level.anchorEl}
          onClose={onClose}
          preferLeft={level.preferLeft}
          openChildIdx={submenuStack[depth + 1] ? depth + 1 : null}
          onOpenChild={(idx, anchorEl, preferLeft) =>
            openSubmenuAt(depth + 1, idx, anchorEl, preferLeft)
          }
        />
      ))}
    </div>
  );
}

// ── GlobalContextMenu ─────────────────────────────────────────────────────────
// Mount once at the app root. Reads the globalContextMenu signal so it always
// renders outside every layout stacking context.

export function GlobalContextMenu() {
  const state = globalContextMenu.value;
  if (!state) return null;
  return (
    <ContextMenu
      x={state.x}
      y={state.y}
      items={state.items}
      onClose={closeContextMenu}
    />
  );
}
