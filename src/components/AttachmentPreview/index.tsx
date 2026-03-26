import { useState, useRef, useEffect } from "preact/hooks";
import { Icon } from "../Icon";
import { imageViewerUrl } from "../../lib/ui-signals";

interface Attachment {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  url: string;
  expires_at?: number | null;
  permanent?: boolean;
}

interface AttachmentPreviewProps {
  attachments: Attachment[];
  hasContent?: boolean;
}

function openImage(url: string) {
  imageViewerUrl.value = url;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExpiry(expiresAt: number): string {
  const now = Date.now() / 1000;
  const secondsLeft = expiresAt - now;
  if (secondsLeft <= 0) return "Expired";

  const minutes = Math.floor(secondsLeft / 60);
  const hours = Math.floor(secondsLeft / 3600);
  const days = Math.floor(secondsLeft / 86400);

  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  if (minutes > 0) return `${minutes}m left`;
  return "<1m left";
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toUpperCase() : "";
}

function getFileTypeInfo(
  mimeType: string,
  filename: string,
): { icon: string; color: string; label: string } {
  const ext = getFileExtension(filename);

  if (mimeType.startsWith("image/"))
    return { icon: "Image", color: "#10b981", label: "Image" };
  if (mimeType.startsWith("video/"))
    return { icon: "Video", color: "#8b5cf6", label: "Video" };
  if (mimeType.startsWith("audio/"))
    return { icon: "Music", color: "#ec4899", label: "Audio" };
  if (mimeType === "application/pdf")
    return { icon: "FileText", color: "#ef4444", label: "PDF" };
  if (
    mimeType.includes("zip") ||
    mimeType.includes("rar") ||
    mimeType.includes("7z") ||
    mimeType.includes("tar") ||
    mimeType.includes("gzip")
  )
    return { icon: "Package", color: "#f59e0b", label: "Archive" };

  const docTypes: Record<
    string,
    { icon: string; color: string; label: string }
  > = {
    DOC: { icon: "FileText", color: "#2563eb", label: "Document" },
    DOCX: { icon: "FileText", color: "#2563eb", label: "Document" },
    XLS: { icon: "Grid3x3", color: "#16a34a", label: "Spreadsheet" },
    XLSX: { icon: "Grid3x3", color: "#16a34a", label: "Spreadsheet" },
    PPT: { icon: "Layout", color: "#d97706", label: "Presentation" },
    PPTX: { icon: "Layout", color: "#d97706", label: "Presentation" },
    TXT: { icon: "FileText", color: "#6b7280", label: "Text" },
    JSON: { icon: "FileCode", color: "#6366f1", label: "JSON" },
    CSV: { icon: "FileText", color: "#16a34a", label: "CSV" },
    JS: { icon: "FileCode", color: "#f59e0b", label: "JavaScript" },
    TS: { icon: "FileCode", color: "#3b82f6", label: "TypeScript" },
    HTML: { icon: "FileCode", color: "#f97316", label: "HTML" },
    CSS: { icon: "FileCode", color: "#3b82f6", label: "CSS" },
  };

  return (
    docTypes[ext] || { icon: "File", color: "#6b7280", label: ext || "File" }
  );
}

function AudioPlayer({ att }: { att: Attachment }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(audio.currentTime);
      }
    };
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [isDragging]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleProgressClick = (e: MouseEvent) => {
    const audio = audioRef.current;
    const progress = progressRef.current;
    if (!audio || !progress) return;

    const rect = progress.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    const newTime = percent * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleProgressDrag = (e: MouseEvent) => {
    if (!isDragging) return;
    handleProgressClick(e);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    window.removeEventListener("mousemove", handleProgressDrag);
    window.removeEventListener("mouseup", handleDragEnd);
  };

  const handleDragStart = (e: MouseEvent) => {
    setIsDragging(true);
    handleProgressClick(e);
    window.addEventListener("mousemove", handleProgressDrag);
    window.addEventListener("mouseup", handleDragEnd);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={att.url} preload="metadata" />
      <div className="audio-player-header">
        <button className="audio-player-play-btn" onClick={togglePlay}>
          <Icon name={isPlaying ? "Pause" : "Play"} size={18} />
        </button>
        <div className="audio-player-info">
          <span className="audio-player-name">{att.name}</span>
          <div className="audio-player-meta">
            <span className="audio-player-size">
              {formatFileSize(att.size)}
            </span>
            <span className="audio-player-dot">·</span>
            <span className="audio-player-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
        <a
          href={att.url}
          target="_blank"
          rel="noopener noreferrer"
          download={att.name}
          className="audio-player-download"
        >
          <Icon name="Download" size={18} />
        </a>
      </div>
      <div
        ref={progressRef}
        className="audio-player-progress"
        onClick={handleProgressClick}
        onMouseDown={handleDragStart}
      >
        <div className="audio-player-progress-bg">
          <div
            className="audio-player-progress-fill"
            style={{ width: `${progress}%` }}
          />
          <div
            className="audio-player-progress-handle"
            style={{ left: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function AttachmentPreview({
  attachments,
  hasContent = true,
}: AttachmentPreviewProps) {
  const [expandedImages, setExpandedImages] = useState<Set<string>>(new Set());

  if (!attachments || attachments.length === 0) return null;

  const toggleImageExpand = (id: string) => {
    setExpandedImages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleImageClick = (att: Attachment) => {
    openImage(att.url);
  };

  const images = attachments.filter((a) => a.mime_type.startsWith("image/"));
  const videos = attachments.filter((a) => a.mime_type.startsWith("video/"));
  const others = attachments.filter(
    (a) =>
      !a.mime_type.startsWith("image/") && !a.mime_type.startsWith("video/"),
  );
  const isOnlyImagesOrVideos = others.length === 0;

  return (
    <div className={`message-attachments${!hasContent ? " no-margin" : ""}`}>
      {images.length > 0 && (
        <div
          className={`message-attachments-images ${images.length > 1 ? "grid" : ""} ${isOnlyImagesOrVideos ? "no-bg" : ""}`}
        >
          {images.map((att) => {
            const isExpanded = expandedImages.has(att.id);
            const showExpiry =
              att.permanent === false &&
              att.expires_at &&
              att.expires_at * 1000 < Date.now() + 7 * 24 * 60 * 60 * 1000;
            return (
              <div
                key={att.id}
                className={`message-attachment ${isOnlyImagesOrVideos ? "no-bg" : ""}`}
              >
                <img
                  src={att.url}
                  alt={att.name}
                  className={`message-attachment-image ${isExpanded ? "expanded" : ""} ${images.length > 1 ? "grid-item" : ""}`}
                  loading="lazy"
                  onClick={() => handleImageClick(att)}
                />
                {showExpiry && (
                  <div className="message-attachment-expiry">
                    {formatExpiry(att.expires_at!)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {videos.map((att) => {
        const showExpiry =
          att.expires_at &&
          att.expires_at * 1000 < Date.now() + 7 * 24 * 60 * 60 * 1000;
        return (
          <div
            key={att.id}
            className={`message-attachment ${isOnlyImagesOrVideos ? "no-bg" : ""}`}
          >
            <video
              src={att.url}
              className="message-attachment-video"
              controls
              preload="metadata"
            />
            {showExpiry && (
              <div className="message-attachment-expiry">
                {formatExpiry(att.expires_at!)}
              </div>
            )}
          </div>
        );
      })}
      {others.map((att) => {
        const isAudio = att.mime_type.startsWith("audio/");
        const typeInfo = getFileTypeInfo(att.mime_type, att.name);
        const showExpiry =
          att.expires_at &&
          att.expires_at * 1000 < Date.now() + 7 * 24 * 60 * 60 * 1000;

        return (
          <div key={att.id} className="message-attachment">
            {isAudio ? (
              <AudioPlayer att={att} />
            ) : (
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                download={att.name}
                className="message-attachment-file"
              >
                <div
                  className="message-attachment-file-icon"
                  style={{ background: typeInfo.color }}
                >
                  <Icon name={typeInfo.icon} size={24} />
                </div>
                <div className="message-attachment-file-info">
                  <span className="message-attachment-file-name">
                    {att.name}
                  </span>
                  <div className="message-attachment-file-meta">
                    <span className="message-attachment-file-type">
                      {typeInfo.label}
                    </span>
                    <span className="message-attachment-file-dot">·</span>
                    <span className="message-attachment-file-size">
                      {formatFileSize(att.size)}
                    </span>
                    {showExpiry && (
                      <>
                        <span className="message-attachment-file-dot">·</span>
                        <span className="message-attachment-expiry-inline">
                          {formatExpiry(att.expires_at!)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="message-attachment-file-download">
                  <Icon name="Download" size={18} />
                </div>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
