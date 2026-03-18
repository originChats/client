import { h } from "preact";
import { Icon } from "../Icon";
import styles from "./ProgressBar.module.css";

export interface ProgressBarProps {
  progress: number;
  label?: string;
  showPercentage?: boolean;
  size?: "small" | "normal";
  onCancel?: () => void;
  fileName?: string;
  fileSize?: string;
}

export function ProgressBar({
  progress,
  label,
  showPercentage = true,
  size = "normal",
  onCancel,
  fileName,
  fileSize,
}: ProgressBarProps) {
  const percentage = Math.round(Math.min(Math.max(progress, 0), 100));

  return (
    <div className={styles.progressBarContainer}>
      {(fileName || label) && (
        <div className={styles.progressBarLabel}>
          {fileName ? (
            <div className={styles.progressBarFile}>
              <span className={styles.progressBarFileName}>{fileName}</span>
              {fileSize && (
                <span className={styles.progressBarFileSize}>{fileSize}</span>
              )}
            </div>
          ) : (
            <span>{label}</span>
          )}
          {showPercentage && <span>{percentage}%</span>}
        </div>
      )}
      <div
        className={`${styles.progressBar} ${size === "small" ? styles.progressBarSmall : ""}`}
      >
        <div
          className={styles.progressBarFill}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {onCancel && (
        <button
          className={styles.progressBarCancel}
          onClick={onCancel}
          aria-label="Cancel upload"
        >
          <Icon name="X" size={14} />
        </button>
      )}
    </div>
  );
}

export function ProgressList({
  items,
}: {
  items: Array<{
    id: string;
    fileName: string;
    progress: number;
    fileSize?: string;
    onCancel?: () => void;
  }>;
}) {
  return (
    <div className={styles.progressList}>
      {items.map((item) => (
        <div key={item.id} className={styles.progressListItem}>
          <ProgressBar
            progress={item.progress}
            fileName={item.fileName}
            fileSize={item.fileSize}
            onCancel={item.onCancel}
          />
        </div>
      ))}
    </div>
  );
}
