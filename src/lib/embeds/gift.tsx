import { useState, useEffect } from "preact/hooks";
import { getGift, claimGift } from "../rotur-api";
import { Icon } from "../../components/Icon";

interface GiftEmbedProps {
  giftCode: string;
  originalUrl: string;
}

export function GiftEmbed({ giftCode, originalUrl }: GiftEmbedProps) {
  const [gift, setGift] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getGift(giftCode, controller.signal)
      .then((data) => {
        if (!data.gift) throw new Error("Invalid gift response");
        setGift(data.gift);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [giftCode]);

  const handleClaim = async () => {
    setClaiming(true);
    setClaimError(null);
    try {
      await claimGift(giftCode);
      setClaimed(true);
    } catch (err: any) {
      setClaimError(err.message || "Failed to claim");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) return null;

  if (error || !gift) {
    return (
      <div className="embed-container gift-embed">
        <div className="gift-card gift-error">
          <div className="gift-card-header">
            <div className="gift-icon">
              <Icon name="Gift" size={32} />
            </div>
            <div className="gift-card-title">Gift Not Found</div>
          </div>
        </div>
      </div>
    );
  }

  const isClaimed =
    (gift.claimed_at && !gift.cancelled_at && !gift.is_expired) || claimed;
  const isCancelled = gift.cancelled_at;
  const isExpired = gift.is_expired;
  const canClaim =
    !gift.claimed_at && !gift.cancelled_at && !gift.is_expired && !claimed;

  return (
    <div className="embed-container gift-embed">
      <div className="gift-card">
        <div className="gift-card-header">
          <div className="gift-icon">
            <svg
              viewBox="0 0 24 24"
              width="32"
              height="32"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="8" width="18" height="4" rx="1" />
              <path d="M12 8v13" />
              <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
              <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
            </svg>
          </div>
          <div className="gift-card-title">Rotur Gift</div>
        </div>
        <div className="gift-card-body">
          <div className="gift-amount">{gift.amount.toFixed(2)} RC</div>
          {gift.note && <div className="gift-note">{gift.note}</div>}
          {gift.expires_at && (
            <div className="gift-expiry">
              Expires: {new Date(gift.expires_at).toLocaleDateString()}
            </div>
          )}
        </div>
        {canClaim && (
          <button
            className="gift-claim-btn"
            onClick={handleClaim}
            disabled={claiming}
          >
            {claiming ? "Claiming..." : "Claim Gift"}
          </button>
        )}
        {claimError && (
          <div
            className="gift-status"
            style={{ color: "var(--danger, #ed4245)" }}
          >
            {claimError}
          </div>
        )}
        {isClaimed && (
          <div className="gift-status claimed">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Claimed
          </div>
        )}
        {isCancelled && <div className="gift-status cancelled">Cancelled</div>}
        {isExpired && <div className="gift-status expired">Expired</div>}
      </div>
    </div>
  );
}
