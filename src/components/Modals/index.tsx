import { useEffect, useState, useRef } from "preact/hooks";
import {
  showSettingsModal,
  showAccountModal,
  showDiscoveryModal,
  showServerSettingsModal,
  showNotificationPrompt,
} from "../../lib/ui-signals";
import { notificationPromptDismissed, servers } from "../../state";
import { connectToServer } from "../../lib/websocket";
import { enablePushForServer } from "../../lib/auth";
import { UserAvatar } from "../UserAvatar";
import {
  serverUrl,
  usersByServer,
  currentUser,
  sendTypingIndicators,
  DM_SERVER_URL,
  currentUserByServer,
  pingSound,
  pingVolume,
  customPingSound,
  dmMessageSound,
  blockedMessageDisplay,
  appTheme,
  appFont,
  hideScrollbars,
  hideAvatarBorders,
  reduceMotion,
  avatarShape,
  bubbleRadius,
  accentColor,
  pingHighlightColor,
  messageFontSize,
  compactMode,
  showTimestamps,
  showEditedIndicator,
  maxInlineImageWidth,
  useSystemEmojis,
  micThreshold,
  voiceVideoRes,
  voiceVideoFps,
  roturFollowing,
  channelsByServer,
  serverNotifSettings,
  channelNotifSettings,
  type NotificationLevel,
  type PingSoundType,
  type BlockedMessageDisplay,
  type AppTheme,
  type AppFont,
  type AvatarShape,
  autoIdleOnUnfocus,
} from "../../state";
import { Icon, ServerIcon } from "../Icon";
import { Checkbox } from "../Checkbox";
import { LoadingButton } from "../LoadingButton";
import { showUIError, showInfo } from "../../lib/ui-signals";
import { getCharacterCountColor } from "../../lib/validation";
import { switchServer, logout, selectDiscoveryChannel } from "../../lib/actions";
import type { RoturAccount, RoturProfile } from "../../types";
import { avatarUrl, isCrackedAccount } from "../../utils";
import { formatJoinDate } from "../../lib/date-utils";
import { wsSend } from "../../lib/ws-sender";
import { getUserStatus, getUserRoles } from "../UserProfile";
import {
  getMediaServers,
  addMediaServer,
  deleteMediaServer,
  setMediaServerEnabled,
  generateServerId,
} from "../../lib/media-uploader";
import type { MediaServer } from "../../types";
import {
  getProfile,
  updateProfile,
  claimDaily,
  getClaimTime,
  followUser,
  unfollowUser,
  getStanding,
} from "../../lib/rotur-api";
import { toggleFollowUser } from "../../lib/follow";

interface DiscoveryServer {
  name: string;
  url: string;
  icon: string | null;
  description?: string;
}

type SettingsTab =
  | "profile"
  | "account"
  | "standing"
  | "appearance"
  | "notifications"
  | "chat"
  | "voice"
  | "media"
  | "privacy";

export function SettingsModal() {
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [profile, setProfile] = useState<RoturAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  // On mobile: true = show nav list, false = show content pane
  const [mobileShowNav, setMobileShowNav] = useState(true);

  const [bio, setBio] = useState("");
  const [pronouns, setPronouns] = useState("");

  // Account tab — Daily claim
  const [dailyClaiming, setDailyClaiming] = useState(false);
  const [dailyMsg, setDailyMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser.value?.username) return;
    getProfile(currentUser.value.username, false)
      .then((data) => {
        setProfile(data);
        setBio(data.bio || "");
        setPronouns(data.pronouns || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateField = async (key: string, value: string) => {
    setSaving(true);
    setSaveMsg("");
    try {
      const user = currentUser.value;
      const isCracked = user && isCrackedAccount(user.username);

      if (isCracked && key === "pfp") {
        wsSend({ cmd: "pfp_set", url: value }, serverUrl.value);
        setSaveMsg("Saved!");
        showInfo("Profile picture updated", { autoDismissMs: 2000 });
        if (user?.username) {
          const currentUserInServer = currentUserByServer.read(serverUrl.value);
          if (currentUserInServer) {
            currentUserInServer.pfp = value;
            currentUserByServer.update(serverUrl.value, (u) => (u ? { ...u } : u));
          }
          if (profile) {
            setProfile({ ...profile, pfp: value });
          }
        }
        setTimeout(() => setSaveMsg(""), 2000);
      } else {
        const data = await updateProfile(key, value);
        if (data.error) {
          setSaveMsg(data.error);
        } else {
          setSaveMsg("Saved!");
          showInfo("Profile saved successfully", { autoDismissMs: 2000 });
          setTimeout(() => setSaveMsg(""), 2000);
        }
      }
    } catch (e: any) {
      setSaveMsg(e.message || "Network error");
      showUIError(e, "Failed to save profile changes", { autoDismissMs: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (key: "pfp" | "banner", file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUri = reader.result as string;
      await updateField(key, dataUri);
      if (currentUser.value?.username) {
        const data = await getProfile(currentUser.value.username, false);
        setProfile(data);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClaimDaily = async () => {
    setDailyClaiming(true);
    setDailyMsg("");
    try {
      const data = await claimDaily();
      const earned = data.amount ?? data.credits ?? "";
      setDailyMsg(earned ? `Claimed ${earned} RC!` : "Claimed!");
      // Update credits locally from the response rather than re-fetching the profile.
      if (earned && profile) {
        setProfile({
          ...profile,
          currency: (profile.currency || 0) + Number(earned),
        });
      }
    } catch (e: any) {
      // Try to get time remaining
      try {
        const ct = await getClaimTime();
        const hrs = ct.hours ?? ct.time_remaining_hours ?? null;
        setDailyMsg(hrs !== null ? `Next claim in ${hrs}h` : e.message || "Already claimed today");
      } catch {
        setDailyMsg(e.message || "Already claimed today");
      }
    } finally {
      setDailyClaiming(false);
      setTimeout(() => setDailyMsg(""), 5000);
    }
  };

  return (
    <div
      className="server-settings-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) showSettingsModal.value = false;
      }}
    >
      <div className={`server-settings-modal${mobileShowNav ? " mobile-show-nav" : ""}`}>
        <div className="server-settings-sidebar">
          <div className="server-settings-header">
            <div className="server-settings-icon user-settings-icon">
              {profile?.pfp ? (
                <img src={profile.pfp} alt="" />
              ) : currentUser.value?.username ? (
                <UserAvatar username={currentUser.value.username} alt="" />
              ) : (
                <Icon name="User" size={20} />
              )}
            </div>
            <div className="server-settings-title">
              <div className="server-settings-name">{currentUser.value?.username || "User"}</div>
              <div className="server-settings-url">User Settings</div>
            </div>
            <button
              className="server-settings-close settings-mobile-close"
              onClick={() => (showSettingsModal.value = false)}
            >
              <Icon name="X" size={20} />
            </button>
          </div>
          <nav className="server-settings-nav">
            {/* Desktop section labels — hidden on mobile */}
            <div className="settings-nav-section-label settings-nav-label-desktop">User</div>
            <button
              className={`server-nav-item ${tab === "profile" ? "active" : ""}`}
              onClick={() => {
                setTab("profile");
                setMobileShowNav(false);
                if (contentRef.current) contentRef.current.scrollTop = 0;
              }}
            >
              <Icon name="User" size={16} />
              <span>My Profile</span>
              <span className="settings-nav-chevron">
                <Icon name="ChevronRight" size={16} />
              </span>
            </button>
            <button
              className={`server-nav-item ${tab === "account" ? "active" : ""}`}
              onClick={() => {
                setTab("account");
                setMobileShowNav(false);
                if (contentRef.current) contentRef.current.scrollTop = 0;
              }}
            >
              <Icon name="Shield" size={16} />
              <span>Account</span>
              <span className="settings-nav-chevron">
                <Icon name="ChevronRight" size={16} />
              </span>
            </button>
            <button
              className={`server-nav-item ${tab === "standing" ? "active" : ""}`}
              onClick={() => {
                setTab("standing");
                setMobileShowNav(false);
                if (contentRef.current) contentRef.current.scrollTop = 0;
              }}
            >
              <Icon name="BadgeCheck" size={16} />
              <span>Standing</span>
              <span className="settings-nav-chevron">
                <Icon name="ChevronRight" size={16} />
              </span>
            </button>
            <button
              className={`server-nav-item ${tab === "privacy" ? "active" : ""}`}
              onClick={() => {
                setTab("privacy");
                setMobileShowNav(false);
                if (contentRef.current) contentRef.current.scrollTop = 0;
              }}
            >
              <Icon name="EyeOff" size={16} />
              <span>Privacy</span>
              <span className="settings-nav-chevron">
                <Icon name="ChevronRight" size={16} />
              </span>
            </button>

            <div className="settings-nav-divider" />
            <div className="settings-nav-section-label">App</div>
            <button
              className={`server-nav-item ${tab === "appearance" ? "active" : ""}`}
              onClick={() => {
                setTab("appearance");
                setMobileShowNav(false);
                if (contentRef.current) contentRef.current.scrollTop = 0;
              }}
            >
              <Icon name="Palette" size={16} />
              <span>Appearance</span>
              <span className="settings-nav-chevron">
                <Icon name="ChevronRight" size={16} />
              </span>
            </button>
            <button
              className={`server-nav-item ${tab === "notifications" ? "active" : ""}`}
              onClick={() => {
                setTab("notifications");
                setMobileShowNav(false);
                if (contentRef.current) contentRef.current.scrollTop = 0;
              }}
            >
              <Icon name="Bell" size={16} />
              <span>Notifications</span>
              <span className="settings-nav-chevron">
                <Icon name="ChevronRight" size={16} />
              </span>
            </button>
            <button
              className={`server-nav-item ${tab === "chat" ? "active" : ""}`}
              onClick={() => {
                setTab("chat");
                setMobileShowNav(false);
                if (contentRef.current) contentRef.current.scrollTop = 0;
              }}
            >
              <Icon name="MessageSquare" size={16} />
              <span>Chat</span>
              <span className="settings-nav-chevron">
                <Icon name="ChevronRight" size={16} />
              </span>
            </button>
            <button
              className={`server-nav-item ${tab === "voice" ? "active" : ""}`}
              onClick={() => {
                setTab("voice");
                setMobileShowNav(false);
                if (contentRef.current) contentRef.current.scrollTop = 0;
              }}
            >
              <Icon name="Mic" size={16} />
              <span>Voice &amp; Video</span>
              <span className="settings-nav-chevron">
                <Icon name="ChevronRight" size={16} />
              </span>
            </button>

            <div className="settings-nav-divider" />
            <div className="settings-nav-section-label">Advanced</div>
            <button
              className={`server-nav-item ${tab === "media" ? "active" : ""}`}
              onClick={() => {
                setTab("media");
                setMobileShowNav(false);
                if (contentRef.current) contentRef.current.scrollTop = 0;
              }}
            >
              <Icon name="Upload" size={16} />
              <span>Media Servers</span>
              <span className="settings-nav-chevron">
                <Icon name="ChevronRight" size={16} />
              </span>
            </button>

            <div style={{ flex: 1 }} />
            <div className="settings-nav-divider" />
            <button className="server-nav-item danger-nav" onClick={logout}>
              <Icon name="LogOut" size={16} />
              <span>Log Out</span>
            </button>
          </nav>
        </div>
        <div className="server-settings-content" ref={contentRef}>
          <div className="server-settings-content-header">
            <button
              className="server-settings-back settings-mobile-back"
              onClick={() => setMobileShowNav(true)}
              aria-label="Back to settings menu"
            >
              <Icon name="ChevronLeft" size={20} />
            </button>
            <h2>
              {tab === "profile"
                ? "My Profile"
                : tab === "account"
                  ? "Account"
                  : tab === "standing"
                    ? "Standing"
                    : tab === "privacy"
                      ? "Privacy"
                      : tab === "appearance"
                        ? "Appearance"
                        : tab === "notifications"
                          ? "Notifications"
                          : tab === "chat"
                            ? "Chat"
                            : tab === "voice"
                              ? "Voice & Video"
                              : tab === "media"
                                ? "Media Servers"
                                : "Settings"}
            </h2>
            <button
              className="server-settings-close"
              onClick={() => (showSettingsModal.value = false)}
            >
              <Icon name="X" size={20} />
            </button>
          </div>

          {loading ? (
            <div
              className="server-section-body"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div className="account-loading">
                <div className="account-loading-spinner"></div>
                <div>Loading...</div>
              </div>
            </div>
          ) : tab === "profile" ? (
            <div className="server-section-body">
              <div className="user-settings-preview">
                <div
                  className="user-settings-banner"
                  onClick={() => bannerInputRef.current?.click()}
                >
                  {profile?.banner && <img src={profile.banner} alt="" />}
                  <div className="user-settings-banner-overlay">
                    <Icon name="Camera" size={20} />
                    <span>Change Banner</span>
                  </div>
                </div>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e: any) => {
                    if (e.target.files?.[0]) handleImageUpload("banner", e.target.files[0]);
                  }}
                />
                <div className="user-settings-avatar-area">
                  <div
                    className="user-settings-avatar"
                    onClick={() => {
                      const user = currentUser.value;
                      const isCracked = user && isCrackedAccount(user.username);
                      if (!isCracked) {
                        fileInputRef.current?.click();
                      }
                    }}
                    style={
                      currentUser.value && isCrackedAccount(currentUser.value.username)
                        ? { cursor: "default" }
                        : {}
                    }
                  >
                    <UserAvatar
                      username={currentUser.value?.username || ""}
                      pfp={profile?.pfp}
                      alt=""
                    />
                    {!(currentUser.value && isCrackedAccount(currentUser.value.username)) && (
                      <div className="user-settings-avatar-overlay">
                        <Icon name="Camera" size={16} />
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e: any) => {
                      if (e.target.files?.[0]) handleImageUpload("pfp", e.target.files[0]);
                    }}
                  />
                  <div className="user-settings-name-area">
                    <div className="user-settings-display-name">{profile?.username}</div>
                    {profile?.pronouns && (
                      <div className="user-settings-pronouns">{profile.pronouns}</div>
                    )}
                  </div>
                </div>
                {currentUser.value && isCrackedAccount(currentUser.value.username) && (
                  <div className="settings-field" style={{ marginTop: "12px" }}>
                    <label>Profile Picture URL</label>
                    <input
                      type="text"
                      className="settings-input"
                      placeholder="https://example.com/avatar.png"
                      value={profile?.pfp || ""}
                      onInput={(e: any) => {
                        const value = e.target.value;
                        if (profile) {
                          setProfile({ ...profile, pfp: value });
                        }
                      }}
                      onBlur={(e: any) => {
                        const value = e.target.value;
                        if (value) {
                          updateField("pfp", value);
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="settings-field">
                <label>Bio</label>
                <textarea
                  className="settings-textarea"
                  value={bio}
                  onInput={(e) => setBio((e.target as HTMLTextAreaElement).value)}
                  placeholder="Tell the world about yourself..."
                  rows={3}
                  maxLength={1000}
                />
                <div className="settings-field-footer">
                  <span
                    className="settings-char-count"
                    style={{ color: getCharacterCountColor(bio.length, 1000) }}
                  >
                    {bio.length}/1000
                  </span>
                  <LoadingButton
                    isLoading={saving}
                    onClick={() => updateField("bio", bio)}
                    className="settings-btn-confirm"
                  >
                    Save Bio
                  </LoadingButton>
                </div>
              </div>

              <div className="settings-field">
                <label>Pronouns</label>
                <input
                  type="text"
                  value={pronouns}
                  onInput={(e) => setPronouns((e.target as HTMLInputElement).value)}
                  placeholder="e.g. they/them, she/her, he/him"
                />
                <div className="settings-field-footer">
                  <span></span>
                  <LoadingButton
                    isLoading={saving}
                    onClick={() => updateField("pronouns", pronouns)}
                    className="settings-btn-confirm"
                  >
                    Save Pronouns
                  </LoadingButton>
                </div>
              </div>

              {saveMsg && (
                <div className={`settings-save-msg ${saveMsg === "Saved!" ? "success" : "error"}`}>
                  {saveMsg}
                </div>
              )}
            </div>
          ) : tab === "account" ? (
            <div className="server-section-body">
              <div className="settings-field">
                <label>Username</label>
                <div className="settings-value">{currentUser.value?.username}</div>
              </div>
              <div className="settings-field">
                <label>Subscription</label>
                <div className="settings-value">{profile?.subscription || "Free"}</div>
              </div>
              <div className="settings-field">
                <label>Credits (RC)</label>
                <div className="settings-value account-credits-row">
                  <span>{profile?.currency?.toLocaleString() || "0"} RC</span>
                  <LoadingButton
                    isLoading={dailyClaiming}
                    onClick={handleClaimDaily}
                    className="settings-btn-confirm"
                    title="Claim your daily RC reward"
                  >
                    <Icon name="Gift" size={14} />
                    Claim Daily
                  </LoadingButton>
                </div>
                {dailyMsg && (
                  <div
                    className={`settings-save-msg ${dailyMsg.includes("!") ? "success" : "error"}`}
                  >
                    {dailyMsg}
                  </div>
                )}
              </div>
              <div className="settings-field">
                <label>Member Since</label>
                <div className="settings-value">
                  {profile?.created ? formatJoinDate(profile.created) : "-"}
                </div>
              </div>
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  marginTop: 24,
                  paddingTop: 24,
                }}
              >
                <h3
                  style={{
                    color: "var(--danger)",
                    fontSize: 16,
                    marginBottom: 12,
                  }}
                >
                  Danger Zone
                </h3>
                <button className="settings-danger-btn" onClick={logout}>
                  <Icon name="LogOut" size={16} />
                  Log Out
                </button>
              </div>
            </div>
          ) : tab === "standing" ? (
            <StandingTab />
          ) : tab === "media" ? (
            <MediaServersTab />
          ) : tab === "appearance" ? (
            <AppearanceTab />
          ) : tab === "notifications" ? (
            <NotificationsTab />
          ) : tab === "chat" ? (
            <ChatTab />
          ) : tab === "voice" ? (
            <VoiceTab />
          ) : tab === "privacy" ? (
            <div className="server-section-body">
              <div className="settings-field">
                <label>Messaging</label>
                <div className="appearance-toggles">
                  <Checkbox
                    checked={sendTypingIndicators.value}
                    onChange={(v) => {
                      sendTypingIndicators.value = v;
                    }}
                    icon="Keyboard"
                    label="Send typing indicators"
                    description="Let others see when you are typing a message"
                  />
                </div>
              </div>
              <div className="settings-field">
                <label>Status</label>
                <div className="appearance-toggles">
                  <Checkbox
                    checked={autoIdleOnUnfocus.value}
                    onChange={(v) => {
                      autoIdleOnUnfocus.value = v;
                    }}
                    icon="Moon"
                    label="Set status to idle when unfocused"
                    description="Automatically switch to idle when you switch tabs, and back to online when you return"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MediaServersTab() {
  const [serversList, setServersList] = useState<MediaServer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [serverType, setServerType] = useState<"rotur" | "custom">("rotur");

  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formUploadUrl, setFormUploadUrl] = useState("");
  const [formMethod, setFormMethod] = useState("POST");
  const [formFileParam, setFormFileParam] = useState("");
  const [formResponsePath, setFormResponsePath] = useState("");
  const [formUrlTemplate, setFormUrlTemplate] = useState("");
  const [formRequiresAuth, setFormRequiresAuth] = useState(false);
  const [formAuthType, setFormAuthType] = useState<"session" | "token" | "apiKey">("session");
  const [formApiKey, setFormApiKey] = useState("");
  const [formHeaders, setFormHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [formSaving, setFormSaving] = useState(false);

  const refresh = () => setServersList(getMediaServers());

  const openAddForm = () => {
    setEditing(null);
    setServerType("rotur");
    setFormName("roturPhotos");
    setFormUrl("https://photos.rotur.dev");
    setFormUploadUrl("");
    setFormMethod("POST");
    setFormFileParam("");
    setFormResponsePath("");
    setFormUrlTemplate("");
    setFormRequiresAuth(false);
    setFormAuthType("session");
    setFormApiKey("");
    setFormHeaders([]);
    setShowForm(true);
  };

  const openEditForm = (server: MediaServer) => {
    setEditing(server.id);
    const isRotur =
      server.id === "roturphotos" ||
      (server.uploadUrl.includes("photos.") &&
        server.responseUrlPath === "$.path" &&
        server.authType === "session");
    setServerType(isRotur ? "rotur" : "custom");

    if (isRotur) {
      const baseUrl = server.uploadUrl.replace("/api/image/upload", "").replace(/\/$/, "");
      setFormUrl(baseUrl || "https://photos.rotur.dev");
      setFormName(server.name);
    } else {
      setFormName(server.name);
      setFormUploadUrl(server.uploadUrl);
      setFormMethod(server.method || "POST");
      setFormFileParam(server.fileParamName || "");
      setFormResponsePath(server.responseUrlPath || "");
      setFormUrlTemplate(server.urlTemplate || "");
      setFormRequiresAuth(server.requiresAuth);
      setFormAuthType(server.authType || "session");
      setFormApiKey(server.apiKey || "");
      setFormHeaders(server.headers || []);
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    setFormSaving(true);
    let config: MediaServer;

    if (serverType === "rotur") {
      const baseUrl = formUrl.replace(/\/$/, "");
      config = {
        id: editing || "roturphotos",
        name: formName || "roturPhotos",
        enabled: true,
        uploadUrl: `${baseUrl}/api/image/upload`,
        method: "POST",
        headers: [],
        bodyParams: [],
        responseUrlPath: "$.path",
        urlTemplate: `${baseUrl}/{id}`,
        requiresAuth: true,
        authType: "session",
      };
    } else {
      config = {
        id: editing || generateServerId(),
        name: formName,
        enabled: !editing,
        uploadUrl: formUploadUrl,
        method: formMethod,
        fileParamName: formFileParam || undefined,
        headers: formHeaders.filter((h) => h.key),
        bodyParams: [],
        responseUrlPath: formResponsePath,
        urlTemplate: formUrlTemplate,
        requiresAuth: formRequiresAuth,
        authType: formAuthType,
        apiKey: formApiKey || undefined,
      };
    }

    try {
      await addMediaServer(config);
      refresh();
      setShowForm(false);
    } catch (e) {
      console.error("Failed to save media server:", e);
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    if (id === "roturphotos") return;
    deleteMediaServer(id).then(refresh);
  };

  const handleToggle = (id: string, enabled: boolean) => {
    setMediaServerEnabled(id, enabled).then(refresh);
  };

  const addHeader = () => {
    setFormHeaders([...formHeaders, { key: "", value: "" }]);
  };

  const updateHeader = (index: number, field: "key" | "value", val: string) => {
    const updated = [...formHeaders];
    updated[index] = { ...updated[index], [field]: val };
    setFormHeaders(updated);
  };

  const removeHeader = (index: number) => {
    setFormHeaders(formHeaders.filter((_, i) => i !== index));
  };

  if (showForm) {
    return (
      <div className="server-section-body">
        <h3 style={{ marginBottom: 16 }}>{editing ? "Edit Server" : "Add Server"}</h3>

        <div className="settings-field">
          <label>Server Type</label>
          <select
            className="settings-input"
            value={serverType}
            onChange={(e) => setServerType((e.target as HTMLSelectElement).value as any)}
          >
            <option value="rotur">roturPhotos</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {serverType === "rotur" ? (
          <>
            <div className="settings-field">
              <label>Server URL</label>
              <input
                className="settings-input"
                type="text"
                value={formUrl}
                onInput={(e) => setFormUrl((e.target as HTMLInputElement).value)}
                placeholder="https://photos.rotur.dev"
              />
            </div>
            <div className="settings-field">
              <label>Display Name</label>
              <input
                className="settings-input"
                type="text"
                value={formName}
                onInput={(e) => setFormName((e.target as HTMLInputElement).value)}
                placeholder="roturPhotos"
              />
            </div>
          </>
        ) : (
          <>
            <div className="settings-field">
              <label>Name</label>
              <input
                className="settings-input"
                type="text"
                value={formName}
                onInput={(e) => setFormName((e.target as HTMLInputElement).value)}
                placeholder="e.g., Imgur"
              />
            </div>
            <div className="settings-field">
              <label>Upload URL</label>
              <input
                className="settings-input"
                type="text"
                value={formUploadUrl}
                onInput={(e) => setFormUploadUrl((e.target as HTMLInputElement).value)}
                placeholder="https://api.example.com/upload"
              />
            </div>
            <div className="settings-field">
              <label>HTTP Method</label>
              <select
                className="settings-input"
                value={formMethod}
                onChange={(e) => setFormMethod((e.target as HTMLSelectElement).value)}
              >
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div className="settings-field">
              <label>File Parameter Name</label>
              <input
                className="settings-input"
                type="text"
                value={formFileParam}
                onInput={(e) => setFormFileParam((e.target as HTMLInputElement).value)}
                placeholder="Leave empty for raw body"
              />
            </div>
            <div className="settings-field">
              <label>Response URL Path</label>
              <input
                className="settings-input"
                type="text"
                value={formResponsePath}
                onInput={(e) => setFormResponsePath((e.target as HTMLInputElement).value)}
                placeholder="$.data.link"
              />
            </div>
            <div className="settings-field">
              <label>URL Template</label>
              <input
                className="settings-input"
                type="text"
                value={formUrlTemplate}
                onInput={(e) => setFormUrlTemplate((e.target as HTMLInputElement).value)}
                placeholder="https://example.com/{id}"
              />
              <small style={{ color: "var(--text-dim)", fontSize: 12 }}>
                Placeholders: {"{id}"}, {"{url}"}, {"{username}"}, {"{name}"}, {"{timestamp}"}
              </small>
            </div>
            <div className="settings-field">
              <label>Requires Authentication</label>
              <select
                className="settings-input"
                value={formRequiresAuth ? "yes" : "no"}
                onChange={(e) =>
                  setFormRequiresAuth((e.target as HTMLSelectElement).value === "yes")
                }
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            {formRequiresAuth && (
              <>
                <div className="settings-field">
                  <label>Auth Type</label>
                  <select
                    className="settings-input"
                    value={formAuthType}
                    onChange={(e) => setFormAuthType((e.target as HTMLSelectElement).value as any)}
                  >
                    <option value="session">Session Cookie</option>
                    <option value="token">Bearer Token</option>
                    <option value="apiKey">API Key</option>
                  </select>
                </div>
                {formAuthType !== "session" && (
                  <div className="settings-field">
                    <label>{formAuthType === "token" ? "Bearer Token" : "API Key"}</label>
                    <input
                      className="settings-input"
                      type="password"
                      value={formApiKey}
                      onInput={(e) => setFormApiKey((e.target as HTMLInputElement).value)}
                      placeholder="Enter your key..."
                    />
                  </div>
                )}
              </>
            )}
            <div className="settings-field">
              <label>Custom Headers</label>
              {formHeaders.map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    className="settings-input"
                    type="text"
                    value={h.key}
                    onInput={(e) => updateHeader(i, "key", (e.target as HTMLInputElement).value)}
                    placeholder="Header name"
                    style={{ flex: 1 }}
                  />
                  <input
                    className="settings-input"
                    type="text"
                    value={h.value}
                    onInput={(e) => updateHeader(i, "value", (e.target as HTMLInputElement).value)}
                    placeholder="Header value"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="settings-danger-btn"
                    onClick={() => removeHeader(i)}
                    style={{ padding: "6px 10px" }}
                  >
                    <Icon name="X" size={14} />
                  </button>
                </div>
              ))}
              <button className="btn btn-secondary" onClick={addHeader} style={{ marginTop: 4 }}>
                <Icon name="Plus" size={14} /> Add Header
              </button>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowForm(false)}
            disabled={formSaving}
          >
            Cancel
          </button>
          <LoadingButton isLoading={formSaving} onClick={handleSave}>
            Save
          </LoadingButton>
        </div>
      </div>
    );
  }

  return (
    <div className="server-section-body">
      <p style={{ color: "var(--text-dim)", marginBottom: 16 }}>
        Configure where your images and media files are uploaded.
      </p>
      <button className="btn btn-primary" onClick={openAddForm} style={{ marginBottom: 16 }}>
        <Icon name="Plus" size={16} /> Add Server
      </button>
      {serversList.map((server) => (
        <div key={server.id} className="server-list-item">
          <div style={{ flex: 1 }}>
            <div className="server-list-name">
              {server.name}
              {server.id === "roturphotos" && (
                <span
                  style={{
                    background: "var(--primary)",
                    borderRadius: 4,
                    color: "white",
                    fontSize: 11,
                    marginLeft: 8,
                    padding: "2px 6px",
                  }}
                >
                  Default
                </span>
              )}
            </div>
            <div className="server-list-url">{server.uploadUrl}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={server.enabled}
              onChange={(e) => handleToggle(server.id, (e.target as HTMLInputElement).checked)}
            />
            <button className="icon-btn" onClick={() => openEditForm(server)} title="Edit">
              <Icon name="Edit3" size={16} />
            </button>
            {server.id !== "roturphotos" && (
              <button
                className="icon-btn"
                onClick={() => handleDelete(server.id)}
                title="Delete"
                style={{ color: "var(--danger)" }}
              >
                <Icon name="Trash2" size={16} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Appearance Tab ───────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: AppTheme; label: string; preview: string[] }[] = [
  { value: "dark", label: "Dark", preview: ["#050505", "#0a0a0c", "#4e5058"] },
  {
    value: "midnight",
    label: "Midnight",
    preview: ["#000000", "#060611", "#5865f2"],
  },
  { value: "dim", label: "Dim", preview: ["#1a1a1f", "#212128", "#5865f2"] },
  {
    value: "light",
    label: "Light",
    preview: ["#f2f3f5", "#ffffff", "#5865f2"],
  },
  {
    value: "amoled",
    label: "AMOLED",
    preview: ["#000000", "#000000", "#5865f2"],
  },
  {
    value: "ocean",
    label: "Ocean",
    preview: ["#040d1a", "#081428", "#00a8fc"],
  },
  {
    value: "forest",
    label: "Forest",
    preview: ["#060d06", "#0a140a", "#3ba55c"],
  },
];

const FONT_OPTIONS: { value: AppFont; label: string; description: string }[] = [
  { value: "default", label: "Default", description: "gg sans / Segoe UI" },
  {
    value: "system",
    label: "System",
    description: "-apple-system / BlinkMacSystemFont",
  },
  {
    value: "geometric",
    label: "Geometric",
    description: "Segoe UI / Roboto",
  },
  { value: "humanist", label: "Humanist", description: "Helvetica Neue" },
  { value: "mono", label: "Monospace", description: "SF Mono / Consolas" },
  { value: "serif", label: "Serif", description: "Georgia" },
];

function AppearanceTab() {
  const currentTheme = appTheme.value;
  const currentFont = appFont.value;
  const currentAvatarShape = avatarShape.value;
  const currentBubbleRadius = bubbleRadius.value;
  const currentAccent = accentColor.value;
  const currentPingHighlight = pingHighlightColor.value;

  const AVATAR_SHAPE_OPTIONS: {
    value: AvatarShape;
    label: string;
    preview: string;
  }[] = [
    { value: "circle", label: "Circle", preview: "50%" },
    { value: "rounded", label: "Rounded", preview: "22%" },
    { value: "square", label: "Square", preview: "6px" },
  ];

  return (
    <div className="server-section-body">
      {/* Theme */}
      <div className="settings-field">
        <label>Theme</label>
        <div className="appearance-theme-grid">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`appearance-theme-card ${currentTheme === opt.value ? "active" : ""}`}
              onClick={() => {
                appTheme.value = opt.value;
              }}
              title={opt.label}
            >
              <div className="appearance-theme-preview" style={{ background: opt.preview[0] }}>
                <div
                  className="appearance-theme-preview-surface"
                  style={{ background: opt.preview[1] }}
                />
                <div
                  className="appearance-theme-preview-accent"
                  style={{ background: opt.preview[2] }}
                />
              </div>
              <span className="appearance-theme-label">{opt.label}</span>
              {currentTheme === opt.value && (
                <span className="appearance-theme-check">
                  <Icon name="Check" size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Accent colour */}
      <div className="settings-field">
        <label>Accent Colour</label>
        <p className="settings-field-hint">
          Overrides the primary colour for buttons and highlights. Leave blank to use the theme
          default.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 8,
          }}
        >
          <input
            type="color"
            value={currentAccent || "#4e5058"}
            style={{
              width: 44,
              height: 36,
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: 0,
            }}
            onInput={(e) => {
              accentColor.value = (e.target as HTMLInputElement).value;
            }}
          />
          <input
            type="text"
            className="settings-input"
            value={currentAccent}
            placeholder="#4e5058"
            style={{ flex: 1 }}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              if (/^#[0-9a-fA-F]{6}$/.test(v) || v === "") accentColor.value = v;
            }}
          />
          {currentAccent && (
            <button
              className="btn btn-secondary"
              style={{ padding: "6px 12px", fontSize: 13 }}
              onClick={() => {
                accentColor.value = "";
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Ping highlight colour */}
      <div className="settings-field">
        <label>Ping Highlight Colour</label>
        <p className="settings-field-hint">
          Colour used to highlight messages that mention or ping you. Leave blank to use the default
          purple.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 8,
          }}
        >
          <input
            type="color"
            value={currentPingHighlight || "#9b87f5"}
            style={{
              width: 44,
              height: 36,
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: 0,
            }}
            onInput={(e) => {
              pingHighlightColor.value = (e.target as HTMLInputElement).value;
            }}
          />
          <input
            type="text"
            className="settings-input"
            value={currentPingHighlight}
            placeholder="#9b87f5"
            style={{ flex: 1 }}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              if (/^#[0-9a-fA-F]{6}$/.test(v) || v === "") pingHighlightColor.value = v;
            }}
          />
          {currentPingHighlight && (
            <button
              className="btn btn-secondary"
              style={{ padding: "6px 12px", fontSize: 13 }}
              onClick={() => {
                pingHighlightColor.value = "";
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Font */}
      <div className="settings-field">
        <label>Font</label>
        <div className="appearance-font-list">
          {FONT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`appearance-font-item ${currentFont === opt.value ? "active" : ""}`}
              onClick={() => {
                appFont.value = opt.value;
              }}
            >
              <div className="appearance-font-item-info">
                <span className="appearance-font-name">{opt.label}</span>
                <span className="appearance-font-desc">{opt.description}</span>
              </div>
              {currentFont === opt.value && <Icon name="Check" size={16} />}
            </button>
          ))}
        </div>
      </div>

      {/* Avatar shape */}
      <div className="settings-field">
        <label>Avatar Shape</label>
        <div className="appearance-avatar-shape-row">
          {AVATAR_SHAPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`appearance-avatar-shape-btn ${currentAvatarShape === opt.value ? "active" : ""}`}
              onClick={() => {
                avatarShape.value = opt.value;
              }}
            >
              <div
                className="appearance-avatar-shape-preview"
                style={{
                  borderRadius: opt.preview,
                  background: "var(--primary)",
                }}
              />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bubble/border radius */}
      <div className="settings-field">
        <label>Corner Radius — {currentBubbleRadius}px</label>
        <input
          type="range"
          min="0"
          max="24"
          step="1"
          value={currentBubbleRadius}
          style={{ width: "100%", marginTop: 8 }}
          onInput={(e) => {
            bubbleRadius.value = parseInt((e.target as HTMLInputElement).value, 10);
          }}
        />
      </div>

      {/* Display tweaks */}
      <div className="settings-field">
        <label>Display</label>
        <div className="appearance-toggles">
          <Checkbox
            checked={hideScrollbars.value}
            onChange={(v) => {
              hideScrollbars.value = v;
            }}
            icon="ScrollText"
            label="Hide scrollbars"
            description="Hide scrollbars throughout the app"
          />
          <Checkbox
            checked={hideAvatarBorders.value}
            onChange={(v) => {
              hideAvatarBorders.value = v;
            }}
            icon="CircleUser"
            label="Hide avatar borders"
            description="Remove borders around user avatars"
          />
          <Checkbox
            checked={reduceMotion.value}
            onChange={(v) => {
              reduceMotion.value = v;
            }}
            icon="Gauge"
            label="Reduce motion"
            description="Shorten or disable animations"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────

const PING_SOUND_OPTIONS: {
  value: PingSoundType;
  label: string;
  description: string;
}[] = [
  {
    value: "default",
    label: "Default",
    description: "Classic 800 Hz sine tone",
  },
  { value: "soft", label: "Soft", description: "Gentle lower-pitched tone" },
  { value: "bell", label: "Bell", description: "Short bell-like chime" },
  { value: "pop", label: "Pop", description: "Quick pop click" },
  { value: "custom", label: "Custom", description: "Your uploaded MP3 file" },
  { value: "none", label: "None", description: "No sound" },
];

const BLOCKED_DISPLAY_OPTIONS: {
  value: BlockedMessageDisplay;
  label: string;
  description: string;
}[] = [
  {
    value: "hide",
    label: "Hide fully",
    description: "Messages from blocked users are not shown at all",
  },
  {
    value: "collapse",
    label: "Hide with button to show",
    description: "Show a collapsed notice you can expand to reveal the message",
  },
  {
    value: "show",
    label: "Show",
    description: "Display messages from blocked users normally",
  },
];

function previewPingSound(type: PingSoundType, volume: number) {
  if (type === "none") return;
  if (type === "custom") {
    const uri = customPingSound.value;
    if (!uri) return;
    try {
      const a = new Audio(uri);
      a.volume = volume;
      a.play().catch(() => {});
    } catch (e) {
      console.warn("Failed to play custom ping sound:", e);
    }
    return;
  }
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    if (type === "default") {
      osc.frequency.value = 800;
      osc.type = "sine";
    } else if (type === "soft") {
      osc.frequency.value = 520;
      osc.type = "sine";
    } else if (type === "bell") {
      osc.frequency.value = 1200;
      osc.type = "triangle";
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    } else if (type === "pop") {
      osc.frequency.value = 600;
      osc.type = "square";
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    }
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + (type === "pop" ? 0.08 : type === "bell" ? 0.6 : 0.4));
  } catch (e) {
    console.warn("Failed to play default ping sound:", e);
  }
}

function StandingTab() {
  const username = currentUser.value?.username;
  const [standing, setStanding] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setError(false);
    getStanding(username)
      .then((data) => {
        setStanding(data?.standing ?? null);
        setLoading(false);
      })
      .catch((e) => {
        showUIError(e, "Failed to load standing information");
        setError(true);
        setLoading(false);
      });
  }, [username]);

  const label = standing?.toLowerCase() ?? "";
  const isGood = label === "good" || label === "excellent";
  const isBad = label === "bad" || label === "poor";
  const isSuspended = label === "suspended" || label === "banned";
  const isNeutral = !isGood && !isBad && !isSuspended;

  return (
    <div className="server-section-body">
      <div className="settings-field">
        <label>Your Rotur Standing</label>
        <p className="settings-field-hint">
          Your standing reflects your account health on Rotur. It affects what you can do across the
          platform.
        </p>
        {loading ? (
          <div className="standing-loading">
            <div className="account-loading-spinner" />
          </div>
        ) : error || !standing ? (
          <div className="standing-error">Could not load standing.</div>
        ) : (
          <div className={`standing-card standing-card-${label}`}>
            <div className="standing-card-badge">
              <Icon
                name={
                  isSuspended
                    ? "ShieldX"
                    : isBad
                      ? "ShieldAlert"
                      : isGood
                        ? "ShieldCheck"
                        : "Shield"
                }
                size={28}
              />
            </div>
            <div className="standing-card-info">
              <div className="standing-card-value">{standing}</div>
              <div className="standing-card-desc">
                {isSuspended
                  ? "Your account has been suspended. Contact Rotur support."
                  : isBad
                    ? "Your account has poor standing. Avoid rule violations to improve."
                    : isGood
                      ? "Your account is in good standing."
                      : "Your account is in normal standing."}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsTab() {
  const currentPing = pingSound.value;
  const currentVolume = pingVolume.value;
  const customUri = customPingSound.value;
  const mp3InputRef = useRef<HTMLInputElement>(null);
  const [notifPermission, setNotifPermission] = useState<
    "granted" | "denied" | "default" | "unknown"
  >("unknown");

  useEffect(() => {
    if ("Notification" in window) {
      setNotifPermission(Notification.permission);
      const check = () => setNotifPermission(Notification.permission);
      navigator.permissions?.query?.({ name: "notifications" }).then((status) => {
        status.onchange = check;
      });
    }
  }, []);

  const handleEnablePush = async () => {
    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    if (permission === "granted") {
      for (const server of servers.value) {
        enablePushForServer(server.url);
      }
    }
  };

  const handleMp3Upload = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      customPingSound.value = reader.result as string;
      pingSound.value = "custom";
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="server-section-body">
      {/* Push notifications permission */}
      {"Notification" in window && notifPermission !== "granted" && (
        <div className="settings-field">
          <label>Push Notifications</label>
          <p className="settings-field-hint">
            {notifPermission === "denied"
              ? "Push notifications are blocked. Enable them in your browser settings to receive alerts when the tab is closed."
              : "Enable push notifications to receive alerts for mentions and DMs even when the tab is closed."}
          </p>
          {notifPermission !== "denied" && (
            <button className="btn btn-primary" onClick={handleEnablePush} style={{ marginTop: 8 }}>
              Enable Push Notifications
            </button>
          )}
        </div>
      )}

      {/* Ping sound */}
      <div className="settings-field">
        <label>Ping Sound</label>
        <div className="notifications-sound-list">
          {PING_SOUND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`notifications-sound-item ${currentPing === opt.value ? "active" : ""}`}
              onClick={() => {
                pingSound.value = opt.value;
                if (opt.value !== "custom" && opt.value !== "none")
                  previewPingSound(opt.value, pingVolume.value);
              }}
            >
              <div className="notifications-sound-info">
                <span className="notifications-sound-name">{opt.label}</span>
                <span className="notifications-sound-desc">{opt.description}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {opt.value !== "none" && opt.value !== "custom" && (
                  <button
                    className="icon-btn"
                    title="Preview"
                    onClick={(e) => {
                      e.stopPropagation();
                      previewPingSound(opt.value, pingVolume.value);
                    }}
                  >
                    <Icon name="Volume2" size={14} />
                  </button>
                )}
                {currentPing === opt.value && <Icon name="Check" size={16} />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom MP3 uploader */}
      <div className="settings-field">
        <label>Custom Sound File</label>
        <p className="settings-field-hint">
          Upload an MP3 or audio file to use as your ping sound.
        </p>
        <div className="custom-ping-row">
          <input
            ref={mp3InputRef}
            type="file"
            accept="audio/*"
            style={{ display: "none" }}
            onInput={handleMp3Upload}
          />
          <button className="btn btn-secondary" onClick={() => mp3InputRef.current?.click()}>
            <Icon name="Upload" size={14} /> {customUri ? "Replace file" : "Upload file"}
          </button>
          {customUri && (
            <>
              <button
                className="icon-btn"
                title="Preview custom sound"
                onClick={() => previewPingSound("custom", pingVolume.value)}
              >
                <Icon name="Volume2" size={16} />
              </button>
              <button
                className="icon-btn"
                title="Remove custom sound"
                style={{ color: "var(--danger)" }}
                onClick={() => {
                  customPingSound.value = null;
                  if (pingSound.value === "custom") pingSound.value = "default";
                }}
              >
                <Icon name="Trash2" size={16} />
              </button>
              <span className="custom-ping-label">Custom sound loaded</span>
            </>
          )}
        </div>
      </div>

      {/* Volume */}
      <div className="settings-field">
        <label>Ping Volume — {Math.round(currentVolume * 100)}%</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={currentVolume}
          style={{ width: "100%", marginTop: 8 }}
          onInput={(e) => {
            pingVolume.value = parseFloat((e.target as HTMLInputElement).value);
          }}
          onMouseUp={() => previewPingSound(pingSound.value, pingVolume.value)}
        />
      </div>

      {/* DM message sound */}
      <div className="settings-field">
        <Checkbox
          checked={dmMessageSound.value}
          onChange={(v) => {
            dmMessageSound.value = v;
          }}
          icon="Volume2"
          label="Play sound for DM messages"
          description="Play the ping sound when you receive a new DM. Pings (@mentions and replies) always play a sound regardless of this setting."
        />
      </div>

      {/* Per-server notification overrides */}
      <div className="settings-field">
        <label>Server Notifications</label>
        <p className="settings-field-hint">
          Override notification level per server. Channel overrides take priority over server
          overrides.
        </p>
        <div className="notif-override-list">
          {servers.value.map((server) => {
            const level: NotificationLevel = serverNotifSettings.value[server.url] ?? "mentions";
            return (
              <div key={server.url} className="notif-override-row">
                <span className="notif-override-name">{server.name}</span>
                <select
                  className="notif-override-select"
                  value={level}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value as NotificationLevel;
                    if (v === "mentions") {
                      const next = { ...serverNotifSettings.value };
                      delete next[server.url];
                      serverNotifSettings.value = next;
                    } else {
                      serverNotifSettings.value = {
                        ...serverNotifSettings.value,
                        [server.url]: v,
                      };
                    }
                    import("../../lib/persistence").then(({ saveNotifSettings }) =>
                      saveNotifSettings().catch(() => {})
                    );
                  }}
                >
                  <option value="all">All Messages</option>
                  <option value="mentions">Mentions Only</option>
                  <option value="none">Mute</option>
                </select>
              </div>
            );
          })}
          {servers.value.length === 0 && <p className="settings-field-hint">No servers joined.</p>}
        </div>
      </div>

      {/* Per-channel notification overrides */}
      <div className="settings-field">
        <label>Channel Overrides</label>
        <p className="settings-field-hint">
          Channels with a custom notification level. Right-click any channel to change its setting.
        </p>
        <div className="notif-override-list">
          {Object.entries(channelNotifSettings.value).map(([key, level]) => {
            const [sUrl, ...channelParts] = key.split(":");
            const channelName = channelParts.join(":");
            const server = servers.value.find((s) => s.url === sUrl);
            const serverName = server?.name ?? sUrl;
            return (
              <div key={key} className="notif-override-row">
                <span className="notif-override-name">
                  <span className="notif-override-server">{serverName}</span>#{channelName}
                </span>
                <select
                  className="notif-override-select"
                  value={level}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value as NotificationLevel;
                    if (v === "mentions") {
                      const next = { ...channelNotifSettings.value };
                      delete next[key];
                      channelNotifSettings.value = next;
                    } else {
                      channelNotifSettings.value = {
                        ...channelNotifSettings.value,
                        [key]: v,
                      };
                    }
                    import("../../lib/persistence").then(({ saveNotifSettings }) =>
                      saveNotifSettings().catch(() => {})
                    );
                  }}
                >
                  <option value="all">All Messages</option>
                  <option value="mentions">Mentions Only (default)</option>
                  <option value="none">Mute</option>
                </select>
                <button
                  className="icon-btn"
                  title="Remove override"
                  onClick={() => {
                    const next = { ...channelNotifSettings.value };
                    delete next[key];
                    channelNotifSettings.value = next;
                    import("../../lib/persistence").then(({ saveNotifSettings }) =>
                      saveNotifSettings().catch(() => {})
                    );
                  }}
                >
                  <Icon name="X" size={14} />
                </button>
              </div>
            );
          })}
          {Object.keys(channelNotifSettings.value).length === 0 && (
            <p className="settings-field-hint">No channel overrides set.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Chat Tab ─────────────────────────────────────────────────────────────────

function ChatTab() {
  const currentBlocked = blockedMessageDisplay.value;
  const currentFontSize = messageFontSize.value;
  const currentImageWidth = maxInlineImageWidth.value;

  return (
    <div className="server-section-body">
      {/* Message font size */}
      <div className="settings-field">
        <label>Message Font Size — {currentFontSize}px</label>
        <input
          type="range"
          min="11"
          max="22"
          step="1"
          value={currentFontSize}
          style={{ width: "100%", marginTop: 8 }}
          onInput={(e) => {
            messageFontSize.value = parseInt((e.target as HTMLInputElement).value, 10);
          }}
        />
      </div>

      {/* Inline image max width */}
      <div className="settings-field">
        <label>Max Inline Image Width — {currentImageWidth}px</label>
        <input
          type="range"
          min="100"
          max="800"
          step="50"
          value={currentImageWidth}
          style={{ width: "100%", marginTop: 8 }}
          onInput={(e) => {
            maxInlineImageWidth.value = parseInt((e.target as HTMLInputElement).value, 10);
          }}
        />
      </div>

      {/* Toggles */}
      <div className="settings-field">
        <label>Display</label>
        <div className="appearance-toggles">
          <Checkbox
            checked={compactMode.value}
            onChange={(v) => {
              compactMode.value = v;
            }}
            icon="AlignJustify"
            label="Compact mode"
            description="Tighter message spacing, smaller avatars"
          />
          <Checkbox
            checked={showTimestamps.value}
            onChange={(v) => {
              showTimestamps.value = v;
            }}
            icon="Clock"
            label="Show timestamps"
            description="Display time on every message"
          />
          <Checkbox
            checked={showEditedIndicator.value}
            onChange={(v) => {
              showEditedIndicator.value = v;
            }}
            icon="Pencil"
            label="Show edited indicator"
            description='Show "(edited)" on modified messages'
          />
          <Checkbox
            checked={useSystemEmojis.value}
            onChange={(v) => {
              useSystemEmojis.value = v;
            }}
            icon="Smile"
            label="Use system emojis"
            description="Render emojis using your OS font instead of Twemoji images"
          />
        </div>
      </div>

      {/* Blocked messages */}
      <div className="settings-field">
        <label>Messages from Blocked Users</label>
        <p className="settings-field-hint">
          Choose how messages from people you've blocked appear in chat.
        </p>
        <div className="notifications-blocked-list">
          {BLOCKED_DISPLAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`notifications-sound-item ${currentBlocked === opt.value ? "active" : ""}`}
              onClick={() => {
                blockedMessageDisplay.value = opt.value;
              }}
            >
              <div className="notifications-sound-info">
                <span className="notifications-sound-name">{opt.label}</span>
                <span className="notifications-sound-desc">{opt.description}</span>
              </div>
              {currentBlocked === opt.value && <Icon name="Check" size={16} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Voice & Video Tab ────────────────────────────────────────────────────────

const VIDEO_RES_OPTIONS = [
  { value: 360, label: "360p", desc: "Low bandwidth" },
  { value: 480, label: "480p", desc: "SD" },
  { value: 720, label: "720p", desc: "HD (default)" },
  { value: 1080, label: "1080p", desc: "Full HD" },
];

const VIDEO_FPS_OPTIONS = [
  { value: 15, label: "15 fps", desc: "Low" },
  { value: 24, label: "24 fps", desc: "Cinematic" },
  { value: 30, label: "30 fps", desc: "Standard (default)" },
  { value: 60, label: "60 fps", desc: "Smooth" },
];

function VoiceTab() {
  const currentThreshold = micThreshold.value;
  const currentRes = voiceVideoRes.value;
  const currentFps = voiceVideoFps.value;

  return (
    <div className="server-section-body">
      {/* Mic sensitivity */}
      <div className="settings-field">
        <label>Microphone Sensitivity — {currentThreshold}</label>
        <p className="settings-field-hint">
          Higher values require louder audio before you're detected as speaking. Lower values are
          more sensitive.
        </p>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={currentThreshold}
          style={{ width: "100%", marginTop: 8 }}
          onInput={(e) => {
            micThreshold.value = parseInt((e.target as HTMLInputElement).value, 10);
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: "var(--text-dim)",
            marginTop: 4,
          }}
        >
          <span>More sensitive</span>
          <span>Less sensitive</span>
        </div>
      </div>

      {/* Video resolution */}
      <div className="settings-field">
        <label>Video Resolution</label>
        <div className="voice-option-grid">
          {VIDEO_RES_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`voice-option-btn ${currentRes === opt.value ? "active" : ""}`}
              onClick={() => {
                voiceVideoRes.value = opt.value;
              }}
            >
              <span className="voice-option-label">{opt.label}</span>
              <span className="voice-option-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Video FPS */}
      <div className="settings-field">
        <label>Video Frame Rate</label>
        <div className="voice-option-grid">
          {VIDEO_FPS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`voice-option-btn ${currentFps === opt.value ? "active" : ""}`}
              onClick={() => {
                voiceVideoFps.value = opt.value;
              }}
            >
              <span className="voice-option-label">{opt.label}</span>
              <span className="voice-option-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AccountModal({ username }: { username: string }) {
  const [profile, setProfile] = useState<RoturProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(() => roturFollowing.value.has(username));
  const [followWorking, setFollowWorking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsFollowing(roturFollowing.value.has(username));
    getProfile(username, false, controller.signal)
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false);
      });
    return () => controller.abort();
  }, [username]);

  const statusClass = getUserStatus(username);
  const userRoles = getUserRoles(username);
  const isCurrentUser = currentUser.value?.username === username;

  const joinedDate = profile?.created ? formatJoinDate(profile.created) : null;

  const handleToggleFollow = async () => {
    setFollowWorking(true);
    try {
      await toggleFollowUser(username, isFollowing, setIsFollowing, setProfile, profile, (e) =>
        showUIError(e, "Failed to update follow status", { autoDismissMs: 3000 })
      );
    } finally {
      setFollowWorking(false);
    }
  };

  return (
    <div id="account-modal" className="account-modal active">
      <div className="account-overlay" onClick={() => (showAccountModal.value = null)}></div>
      <div className="account-card">
        <button className="account-close-btn" onClick={() => (showAccountModal.value = null)}>
          <Icon name="X" />
        </button>
        <div id="account-content">
          {loading ? (
            <div className="account-loading">
              <div className="account-loading-spinner"></div>
              <div>Loading profile...</div>
            </div>
          ) : profile ? (
            <div className="account-profile">
              <div className="account-banner">
                {profile.banner && <img src={profile.banner} alt="Banner" />}
              </div>
              <div className="account-avatar-section">
                <div className="account-avatar">
                  <UserAvatar
                    username={profile.username}
                    pfp={profile.pfp}
                    alt={profile.username}
                  />
                  <div className={`account-status-indicator ${statusClass}`}></div>
                </div>
              </div>
              <div className="account-names-section">
                <div className="account-username-text">{profile.username}</div>
                {profile.pronouns && <div className="account-global-name">{profile.pronouns}</div>}
              </div>
              <div className="account-stats">
                <div className="account-stat">
                  <div className="account-stat-value">{profile.followers || 0}</div>
                  <div className="account-stat-label">Followers</div>
                </div>
                <div className="account-stat">
                  <div className="account-stat-value">{profile.following || 0}</div>
                  <div className="account-stat-label">Following</div>
                </div>
                <div className="account-stat">
                  <div className="account-stat-value">
                    {profile.currency?.toLocaleString() || 0}
                  </div>
                  <div className="account-stat-label">Credits</div>
                </div>
                <div className="account-stat">
                  <div className="account-stat-value">{profile.subscription || "Free"}</div>
                  <div className="account-stat-label">Tier</div>
                </div>
              </div>
              {/* Follow button for other users */}
              {!isCurrentUser && (
                <button
                  className={`account-follow-btn${isFollowing ? " following" : ""}`}
                  onClick={handleToggleFollow}
                  disabled={followWorking}
                >
                  <Icon name={isFollowing ? "UserCheck" : "UserPlus"} size={14} />
                  {isFollowing ? "Following" : "Follow"}
                  {profile.follows_me && (
                    <span className="account-follows-me-pill">Follows you</span>
                  )}
                </button>
              )}
              {userRoles.length > 0 && (
                <div className="account-section">
                  <div className="account-section-title">Roles</div>
                  <div className="account-roles">
                    {userRoles.map((role) => (
                      <span key={role} className="account-role">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {profile.bio && (
                <div className="account-section">
                  <div className="account-section-title">About Me</div>
                  <div className="account-bio">{profile.bio}</div>
                </div>
              )}
              {joinedDate && (
                <div className="account-section">
                  <div className="account-section-title">Member Since</div>
                  <div className="account-meta">
                    <div className="account-meta-item">
                      <Icon name="Calendar" size={16} />
                      <span>{joinedDate}</span>
                    </div>
                  </div>
                </div>
              )}
              {isCurrentUser && (
                <div className="account-section account-actions-section">
                  <button className="account-logout-button" onClick={logout}>
                    <Icon name="LogOut" size={16} />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="account-error">Could not load profile</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DiscoveryModal() {
  const [view, setView] = useState<"home" | "join">("home");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  const close = () => {
    showDiscoveryModal.value = false;
    setView("home");
    setUrl("");
    setError("");
  };

  const handleJoin = async () => {
    const raw = url.trim();
    if (!raw) {
      setError("Please enter a server URL.");
      return;
    }

    const normalized =
      raw.startsWith("wss://") || raw.startsWith("ws://") ? raw.replace(/^wss?:\/\//, "") : raw;

    if (servers.value.some((s) => s.url === normalized)) {
      await switchServer(normalized);
      close();
      return;
    }

    if (normalized === "dms.mistium.com") {
      setError("That server cannot be added.");
      return;
    }

    setJoining(true);
    setError("");
    const newServer = { name: normalized, url: normalized, icon: null };
    const connected = await switchServer(normalized);
    if (!connected) {
      setError("Could not connect to that server.");
      setJoining(false);
      return;
    }
    servers.value = [...servers.value, newServer];
    await (await import("../../lib/persistence")).saveServers();
    close();
  };

  return (
    <div className="discovery-modal" style={{ display: "flex" }}>
      <div className="discovery-overlay" onClick={close} />
      <div className="discovery-container" style={{ maxWidth: 440 }}>
        <button className="discovery-close" onClick={close}>
          <Icon name="X" />
        </button>

        {view === "home" ? (
          <>
            <div className="discovery-header">
              <h2>Add a Server</h2>
              <p>Join an existing server or create your own.</p>
            </div>
            <div
              className="discovery-content"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <button className="discovery-option-btn" onClick={() => setView("join")}>
                <Icon name="LogIn" size={22} />
                <div>
                  <div className="discovery-option-title">Join a Server</div>
                  <div className="discovery-option-desc">Connect using a server URL</div>
                </div>
              </button>
              <button
                className="discovery-option-btn"
                onClick={() => {
                  close();
                  selectDiscoveryChannel();
                }}
              >
                <Icon name="Compass" size={22} />
                <div>
                  <div className="discovery-option-title">Browse Public Servers</div>
                  <div className="discovery-option-desc">Discover and join community servers</div>
                </div>
              </button>
              <button
                className="discovery-option-btn"
                onClick={() => window.open("https://github.com/originChats/server", "_blank")}
              >
                <Icon name="Server" size={22} />
                <div>
                  <div className="discovery-option-title">Create Your Own Server</div>
                  <div className="discovery-option-desc">
                    Host and run your own OriginChats server
                  </div>
                </div>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="discovery-header">
              <button
                className="discovery-back"
                onClick={() => {
                  setView("home");
                  setError("");
                }}
              >
                <Icon name="ArrowLeft" size={16} />
              </button>
              <h2>Join a Server</h2>
              <p>Enter the server's URL to connect.</p>
            </div>
            <div className="discovery-content">
              <div className="settings-field">
                <label>Server URL</label>
                <input
                  className="settings-input"
                  type="text"
                  placeholder="chats.mistium.com"
                  value={url}
                  onInput={(e) => {
                    setUrl((e.target as HTMLInputElement).value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoin();
                  }}
                  autoFocus
                />
                {error && <div className="discovery-error-text">{error}</div>}
              </div>
              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 8 }}
                onClick={() => handleJoin()}
                disabled={joining}
              >
                {joining ? "Connecting…" : "Join Server"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function NotificationPromptModal() {
  if (!showNotificationPrompt.value) return null;

  const handleEnable = async () => {
    showNotificationPrompt.value = false;
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      for (const server of servers.value) {
        enablePushForServer(server.url);
      }
    }
  };

  const handleNo = () => {
    showNotificationPrompt.value = false;
    notificationPromptDismissed.value = true;
  };

  return (
    <div
      className="server-settings-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleNo();
      }}
    >
      <div className="notification-prompt-modal">
        <div className="notification-prompt-icon">
          <Icon name="Bell" size={32} />
        </div>
        <h2 className="notification-prompt-title">Enable notifications for the best experience</h2>
        <p className="notification-prompt-text">
          You'll never miss a message when notifications are enabled. Get instant alerts for
          mentions and direct messages, even when the tab is closed.
        </p>
        <div className="notification-prompt-buttons">
          <button className="btn btn-primary" onClick={handleEnable}>
            Enable Notifications
          </button>
          <button className="btn btn-secondary" onClick={handleNo}>
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}

export { CrackedAuthModal } from "../CrackedAuthModal";
