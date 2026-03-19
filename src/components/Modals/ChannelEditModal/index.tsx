import { useState, useEffect, useRef } from "preact/hooks";
import {
  serverUrl,
  channels,
  usersByServer,
  currentUserByServer,
  rolesByServer,
  serverCapabilitiesByServer,
} from "../../../state";
import {
  showChannelEditModal,
  webhooksByServer,
  webhooksLoading,
  handleError,
  showError,
  showInfo,
} from "../../../lib/ui-signals";
import { wsSend } from "../../../lib/websocket";
import { Icon } from "../../Icon";
import { ConfirmDialog } from "../../Modal";
import type { Role, Channel, Webhook } from "../../../types";
import "./ChannelEditModal.css";

interface ChannelPermissions {
  view: string[];
  send: string[];
  delete: string[];
  delete_own: string[];
  edit_own: string[];
  pin: string[];
  react: string[];
  create_thread: string[];
}

type Tab = "overview" | "permissions" | "webhooks";

export function ChannelEditModal() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<ChannelPermissions>({
    view: [],
    send: [],
    delete: [],
    delete_own: [],
    edit_own: [],
    pin: [],
    react: [],
    create_thread: [],
  });
  const [size, setSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [webhookName, setWebhookName] = useState("");
  const [webhookAvatar, setWebhookAvatar] = useState("");

  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState("");
  const [revealedTokens, setRevealedTokens] = useState<Set<string>>(new Set());

  const sUrl = serverUrl.value;
  const channelName = showChannelEditModal.value;
  const myUsername = currentUserByServer.value[sUrl]?.username?.toLowerCase();
  const myServerUser = usersByServer.value[sUrl]?.[myUsername || ""];
  const isOwner = myServerUser?.roles?.includes("owner");

  const channel = channels.value.find((c) => c.name === channelName);
  const webhooks =
    sUrl && channelName
      ? (webhooksByServer.value[sUrl] || []).filter(
          (w) => w.channel === channelName,
        )
      : [];
  const webhookToken =
    sUrl && channelName
      ? (webhooksByServer.value[sUrl] || []).find(
          (w: Webhook) => w.channel === channelName && w.token,
        )?.token
      : null;

  useEffect(() => {
    if (!channel) return;
    setDisplayName((channel as any).display_name || "");
    setDescription((channel as any).description || "");
    setPermissions({
      view: channel.permissions?.view || [],
      send: channel.permissions?.send || [],
      delete: channel.permissions?.delete || [],
      delete_own: channel.permissions?.delete_own || [],
      edit_own: channel.permissions?.edit_own || [],
      pin: channel.permissions?.pin || [],
      react: channel.permissions?.react || [],
      create_thread: channel.permissions?.create_thread || [],
    });
    setSize((channel as any).size || 20);
  }, [channel]);

  useEffect(() => {
    if (!sUrl || !channelName) return;
    const serverCapabilities = serverCapabilitiesByServer.value[sUrl] || [];
    if (!serverCapabilities.includes("webhook_list")) return;
    webhooksLoading.value = { ...webhooksLoading.value, [sUrl]: true };
    wsSend({ cmd: "webhook_list", channel: channelName }, sUrl);
  }, [sUrl, channelName]);

  const close = () => {
    showChannelEditModal.value = null;
  };

  if (!channel) return null;

  if (!isOwner) {
    showError("Access denied: Only owners can edit channels");
    close();
    return null;
  }

  const handleSaveChannel = () => {
    if (!displayName.trim()) {
      showError("Display name cannot be empty");
      return;
    }
    setLoading(true);
    wsSend(
      {
        cmd: "channel_update",
        current_name: channel.name,
        updates: {
          display_name: displayName.trim(),
          description: description.trim(),
          permissions,
          size: channel.type === "separator" ? size : undefined,
        },
      },
      sUrl,
    );
    setLoading(false);
  };

  const openCreateWebhook = () => {
    setEditingWebhook(null);
    setWebhookName("");
    setWebhookAvatar("");
    setWebhookModalOpen(true);
  };

  const openEditWebhook = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setWebhookName(webhook.name);
    setWebhookAvatar(webhook.avatar || "");
    setWebhookModalOpen(true);
  };

  const handleWebhookSubmit = () => {
    if (!webhookName.trim()) {
      showError("Webhook name cannot be empty");
      return;
    }
    if (editingWebhook) {
      wsSend(
        {
          cmd: "webhook_update",
          id: editingWebhook.id,
          name: webhookName.trim(),
          avatar: webhookAvatar.trim(),
        },
        sUrl,
      );
    } else {
      wsSend(
        {
          cmd: "webhook_create",
          channel: channel.name,
          name: webhookName.trim(),
          avatar: webhookAvatar.trim(),
        },
        sUrl,
      );
    }
    setWebhookModalOpen(false);
  };

  const handleDeleteWebhook = () => {
    if (!showDeleteConfirm) return;
    wsSend({ cmd: "webhook_delete", id: showDeleteConfirm }, sUrl);
    setShowDeleteConfirm("");
  };

  const handleRegenerateToken = () => {
    if (!showRegenerateConfirm) return;
    wsSend({ cmd: "webhook_regenerate", id: showRegenerateConfirm }, sUrl);
    setShowRegenerateConfirm("");
  };

  const copyWebhookUrl = (webhook: Webhook) => {
    const url = `https://${sUrl}/webhooks?token=${webhook.token}`;
    navigator.clipboard.writeText(url);
    showInfo("Webhook URL copied to clipboard");
  };

  const availableRoles = Object.entries(rolesByServer.value[sUrl] || {}).map(
    ([name, role]: [string, Role]) => ({
      ...role,
      name,
    }),
  );

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <div
      className="server-settings-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="server-settings-modal">
        <div className="server-settings-sidebar">
          <div className="server-settings-header">
            <div className="server-settings-icon">
              <Icon name="Hash" size={32} />
            </div>
            <div className="server-settings-title">
              <div className="server-settings-name">
                {(channel as any).display_name || channel.name}
              </div>
              <div className="server-settings-url">{channel.name}</div>
            </div>
          </div>
          <nav className="server-settings-nav">
            {(["overview", "permissions", "webhooks"] as Tab[]).map((tab) => (
              <button
                key={tab}
                className={`server-nav-item ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                <Icon
                  name={
                    tab === "overview"
                      ? "Settings"
                      : tab === "permissions"
                        ? "Lock"
                        : "Globe"
                  }
                  size={16}
                />
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
        <div className="server-settings-content">
          <div className="server-settings-content-header">
            <h2>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h2>
            <button className="server-settings-close" onClick={close}>
              <Icon name="X" size={20} />
            </button>
          </div>

          {activeTab === "overview" && (
            <div className="server-section-body channel-edit-overview">
              <div className="settings-field">
                <label>Channel Name</label>
                <div className="settings-value">{channel.name}</div>
              </div>
              <div className="settings-field">
                <label>Display Name</label>
                <input
                  type="text"
                  className="input"
                  value={displayName}
                  onInput={(e) =>
                    setDisplayName((e.target as HTMLInputElement).value)
                  }
                  placeholder="Enter display name"
                />
              </div>
              <div className="settings-field">
                <label>Description</label>
                <textarea
                  className="input"
                  value={description}
                  onInput={(e) =>
                    setDescription((e.target as HTMLTextAreaElement).value)
                  }
                  placeholder="Enter description"
                  rows={4}
                />
              </div>

              <div className="settings-field">
                <label>Channel Type</label>
                <div className="settings-value">{channel.type}</div>
              </div>

              {channel.type === "separator" && (
                <div className="settings-field">
                  <label>Separator Size</label>
                  <div className="settings-value">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={size}
                      onInput={(e) =>
                        setSize(Number((e.target as HTMLInputElement).value))
                      }
                    />
                    <span style={{ marginLeft: "12px" }}>{size}px</span>
                  </div>
                </div>
              )}

              <div className="settings-dialog-actions">
                <button
                  className="settings-btn-cancel"
                  onClick={close}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  className="settings-btn-confirm"
                  onClick={handleSaveChannel}
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "permissions" && (
            <div className="server-section-body channel-edit-overview">
              <div className="permissions-description">
                <p>
                  Configure which roles can perform specific actions in this
                  channel. Add roles to each permission to grant access.
                </p>
              </div>

              <div className="settings-field">
                <TagInput
                  label="View"
                  description="Roles that can see the channel"
                  values={permissions.view}
                  availableRoles={availableRoles}
                  onChange={(values) =>
                    setPermissions({ ...permissions, view: values })
                  }
                />
                <TagInput
                  label="Send"
                  description="Roles that can send messages"
                  values={permissions.send}
                  availableRoles={availableRoles}
                  onChange={(values) =>
                    setPermissions({ ...permissions, send: values })
                  }
                />
                <TagInput
                  label="Delete"
                  description="Roles that can delete any message"
                  values={permissions.delete}
                  availableRoles={availableRoles}
                  onChange={(values) =>
                    setPermissions({ ...permissions, delete: values })
                  }
                />
                <TagInput
                  label="Delete Own"
                  description="Roles that can delete their own messages (defaults to all if omitted)"
                  values={permissions.delete_own}
                  availableRoles={availableRoles}
                  onChange={(values) =>
                    setPermissions({ ...permissions, delete_own: values })
                  }
                />
                <TagInput
                  label="Edit Own"
                  description="Roles that can edit their own messages (defaults to all if omitted)"
                  values={permissions.edit_own}
                  availableRoles={availableRoles}
                  onChange={(values) =>
                    setPermissions({ ...permissions, edit_own: values })
                  }
                />
                <TagInput
                  label="Pin"
                  description="Roles that can pin messages (defaults to owner only if omitted)"
                  values={permissions.pin}
                  availableRoles={availableRoles}
                  onChange={(values) =>
                    setPermissions({ ...permissions, pin: values })
                  }
                />
                <TagInput
                  label="React"
                  description="Roles that can add/remove reactions to messages"
                  values={permissions.react}
                  availableRoles={availableRoles}
                  onChange={(values) =>
                    setPermissions({ ...permissions, react: values })
                  }
                />
                {channel.type === "forum" && (
                  <TagInput
                    label="Create Thread"
                    description="Roles that can create new threads"
                    values={permissions.create_thread}
                    availableRoles={availableRoles}
                    onChange={(values) =>
                      setPermissions({ ...permissions, create_thread: values })
                    }
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === "webhooks" && (
            <div className="server-section-body">
              <div className="webhook-cards-header">
                <h3>Webhooks</h3>
                <button
                  className="settings-action-btn"
                  onClick={openCreateWebhook}
                >
                  <Icon name="Plus" size={16} /> Create Webhook
                </button>
              </div>
              {webhooks.length === 0 ? (
                <div className="settings-empty">
                  No webhooks configured for this channel
                </div>
              ) : (
                <div className="webhook-list">
                  {webhooks.map((webhook) => (
                    <div key={webhook.id} className="webhook-card">
                      <div className="webhook-card-header">
                        <div className="webhook-card-info">
                          <div className="webhook-card-name">
                            {webhook.name}
                          </div>
                          <div className="webhook-card-meta">
                            Created {formatDate(webhook.created_at)}
                          </div>
                        </div>
                        {webhook.token && (
                          <div className="webhook-token-row">
                            <span className="webhook-token-label">Token:</span>
                            <span className="webhook-token-value">
                              {revealedTokens.has(webhook.id)
                                ? webhook.token
                                : "••••••••••••••••"}
                            </span>
                            <button
                              className="settings-icon-btn"
                              onClick={() => {
                                const newRevealed = new Set(revealedTokens);
                                if (newRevealed.has(webhook.id)) {
                                  newRevealed.delete(webhook.id);
                                } else {
                                  newRevealed.add(webhook.id);
                                }
                                setRevealedTokens(newRevealed);
                              }}
                              title={
                                revealedTokens.has(webhook.id)
                                  ? "Hide"
                                  : "Reveal"
                              }
                            >
                              <Icon
                                name={
                                  revealedTokens.has(webhook.id)
                                    ? "EyeOff"
                                    : "Eye"
                                }
                                size={14}
                              />
                            </button>
                            <button
                              className="settings-icon-btn"
                              onClick={() => copyWebhookUrl(webhook)}
                              title="Copy URL"
                            >
                              <Icon name="Copy" size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="webhook-card-actions">
                        <button
                          className="settings-icon-btn"
                          onClick={() => openEditWebhook(webhook)}
                          title="Edit"
                        >
                          <Icon name="Edit3" size={14} />
                        </button>
                        <button
                          className="settings-icon-btn"
                          onClick={() => copyWebhookUrl(webhook)}
                          title="Copy URL"
                        >
                          <Icon name="Link" size={14} />
                        </button>
                        <button
                          className="settings-icon-btn danger"
                          onClick={() => setShowRegenerateConfirm(webhook.id)}
                          title="Regenerate Token"
                        >
                          <Icon name="RefreshCw" size={14} />
                        </button>
                        <button
                          className="settings-icon-btn danger"
                          onClick={() => setShowDeleteConfirm(webhook.id)}
                          title="Delete"
                        >
                          <Icon name="Trash2" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {webhookModalOpen && (
          <div
            className="settings-inner-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setWebhookModalOpen(false);
            }}
          >
            <div className="settings-inner-dialog">
              <h3>{editingWebhook ? "Edit Webhook" : "Create Webhook"}</h3>
              <div className="settings-field">
                <label>Name</label>
                <input
                  type="text"
                  className="input"
                  value={webhookName}
                  onInput={(e) =>
                    setWebhookName((e.target as HTMLInputElement).value)
                  }
                  placeholder="Webhook name"
                  disabled={!!editingWebhook}
                />
              </div>
              <div className="settings-field">
                <label>Avatar URL</label>
                <input
                  type="text"
                  className="input"
                  value={webhookAvatar}
                  onInput={(e) =>
                    setWebhookAvatar((e.target as HTMLInputElement).value)
                  }
                  placeholder="https://example.com/avatar.png"
                />
              </div>
              {webhookAvatar && (
                <div className="webhook-avatar-preview-container">
                  <img
                    src={webhookAvatar}
                    alt="Webhook avatar"
                    className="webhook-avatar-preview"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
              <div className="settings-dialog-actions">
                <button
                  className="settings-btn-cancel"
                  onClick={() => setWebhookModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="settings-btn-confirm"
                  onClick={handleWebhookSubmit}
                  disabled={!webhookName.trim()}
                >
                  {editingWebhook ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showRegenerateConfirm !== ""}
        onClose={() => setShowRegenerateConfirm("")}
        onConfirm={handleRegenerateToken}
        title="Regenerate Webhook Token"
        message="This will invalidate the current webhook token. External services using the old token will stop working."
        confirmText="Regenerate"
        cancelText="Cancel"
        danger
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm !== ""}
        onClose={() => setShowDeleteConfirm("")}
        onConfirm={handleDeleteWebhook}
        title="Delete Webhook"
        message="This action cannot be undone. External services using this webhook will stop working."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
    </div>
  );
}

interface TagInputProps {
  label: string;
  description?: string;
  values: string[];
  availableRoles: Role[];
  onChange: (values: string[]) => void;
}

function TagInput({
  label,
  description,
  values,
  availableRoles,
  onChange,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredRoles = availableRoles
    .filter(
      (role) =>
        role?.name &&
        role.name.toLowerCase().includes(inputValue.toLowerCase()),
    )
    .filter((role) => !values.includes(role.name));

  const handleAddTag = (roleName: string) => {
    if (!roleName || values.includes(roleName)) return;
    onChange([...values, roleName]);
    setInputValue("");
    setShowSuggestions(false);
  };

  const handleRemoveTag = (roleName: string) => {
    onChange(values.filter((v) => v !== roleName));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredRoles.length === 1) {
        handleAddTag(filteredRoles[0].name);
      } else if (inputValue && !values.includes(inputValue)) {
        handleAddTag(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && values.length > 0) {
      handleRemoveTag(values[values.length - 1]);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="tag-input-wrapper">
      <label>{label}</label>
      {description && (
        <div className="tag-input-description">{description}</div>
      )}
      <div className="tag-input-container" ref={containerRef}>
        {values.map((value) => (
          <span key={value} className="tag">
            {value}
            <span className="tag-remove" onClick={() => handleRemoveTag(value)}>
              <Icon name="X" size={12} />
            </span>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="tag-input"
          value={inputValue}
          onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? "Add roles..." : ""}
        />
        {showSuggestions && availableRoles.length > 0 && (
          <div className="tag-suggestions">
            {filteredRoles.length > 0 ? (
              filteredRoles.map((role) => (
                <div
                  key={role.name}
                  className="tag-suggestion"
                  onClick={() => handleAddTag(role.name)}
                >
                  {role.name}
                </div>
              ))
            ) : (
              <div className="tag-suggestion-empty">
                {inputValue ? "No matching roles" : "All roles already added"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
