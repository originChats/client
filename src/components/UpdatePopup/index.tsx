import { signal } from "@preact/signals";
import { Icon } from "../Icon";

export const updateAvailable = signal(false);

export function UpdatePopup() {
  if (!updateAvailable.value) return null;

  return (
    <div class="update-popup">
      <div class="update-popup-header">
        <Icon name="Download" size={20} />
        <div class="update-popup-content">
          <span class="update-popup-title">Update available</span>
          <span class="update-popup-desc">A new version of OriginChats is ready.</span>
        </div>
      </div>
      <div class="update-popup-actions">
        <button
          class="update-popup-refresh"
          onClick={() => {
            if (window.updateServiceWorker) {
              window.updateServiceWorker(true);
            } else {
              window.location.reload();
            }
          }}
        >
          Refresh
        </button>
        <button class="update-popup-dismiss" onClick={() => (updateAvailable.value = false)}>
          Later
        </button>
      </div>
    </div>
  );
}
