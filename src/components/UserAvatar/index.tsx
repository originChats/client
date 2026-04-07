import { useState, memo } from "preact/compat";
import { avatarUrl, isCrackedAccount } from "../../utils";

type UserAvatarProps = {
  username: string;
  nickname?: string;
  pfp?: string;
  cracked?: boolean;
  size?: number;
  className?: string;
  alt?: string;
  onClick?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
};

function UserAvatarInner({
  username,
  nickname,
  pfp,
  cracked,
  size,
  className,
  alt,
  onClick,
  onContextMenu,
}: UserAvatarProps) {
  const [failed, setFailed] = useState(false);

  const isCracked = cracked || isCrackedAccount(username);
  const baseName = nickname || username.replace(/^USR:/, "");
  const initials = baseName.substring(0, 2).toUpperCase();

  const initialsStyle: Record<string, string | number> = {
    alignItems: "center",
    background: "var(--surface-light)",
    borderRadius: "var(--avatar-radius, 50%)",
    display: "flex",
    flexShrink: 0,
    fontWeight: 500,
    justifyContent: "center",
    textTransform: "uppercase",
    userSelect: "none",
  };

  if (size) {
    initialsStyle.fontSize = `${size * 0.45}px`;
    initialsStyle.width = `${size}px`;
    initialsStyle.height = `${size}px`;
  }

  if (isCracked && !pfp) {
    return (
      <span
        className={className}
        style={initialsStyle}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {initials}
      </span>
    );
  }

  const src = pfp || avatarUrl(username);

  if (failed && !pfp) {
    return (
      <span
        className={className}
        style={initialsStyle}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt || baseName}
      className={className}
      onError={() => setFailed(true)}
      onClick={onClick}
      onContextMenu={onContextMenu}
    />
  );
}

export const UserAvatar = memo(UserAvatarInner);
