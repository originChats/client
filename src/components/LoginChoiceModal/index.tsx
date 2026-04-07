import { Modal } from "../Modal";
import { Icon } from "../Icon";
import { showLoginChoiceModal } from "../../lib/ui-signals";
import { getAuthRedirectUrl } from "../../lib/rotur-api";
import { session as dbSession } from "../../lib/db";

export function LoginChoiceModal() {
  const isOpen = showLoginChoiceModal.value;

  const handleRoturLogin = () => {
    dbSession.del("token");
    window.location.href = getAuthRedirectUrl(window.location.href);
  };

  const handleCrackedOnly = () => {
    showLoginChoiceModal.value = false;
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCrackedOnly}
      title="Welcome to OriginChats"
      showClose={false}
    >
      <div className="login-choice-modal">
        <div className="login-choice-description">
          <p>
            Choose how you want to use OriginChats. You can log in with your
            Rotur account for full access, or continue with server-specific
            accounts for cracked servers only.
          </p>
        </div>

        <div className="login-choice-options">
          <button
            className="login-choice-option login-choice-primary"
            onClick={handleRoturLogin}
          >
            <div className="login-choice-icon">
              <Icon name="User" size={24} />
            </div>
            <div className="login-choice-content">
              <div className="login-choice-title">Login with Rotur</div>
              <div className="login-choice-desc">
                Full access to all servers, sync profile across devices, and
                more.
              </div>
            </div>
          </button>

          <button
            className="login-choice-option login-choice-secondary"
            onClick={handleCrackedOnly}
          >
            <div className="login-choice-icon">
              <Icon name="Server" size={24} />
            </div>
            <div className="login-choice-content">
              <div className="login-choice-title">Server Accounts Only</div>
              <div className="login-choice-desc">
                Access cracked servers with server-specific accounts. No sync
                between devices.
              </div>
            </div>
          </button>
        </div>

        <p className="login-choice-note">
          You can change this later by logging in from settings.
        </p>
      </div>
    </Modal>
  );
}
