import * as lucide from "lucide-react";
import { useState } from "preact/hooks";
import { serverIconBust } from "../../utils";

export function Icon({
  name,
  size = 20,
  color,
  fill,
}: {
  name: string;
  size?: number;
  color?: string;
  fill?: string | boolean;
}) {
  const IconComponent = (lucide as any)[name];
  if (!IconComponent) return null;
  return (
    <IconComponent
      size={size}
      color={color}
      fill={
        fill === true || fill === "currentColor" ? "currentColor" : undefined
      }
    />
  );
}

export function ServerIcon({
  server,
  className,
  size = 48,
}: {
  server: { name: string; url?: string; icon?: string | null };
  className?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const bust = server.url ? (serverIconBust.value[server.url] ?? 0) : 0;
  const key = `${bust}-${failed ? "f" : "ok"}`;

  const initials = server.name.substring(0, 2).toUpperCase();
  const style = size
    ? { fontSize: `${size * 0.4}px`, width: `${size}px`, height: `${size}px` }
    : {};

  if (!server.icon || failed) {
    return (
      <span
        className={className}
        style={style}
        onClick={() => {
          if (failed) {
            setFailed(false);
          }
        }}
      >
        {initials}
      </span>
    );
  }

  const bustSuffix = bust ? `?v=${bust}` : "";
  return (
    <img
      key={key}
      src={`${server.icon}${bustSuffix}`}
      alt={server.name}
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
