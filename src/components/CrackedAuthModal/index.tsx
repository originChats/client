import { useState, useEffect } from "preact/hooks";
import { Modal } from "../Modal";
import { Icon } from "../Icon";
import {
  showCrackedAuthModal,
  crackedAuthError,
  pendingCrackedCredentials,
  crackedAuthLoading,
  crackedAuthMode,
} from "../../lib/ui-signals";
import { servers, token } from "../../state";
import { wsSend } from "../../lib/websocket";
import { authenticateServer } from "../../lib/auth";

export function CrackedAuthModal() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<"choice" | "form">("choice");

  const sUrl = showCrackedAuthModal.value;
  const error = crackedAuthError.value;
  const loading = crackedAuthLoading.value;
  const isOpen = sUrl !== null;
  const hasRoturToken = !!token.value;

  const server = servers.value.find((s) => s.url === sUrl);
  const serverName = server?.name || sUrl || "this server";

  useEffect(() => {
    if (isOpen && !error) {
      crackedAuthLoading.value = false;
      setView(hasRoturToken ? "choice" : "form");
    }
  }, [isOpen, error, hasRoturToken]);

  const handleClose = () => {
    showCrackedAuthModal.value = null;
    crackedAuthError.value = null;
    crackedAuthLoading.value = false;
    pendingCrackedCredentials.value = null;
    setUsername("");
    setPassword("");
    setMode("login");
    setView("choice");
  };

  const handleUseRoturAccount = () => {
    if (sUrl) {
      authenticateServer(sUrl);
      handleClose();
    }
  };

  const handleCreateCrackedAccount = () => {
    setView("form");
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!sUrl || !username.trim() || !password) return;

    crackedAuthLoading.value = true;
    crackedAuthError.value = null;

    pendingCrackedCredentials.value = {
      serverUrl: sUrl,
      username: username.trim().toLowerCase(),
      password,
    };

    const cmd = mode === "register" ? "register" : "login";
    wsSend(
      {
        cmd,
        username: username.trim().toLowerCase(),
        password,
      },
      sUrl,
    );
  };

  if (!isOpen) return null;

  if (view === "choice" && hasRoturToken) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Server Authentication"
      >
        <div className="cracked-auth-modal">
          <div className="cracked-auth-warning">
            <Icon name="Info" size={20} />
            <div className="cracked-auth-warning-content">
              <strong>{serverName} supports cracked authentication</strong>
              <p>
                You can continue with your Rotur account for full access, or
                create a server-specific account for this server only.
              </p>
            </div>
          </div>

          <div className="cracked-auth-choice-options">
            <button
              className="cracked-auth-choice-btn primary"
              onClick={handleUseRoturAccount}
            >
              <div className="cracked-auth-choice-icon">
                <Icon name="User" size={20} />
              </div>
              <div className="cracked-auth-choice-content">
                <div className="cracked-auth-choice-title">
                  Use Rotur Account
                </div>
                <div className="cracked-auth-choice-desc">
                  Continue with your existing Rotur identity
                </div>
              </div>
            </button>

            <button
              className="cracked-auth-choice-btn secondary"
              onClick={handleCreateCrackedAccount}
            >
              <div className="cracked-auth-choice-icon">
                <Icon name="Server" size={20} />
              </div>
              <div className="cracked-auth-choice-content">
                <div className="cracked-auth-choice-title">
                  Create Server Account
                </div>
                <div className="cracked-auth-choice-desc">
                  Account specific to this server only
                </div>
              </div>
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Cracked Authentication">
      <div className="cracked-auth-modal">
        {hasRoturToken && (
          <button
            className="cracked-auth-back-btn"
            onClick={() => setView("choice")}
          >
            <Icon name="ArrowLeft" size={16} />
            <span>Back</span>
          </button>
        )}

        <div className="cracked-auth-warning">
          <Icon name="AlertTriangle" size={20} />
          <div className="cracked-auth-warning-content">
            <strong>Server Account</strong>
            <p>
              {serverName} uses cracked authentication. This account is specific
              to this server and won't sync between devices.
            </p>
          </div>
        </div>

        <div className="cracked-auth-tabs">
          <button
            className={`cracked-auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            className={`cracked-auth-tab ${mode === "register" ? "active" : ""}`}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <form className="cracked-auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="cracked-username">Username</label>
            <input
              id="cracked-username"
              type="text"
              className="input"
              placeholder="Enter username"
              value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
              disabled={loading}
              minLength={2}
              maxLength={32}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="cracked-password">Password</label>
            <input
              id="cracked-password"
              type="password"
              className="input"
              placeholder="Enter password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              disabled={loading}
              minLength={4}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </div>

          {error && (
            <div className="cracked-auth-error">
              <Icon name="AlertCircle" size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !username.trim() || !password}
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Login"
                  : "Register"}
            </button>
          </div>
        </form>

        <p className="cracked-auth-note">
          {mode === "register"
            ? "Username: 2-32 chars, alphanumeric/hyphens/underscores. Password: min 4 chars."
            : "Don't have an account? Switch to Register."}
        </p>
      </div>
    </Modal>
  );
}
