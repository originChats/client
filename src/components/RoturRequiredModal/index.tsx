import { Modal } from "../Modal";
import { Icon } from "../Icon";
import { showRoturRequiredModal } from "../../lib/ui-signals";
import { servers } from "../../state";
import { getAuthRedirectUrl } from "../../lib/rotur-api";
import { session as dbSession } from "../../lib/db";
import { closeWebSocket } from "../../lib/ws-connection";

export function RoturRequiredModal() {
  const isOpen = showRoturRequiredModal.value !== null;
  const sUrl = showRoturRequiredModal.value;

  const server = servers.value.find((s) => s.url === sUrl);
  const serverName = server?.name || sUrl || "this server";

  const handleLogin = () => {
    dbSession.del("token");
    window.location.href = getAuthRedirectUrl(window.location.href);
  };

  const handleDisconnect = () => {
    if (sUrl) {
      closeWebSocket(sUrl);
    }
    showRoturRequiredModal.value = null;
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleDisconnect}
      title="Rotur Login Required"
      showClose={false}
    >
      <div className="rotur-required-modal">
        <div className="rotur-required-icon">
          <Icon name="LogIn" size={48} />
        </div>

        <div className="rotur-required-message">
          <p>
            <strong>{serverName}</strong> requires a Rotur account to access.
          </p>
          <p className="rotur-required-description">
            Please log in with your Rotur account to continue, or disconnect
            from this server.
          </p>
        </div>

        <div className="rotur-required-actions">
          <button className="btn btn-primary" onClick={handleLogin}>
            <Icon name="LogIn" size={16} />
            <span>Login with Rotur</span>
          </button>
          <button className="btn btn-secondary" onClick={handleDisconnect}>
            <Icon name="Unlink" size={16} />
            <span>Disconnect</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
