import { useState, useEffect, useCallback } from "preact/hooks";
import { Icon } from "../Icon";
import { favGifs as dbFavGifs } from "../../lib/db";

interface ImageResult {
  url: string;
  preview: string;
  savedAt: number;
}

interface ImageViewerProps {
  isOpen: boolean;
  imageUrl: string;
  expiresAt?: number | null;
  images?: Array<{ url: string; expiresAt?: number | null }>;
  currentIndex?: number;
  onClose: () => void;
  onNavigate?: (index: number) => void;
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

export function ImageViewer({
  isOpen,
  imageUrl,
  expiresAt,
  images,
  currentIndex,
  onClose,
  onNavigate,
}: ImageViewerProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setIsFavorite(false);
    setError(false);
  }, [imageUrl, isOpen]);

  const handleImageError = () => {
    setError(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (images && currentIndex !== undefined) {
        if (e.key === "ArrowLeft" && currentIndex > 0) {
          onNavigate?.(currentIndex - 1);
        } else if (e.key === "ArrowRight" && currentIndex < images.length - 1) {
          onNavigate?.(currentIndex + 1);
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, images, currentIndex, onNavigate]);

  useEffect(() => {
    if (isOpen) {
      dbFavGifs.get().then((saved) => {
        setIsFavorite(saved.some((f: ImageResult) => f.url === imageUrl));
      });
    }
  }, [imageUrl, isOpen]);

  const toggleFavorite = useCallback(() => {
    dbFavGifs.get().then((saved) => {
      let favorites: ImageResult[] = saved as ImageResult[];

      if (isFavorite) {
        favorites = favorites.filter((f: ImageResult) => f.url !== imageUrl);
        dbFavGifs.set(favorites);
        setIsFavorite(false);
      } else {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          const canvas = document.createElement("canvas");
          const maxSize = 150;
          let w = image.naturalWidth;
          let h = image.naturalHeight;

          if (w > h) {
            if (w > maxSize) {
              h *= maxSize / w;
              w = maxSize;
            }
          } else {
            if (h > maxSize) {
              w *= maxSize / h;
              h = maxSize;
            }
          }

          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(image, 0, 0, w, h);
            const preview = canvas.toDataURL("image/jpeg", 0.7);

            favorites.unshift({
              url: imageUrl,
              preview,
              savedAt: Date.now(),
            });

            dbFavGifs.set(favorites);
            setIsFavorite(true);
          }
        };
        image.src = imageUrl;
      }
    });
  }, [imageUrl, isFavorite]);

  if (!isOpen) return null;

  return (
    <div className="image-modal active" onClick={onClose}>
      <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
        {error ? (
          <div className="image-error">
            <Icon name="Image" size={48} />
            <p>Failed to load image</p>
          </div>
        ) : (
          <img src={imageUrl} alt="Full size" onError={handleImageError} />
        )}
      </div>
      <div className="image-modal-buttons">
        {expiresAt && (
          <div className="image-modal-expiry">{formatExpiry(expiresAt)}</div>
        )}
        <button
          className={`modal-fav-btn${isFavorite ? " active" : ""}`}
          onClick={toggleFavorite}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Icon
            name="Star"
            size={20}
            fill={isFavorite ? "currentColor" : "none"}
          />
        </button>
        <button className="modal-close-btn" onClick={onClose} title="Close">
          <Icon name="X" size={20} />
        </button>
      </div>
    </div>
  );
}
