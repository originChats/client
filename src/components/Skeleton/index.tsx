import { h } from "preact";
import styles from "./Skeleton.module.css";

function SkeletonBase({
  className = "",
  style = {},
}: {
  className?: string;
  style?: any;
}) {
  return (
    <div className={`${styles.skeleton} ${className.trim()}`} style={style} />
  );
}

function SkeletonAvatar() {
  return <div className={styles.skeletonAvatar} />;
}

function SkeletonText({
  width = "100%",
  className = "",
}: {
  width?: string;
  className?: string;
}) {
  return (
    <div
      className={`${styles.skeletonText} ${className.trim()}`}
      style={{ width }}
    />
  );
}

function SkeletonListItem() {
  return (
    <div className={styles.skeletonListItem}>
      <SkeletonAvatar />
      <div className={styles.skeletonListItemContent}>
        <SkeletonText width="60%" />
        <SkeletonText width="40%" />
      </div>
    </div>
  );
}

function SkeletonMessage() {
  return (
    <div className={styles.skeletonMessage}>
      <div className={styles.skeletonMessageAvatar} />
      <div className={styles.skeletonMessageContent}>
        <div className={styles.skeletonMessageLine1}>
          <SkeletonText width="25%" />
          <SkeletonText width="10%" className="short" />
        </div>
        <SkeletonText className={styles.skeletonMessageLine2} />
        <SkeletonText className={styles.skeletonMessageLine3} />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className={styles.skeletonCard}>
      <div className={styles.skeletonCardHeader}>
        <div className={styles.skeletonCardAvatar} />
        <div className={styles.skeletonCardMeta}>
          <SkeletonText width="50%" />
          <SkeletonText width="30%" />
        </div>
      </div>
      <SkeletonText />
      <SkeletonText width="80%" />
    </div>
  );
}

function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </>
  );
}

export function SkeletonMessageList({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMessage key={i} />
      ))}
    </>
  );
}
