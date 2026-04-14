import { h } from "preact";
import styles from "./LoadingButton.module.css";

interface LoadingButtonProps {
  isLoading?: boolean;
  onClick?: () => void | Promise<void>;
  children: any;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  className?: string;
  [key: string]: any;
}

export function LoadingButton({
  isLoading = false,
  onClick,
  children,
  variant = "primary",
  disabled,
  className = "",
  ...rest
}: LoadingButtonProps) {
  const handleClick = async () => {
    if (isLoading || disabled) return;
    if (onClick) {
      await onClick();
    }
  };

  return (
    <button
      className={`${styles.loadingButton} ${styles[variant] || ""}${
        isLoading ? ` ${styles.loading}` : ""
      }${disabled ? " disabled" : ""} ${className.trim()}`}
      onClick={handleClick}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={styles.spinner}
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            opacity="0.25"
          />
          <path
            d="M22 12C22 17.5228 17.5228 22 12 22C10.1786 22 8.47087 21.513 7 20.6708"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span className={styles.loadingButtonText}>{children}</span>
    </button>
  );
}
