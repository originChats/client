import { memo } from "preact/compat";
import type { ComponentChildren } from "preact";
import styles from "./Badge.module.css";

interface BadgeProps {
  variant?: "webhook" | "op" | "default";
  children: ComponentChildren;
  className?: string;
  title?: string;
}

function BadgeInner({
  variant = "default",
  children,
  className = "",
  title,
}: BadgeProps) {
  let variantClass: string;
  switch (variant) {
    case "webhook":
      variantClass = styles.badgeWebhook;
      break;
    case "op":
      variantClass = styles.badgeOp;
      break;
    default:
      variantClass = styles.badgeDefault;
      break;
  }

  return (
    <span
      className={`${styles.badge} ${variantClass} ${className}`}
      title={title}
    >
      {children}
    </span>
  );
}

export const Badge = memo(BadgeInner);
