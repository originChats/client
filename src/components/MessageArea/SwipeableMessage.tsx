import { useRef, useState } from "preact/hooks";
import { type ComponentChildren } from "preact";
import { Icon } from "../Icon";
import styles from "./MessageArea.module.css";

const SWIPE_THRESHOLD = 50;
const SWIPE_MAX = 72;
const SPRING_TENSION = 320;
const SPRING_FRICTION = 1000;

export interface SwipeableMessageProps {
  children: ComponentChildren;
  canEdit: boolean;
  canReply: boolean;
  onReply: () => void;
  onEdit: () => void;
}

export function SwipeableMessage({
  children,
  canEdit,
  canReply,
  onReply,
  onEdit,
}: SwipeableMessageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const translateX = useRef(0);
  const velocity = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);
  const rafId = useRef<number | null>(null);
  const triggered = useRef(false);
  const pointerId = useRef<number | null>(null);
  const [actionDir, setActionDir] = useState<"reply" | "edit" | null>(null);
  const [triggered2, setTriggered2] = useState(false);

  const applyTranslate = (x: number) => {
    const el = wrapperRef.current;
    if (!el) return;
    const inner = el.querySelector(
      `.${styles.swipeInner}`,
    ) as HTMLElement | null;
    if (inner) inner.style.transform = `translateX(${x}px)`;
    const icon = el.querySelector(
      `.${styles.swipeActionIcon}`,
    ) as HTMLElement | null;
    if (icon) {
      const progress = Math.min(Math.abs(x) / SWIPE_THRESHOLD, 1);
      const scale = 0.4 + 0.6 * progress;
      const opacity = progress;
      icon.style.opacity = String(opacity);
      icon.style.transform = `scale(${scale})`;
    }
  };

  const springBack = () => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    let pos = translateX.current;
    let vel = velocity.current * 0.3;

    const step = () => {
      const spring = -SPRING_TENSION * pos;
      const damper = -SPRING_FRICTION * vel;
      const acc = (spring + damper) / 60;
      vel += acc / 60;
      pos += vel;

      if (Math.abs(pos) < 0.3 && Math.abs(vel) < 0.3) {
        pos = 0;
        vel = 0;
        translateX.current = 0;
        velocity.current = 0;
        applyTranslate(0);
        setActionDir(null);
        setTriggered2(false);
        return;
      }
      translateX.current = pos;
      applyTranslate(pos);
      rafId.current = requestAnimationFrame(step);
    };
    rafId.current = requestAnimationFrame(step);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    if (pointerId.current !== null) return;
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    isDragging.current = true;
    isHorizontal.current = null;
    triggered.current = false;
    velocity.current = 0;
    if (rafId.current) cancelAnimationFrame(rafId.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging.current || e.pointerId !== pointerId.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (isHorizontal.current === null) {
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      if (!isHorizontal.current) {
        isDragging.current = false;
        return;
      }
    }
    if (!isHorizontal.current) return;
    e.preventDefault();

    const dir = dx > 0 ? (canEdit ? "edit" : null) : canReply ? "reply" : null;
    if (!dir) {
      const clamped = dx < 0 ? Math.max(dx * 0.15, -16) : 0;
      velocity.current = clamped - translateX.current;
      translateX.current = clamped;
      applyTranslate(clamped);
      return;
    }

    setActionDir(dir);

    let newX: number;
    const absDx = Math.abs(dx);
    if (absDx <= SWIPE_THRESHOLD) {
      newX = dx;
    } else {
      const overshoot = absDx - SWIPE_THRESHOLD;
      const rubberBand = SWIPE_THRESHOLD + Math.sqrt(overshoot) * 3.5;
      newX = Math.min(rubberBand, SWIPE_MAX) * Math.sign(dx);
    }

    velocity.current = newX - translateX.current;
    translateX.current = newX;
    applyTranslate(newX);

    if (!triggered.current && Math.abs(newX) >= SWIPE_THRESHOLD) {
      triggered.current = true;
      setTriggered2(true);
      if (navigator.vibrate) navigator.vibrate(12);
    }
    if (triggered.current && Math.abs(newX) < SWIPE_THRESHOLD) {
      triggered.current = false;
      setTriggered2(false);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isDragging.current || e.pointerId !== pointerId.current) return;
    isDragging.current = false;
    pointerId.current = null;

    if (triggered.current) {
      const dir = actionDir;
      setTimeout(() => {
        if (dir === "reply") onReply();
        else if (dir === "edit") onEdit();
      }, 50);
    }

    springBack();
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId !== pointerId.current) return;
    isDragging.current = false;
    pointerId.current = null;
    springBack();
  };

  const iconName = actionDir === "edit" ? "Pencil" : "Reply";
  const iconColor =
    actionDir === "edit"
      ? "var(--warning)"
      : actionDir === "reply"
        ? "var(--mention)"
        : "var(--text-dim)";
  const iconSide = actionDir === "edit" ? "left" : "right";

  return (
    <div
      ref={wrapperRef}
      className={`${styles.swipeWrapper}${triggered2 ? ` ${styles.swipeTriggered}` : ""}`}
      onPointerDown={onPointerDown as any}
      onPointerMove={onPointerMove as any}
      onPointerUp={onPointerUp as any}
      onPointerCancel={onPointerCancel as any}
    >
      {actionDir && (
        <div
          className={`${styles.swipeActionIcon} ${styles[`swipeActionIcon${iconSide === "left" ? "Left" : "Right"}`]}`}
        >
          <div
            className={styles.swipeActionIconBg}
            style={{ background: iconColor }}
          />
          <Icon name={iconName as any} size={18} />
        </div>
      )}
      <div className={styles.swipeInner}>{children}</div>
    </div>
  );
}
