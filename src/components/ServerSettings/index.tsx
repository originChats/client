import { useState, useEffect } from "preact/hooks";
import { TwemojiText } from "../TwemojiText";
import {
  serverUrl,
  currentServer,
  users,
  channels,
  rolesByServer,
  currentUser,
  servers,
  customEmojisByServer,
  usersByServer,
} from "../../state";
import {
  showServerSettingsModal,
  showChannelEditModal,
  channelEditFromSettings,
  showInfo,
  showError,
  bannedUsersByServer,
} from "../../lib/ui-signals";
import { wsSend } from "../../lib/websocket";
import { Icon } from "../Icon";
import type { Role, Channel, ServerUser, CustomEmoji } from "../../types";
import { UserAvatar } from "../UserAvatar";
import { avatarUrl } from "../../utils";
import {
  isServerOwner,
  canManageChannels,
  canManageRoles,
  canManageUsers,
  canManageEmojis,
} from "../../lib/permissions";

type Section = "overview" | "channels" | "roles" | "members" | "bans" | "emojis";

interface UserDetailModal {
  username: string;
  tab: "overview" | "roles" | "moderation";
}

const ALL_PERMISSIONS = [
  {
    id: "administrator",
    name: "Administrator",
    description: "Full permissions (bypasses all checks except owner)",
    category: "Server",
  },
  {
    id: "manage_server",
    name: "Manage Server",
    description: "Update server settings, emojis, and webhooks",
    category: "Server",
  },
  {
    id: "view_audit_log",
    name: "View Audit Log",
    description: "View server audit logs",
    category: "Server",
  },
  {
    id: "manage_roles",
    name: "Manage Roles",
    description: "Create, delete, and assign roles below own position",
    category: "Roles",
  },
  {
    id: "manage_channels",
    name: "Manage Channels",
    description: "Create, delete, and configure channels",
    category: "Channels",
  },
  {
    id: "manage_threads",
    name: "Manage Threads",
    description: "Lock, archive, and delete threads",
    category: "Channels",
  },
  {
    id: "manage_users",
    name: "Manage Users",
    description: "Ban, unban, timeout, and manage user nicknames",
    category: "Moderation",
  },
  {
    id: "kick_members",
    name: "Kick Members",
    description: "Kick users from the server",
    category: "Moderation",
  },
  {
    id: "manage_nicknames",
    name: "Manage Nicknames",
    description: "Change other users' nicknames",
    category: "Moderation",
  },
  {
    id: "change_nickname",
    name: "Change Nickname",
    description: "Change own nickname",
    category: "Moderation",
  },
  {
    id: "manage_messages",
    name: "Manage Messages",
    description: "Delete and pin any message across all channels",
    category: "Messages",
  },
  {
    id: "read_message_history",
    name: "Read History",
    description: "View previous messages in channel",
    category: "Messages",
  },
  {
    id: "send_messages",
    name: "Send Messages",
    description: "Send messages in text channels",
    category: "Messages",
  },
  {
    id: "send_tts",
    name: "Send TTS",
    description: "Send text-to-speech messages",
    category: "Messages",
  },
  {
    id: "embed_links",
    name: "Embed Links",
    description: "Embed links in messages",
    category: "Messages",
  },
  {
    id: "attach_files",
    name: "Attach Files",
    description: "Attach files to messages",
    category: "Messages",
  },
  {
    id: "add_reactions",
    name: "Add Reactions",
    description: "Add reactions to messages",
    category: "Messages",
  },
  {
    id: "external_emojis",
    name: "External Emojis",
    description: "Use external/custom emojis",
    category: "Messages",
  },
  {
    id: "mention_everyone",
    name: "Mention Everyone",
    description: "Mention the @everyone role",
    category: "Special",
  },
  {
    id: "use_slash_commands",
    name: "Use Slash Commands",
    description: "Use slash commands in chat",
    category: "Special",
  },
  {
    id: "create_invite",
    name: "Create Invite",
    description: "Create channel invites",
    category: "Invites",
  },
  {
    id: "manage_invites",
    name: "Manage Invites",
    description: "Manage and revoke invites",
    category: "Invites",
  },
  {
    id: "connect",
    name: "Connect",
    description: "Connect to voice channels",
    category: "Voice",
  },
  {
    id: "speak",
    name: "Speak",
    description: "Speak in voice channels",
    category: "Voice",
  },
  {
    id: "stream",
    name: "Stream",
    description: "Stream video in voice channels",
    category: "Voice",
  },
  {
    id: "mute_members",
    name: "Mute Members",
    description: "Mute users in voice channels",
    category: "Voice",
  },
  {
    id: "deafen_members",
    name: "Deafen Members",
    description: "Deafen users in voice channels",
    category: "Voice",
  },
  {
    id: "move_members",
    name: "Move Members",
    description: "Move users between voice channels",
    category: "Voice",
  },
  {
    id: "use_voice_activity",
    name: "Voice Activity",
    description: "Use voice activity detection",
    category: "Voice",
  },
  {
    id: "priority_speaker",
    name: "Priority Speaker",
    description: "Be heard over other speakers",
    category: "Voice",
  },
];

function UserRolesEditor({
  username,
  serverRoles,
  serverUrl: sUrl,
}: {
  username: string;
  serverRoles: Role[];
  serverUrl: string;
}) {
  const member = users.value[username.toLowerCase()];
  const initialRoles = member?.roles || [];
  const [assignedRoles, setAssignedRoles] = useState<string[]>(initialRoles);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [jsonValue, setJsonValue] = useState(JSON.stringify(initialRoles, null, 2));
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    setAssignedRoles(initialRoles);
    setJsonValue(JSON.stringify(initialRoles, null, 2));
  }, [initialRoles.join(",")]);

  const getRoleColor = (roleName: string): string | null => {
    const role = serverRoles.find((r) => r.name === roleName);
    return role?.color ?? null;
  };

  const addRole = (roleName: string) => {
    if (!assignedRoles.includes(roleName)) {
      const newRoles = [...assignedRoles, roleName];
      setAssignedRoles(newRoles);
      setJsonValue(JSON.stringify(newRoles, null, 2));
    }
  };

  const removeRole = (roleName: string) => {
    const newRoles = assignedRoles.filter((r) => r !== roleName);
    if (newRoles.length === 0) {
      showError("User must have at least one role");
      return;
    }
    setAssignedRoles(newRoles);
    setJsonValue(JSON.stringify(newRoles, null, 2));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newRoles = [...assignedRoles];
    const [removed] = newRoles.splice(draggedIndex!, 1);
    newRoles.splice(targetIndex, 0, removed);
    setAssignedRoles(newRoles);
    setJsonValue(JSON.stringify(newRoles, null, 2));
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleJsonSave = () => {
    try {
      const parsed = JSON.parse(jsonValue);
      if (!Array.isArray(parsed)) {
        showError("Roles must be an array");
        return;
      }
      if (parsed.length === 0) {
        showError("User must have at least one role");
        return;
      }
      const validRoles = parsed.filter((r: any) => typeof r === "string");
      setAssignedRoles(validRoles);
      wsSend({ cmd: "user_roles_set", user: username, roles: validRoles }, sUrl);
      showInfo("Roles updated");
      setShowJsonEditor(false);
    } catch {
      showError("Invalid JSON");
    }
  };

  const handleSave = () => {
    wsSend({ cmd: "user_roles_set", user: username, roles: assignedRoles }, sUrl);
    showInfo("Roles updated");
  };

  const availableRoles = serverRoles.filter(
    (r) => !assignedRoles.includes(r.name) && r.name !== "owner"
  );

  return (
    <div className="user-roles-editor">
      <div className="user-roles-header">
        <h4>Assigned Roles</h4>
        <div className="user-roles-actions">
          <button
            className="user-roles-toggle-btn"
            onClick={() => setShowJsonEditor(!showJsonEditor)}
          >
            <Icon name="Code" size={14} />
            {showJsonEditor ? "Hide JSON" : "Edit JSON"}
          </button>
        </div>
      </div>

      {showJsonEditor ? (
        <div className="json-editor-section">
          <textarea
            className="json-editor-textarea"
            value={jsonValue}
            onInput={(e) => setJsonValue((e.target as HTMLTextAreaElement).value)}
            spellcheck={false}
          />
          <div className="json-editor-actions">
            <button className="settings-btn-cancel" onClick={() => setShowJsonEditor(false)}>
              Cancel
            </button>
            <button className="settings-btn-confirm" onClick={handleJsonSave}>
              Save JSON
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="assigned-roles-list">
            {assignedRoles.map((roleName, index) => (
              <div
                key={roleName}
                className={`assigned-role-item ${draggedIndex === index ? "dragging" : ""} ${dragOverIndex === index ? "drag-over" : ""}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e as any, index)}
                onDrop={() => handleDrop(index)}
              >
                <div className="role-drag-handle">
                  <Icon name="GripVertical" size={14} />
                </div>
                <div
                  className="role-color-dot"
                  style={{ background: getRoleColor(roleName) }}
                ></div>
                <span className="role-name" style={{ color: getRoleColor(roleName) }}>
                  {roleName}
                </span>
                {roleName !== "user" && (
                  <button className="role-remove-btn" onClick={() => removeRole(roleName)}>
                    <Icon name="X" size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="add-role-section">
            <h5>Add Role</h5>
            {availableRoles.length === 0 ? (
              <div className="no-roles-available">All roles already assigned</div>
            ) : (
              <div className="available-roles-grid">
                {availableRoles.map((role) => (
                  <button
                    key={role.name}
                    className="available-role-btn"
                    style={{ borderColor: role.color || "transparent" }}
                    onClick={() => addRole(role.name)}
                  >
                    {role.color && (
                      <span className="role-color-dot" style={{ background: role.color }}></span>
                    )}
                    <span>{role.name}</span>
                    <Icon name="Plus" size={12} />
                  </button>
                ))}
                <div className="user-roles-footer">
                  <button className="settings-btn-confirm" onClick={handleSave}>
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ServerSettingsModal() {
  const [section, setSection] = useState<Section>("overview");
  const [serverRoles, setServerRoles] = useState<Role[]>([]);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRoleColor, setNewRoleColor] = useState<string | null>("#5865F2");
  const [newRoleHoisted, setNewRoleHoisted] = useState(false);
  const [newRoleCategory, setNewRoleCategory] = useState<string | null>(null);
  const [newRoleSelfAssignable, setNewRoleSelfAssignable] = useState(false);
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);
  const [creatingRole, setCreatingRole] = useState(false);
  const [roleEdits, setRoleEdits] = useState<
    Record<
      string,
      {
        permissions?: string[];
        color?: string | null;
        description?: string;
        category?: string | null;
        hoisted?: boolean;
        self_assignable?: boolean;
      }
    >
  >({});
  const [memberFilter, setMemberFilter] = useState("");
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<"text" | "voice" | "separator">("text");
  const [channelDescription, setChannelDescription] = useState("");
  const [bannedUsers, setBannedUsers] = useState<string[]>([]);
  const [userDetailModal, setUserDetailModal] = useState<UserDetailModal | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editNickname, setEditNickname] = useState<string | null>(null);
  const [timeoutModal, setTimeoutModal] = useState<string | null>(null);
  const [timeoutSeconds, setTimeoutSeconds] = useState(300);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [draggedRole, setDraggedRole] = useState<string | null>(null);
  const [dragOverRole, setDragOverRole] = useState<string | null>(null);
  const [draggedChannel, setDraggedChannel] = useState<string | null>(null);
  const [dragOverChannel, setDragOverChannel] = useState<string | null>(null);
  const [serverEmojis, setServerEmojis] = useState<CustomEmoji[]>([]);
  const [emojiModalOpen, setEmojiModalOpen] = useState(false);
  const [emojiName, setEmojiName] = useState("");
  const [emojiFile, setEmojiFile] = useState<File | null>(null);
  const [emojiPreview, setEmojiPreview] = useState<string | null>(null);
  const [emojiEditModal, setEmojiEditModal] = useState<CustomEmoji | null>(null);

  useEffect(() => {
    wsSend({ cmd: "roles_list" }, serverUrl.value);
    wsSend({ cmd: "users_banned_list" }, serverUrl.value);
  }, []);

  useEffect(() => {
    const emojis = customEmojisByServer.value[serverUrl.value];
    if (emojis) {
      setServerEmojis(Object.values(emojis));
    } else {
      setServerEmojis([]);
    }
  }, [customEmojisByServer.value]);

  useEffect(() => {
    const roles = rolesByServer.value[serverUrl.value];
    if (roles) {
      setServerRoles(
        Object.entries(roles).map(([roleName, role]) => ({
          ...role,
          name: roleName,
        }))
      );
    }
  }, [rolesByServer.value]);

  useEffect(() => {
    const banned = bannedUsersByServer.value[serverUrl.value];
    if (banned) {
      setBannedUsers(banned);
    }
  }, [bannedUsersByServer.value]);

  const close = () => {
    showServerSettingsModal.value = false;
  };

  const getRoleColor = (roleName: string): string | null => {
    const role = serverRoles.find((r) => r.name === roleName);
    return role?.color ?? null;
  };

  const myServerUser =
    usersByServer.value[serverUrl.value]?.[currentUser.value?.username?.toLowerCase() || ""];
  const owner = isServerOwner(serverUrl.value);
  const canChannels = canManageChannels(serverUrl.value);
  const canRoles = canManageRoles(serverUrl.value);
  const canUsers = canManageUsers(serverUrl.value);
  const canEmojis = canManageEmojis(serverUrl.value);
  const isOwner = owner;

  const server = currentServer.value;
  const usersList = Object.values(users.value);
  const channelsList = channels.value;

  const filteredMembers = usersList
    .filter((m) => !memberFilter || m.username.toLowerCase().includes(memberFilter.toLowerCase()))
    .sort((a, b) => {
      const ar = a.roles || [];
      const br = b.roles || [];
      if (ar.includes("owner") && !br.includes("owner")) return -1;
      if (!ar.includes("owner") && br.includes("owner")) return 1;
      if (ar.includes("admin") && !br.includes("admin")) return -1;
      if (!ar.includes("admin") && br.includes("admin")) return 1;
      return a.username.localeCompare(b.username);
    });

  const startCreatingRole = () => {
    setNewRoleName("");
    setNewRoleDesc("");
    setNewRoleColor("#5865F2");
    setNewRoleHoisted(false);
    setNewRoleCategory(null);
    setNewRoleSelfAssignable(false);
    setNewRolePermissions([]);
    setCreatingRole(true);
  };

  const cancelCreatingRole = () => {
    setCreatingRole(false);
  };

  const saveNewRole = () => {
    if (!newRoleName.trim()) return;
    wsSend(
      {
        cmd: "role_create",
        name: newRoleName,
        description: newRoleDesc,
        color: newRoleColor,
        hoisted: newRoleHoisted,
        category: newRoleCategory,
        self_assignable: newRoleSelfAssignable,
        permissions: newRolePermissions.length > 0 ? newRolePermissions : undefined,
      },
      serverUrl.value
    );
    setCreatingRole(false);
    showInfo(`Role "${newRoleName}" created`);
  };

  const startEditingRole = (roleName: string | null) => {
    setEditingRole(roleName);
    if (roleName) {
      setCreatingRole(false);
    }
  };

  const getRolePermissions = (role: Role): string[] => {
    if (!role.permissions) return [];
    if (Array.isArray(role.permissions)) return role.permissions;
    if (typeof role.permissions === "object") return Object.keys(role.permissions);
    return [];
  };

  const togglePermission = (roleName: string, permissionId: string) => {
    const role = serverRoles.find((r) => r.name === roleName);
    if (!role) return;

    const currentPerms = roleEdits[roleName]?.permissions ?? getRolePermissions(role);
    const hasPermission = currentPerms.includes(permissionId);

    const newPerms = hasPermission
      ? currentPerms.filter((p: string) => p !== permissionId)
      : [...currentPerms, permissionId];

    setRoleEdits((prev) => ({
      ...prev,
      [roleName]: {
        ...prev[roleName],
        permissions: newPerms,
      },
    }));

    wsSend(
      {
        cmd: "role_update",
        name: roleName,
        permissions: newPerms,
      },
      serverUrl.value
    );
  };

  const updateRoleField = (
    roleName: string,
    field: "color" | "description" | "category" | "hoisted" | "self_assignable",
    value: string | boolean | null | string[]
  ) => {
    setRoleEdits((prev) => ({
      ...prev,
      [roleName]: {
        ...prev[roleName],
        [field]: value,
      },
    }));
  };

  const saveRoleField = (
    roleName: string,
    field: "color" | "description" | "category" | "hoisted" | "self_assignable"
  ) => {
    const role = serverRoles.find((r) => r.name === roleName);
    if (!role) return;

    const edit = roleEdits[roleName];
    if (!edit || edit[field] === undefined) return;

    wsSend(
      {
        cmd: "role_update",
        name: roleName,
        [field]: edit[field],
      },
      serverUrl.value
    );

    showInfo(`Role "${roleName}" updated`);
  };

  const getRoleEditValue = (
    role: Role,
    field: "color" | "description" | "category" | "hoisted" | "self_assignable"
  ): string | boolean | null | string[] | undefined => {
    if (roleEdits[role.name]?.[field] !== undefined) {
      return roleEdits[role.name][field];
    }
    if (field === "self_assignable") {
      return (role as any).self_assignable ?? false;
    }
    return role[field] as string | boolean | null | string[] | undefined;
  };

  const openCreateChannel = () => {
    setChannelName("");
    setChannelType("text");
    setChannelDescription("");
    setChannelModalOpen(true);
  };

  const handleCreateChannel = () => {
    if (!channelName.trim()) return;
    wsSend(
      {
        cmd: "channel_create",
        name: channelName.trim(),
        type: channelType,
        description: channelType !== "separator" ? channelDescription.trim() : undefined,
      },
      serverUrl.value
    );
    setChannelModalOpen(false);
    showInfo(`Channel "${channelName}" created`);
  };

  const deleteRole = (name: string) => {
    if (["owner", "admin", "user"].includes(name)) return;
    if (confirm(`Delete role "${name}"?`)) {
      wsSend({ cmd: "role_delete", name }, serverUrl.value);
      showInfo(`Role "${name}" deleted`);
      setEditingRole(null);
    }
  };

  const toggleMemberRole = (username: string, roleName: string, hasRole: boolean) => {
    wsSend(
      {
        cmd: hasRole ? "user_roles_remove" : "user_roles_add",
        user: username,
        roles: [roleName],
      },
      serverUrl.value
    );
  };

  const handleUnbanUser = (username: string) => {
    wsSend({ cmd: "user_unban", user: username }, serverUrl.value);
    showInfo(`User "${username}" unbanned`);
  };

  const handleTimeoutUser = (username: string, seconds: number) => {
    wsSend({ cmd: "user_timeout", user: username, timeout: seconds }, serverUrl.value);
    showInfo(`User "${username}" timed out for ${seconds} seconds`);
    setTimeoutModal(null);
  };

  const handleDeleteUser = (username: string) => {
    wsSend({ cmd: "user_delete", user: username }, serverUrl.value);
    showInfo(`User "${username}" deleted`);
    setConfirmDelete(null);
    setUserDetailModal(null);
  };

  const openEditUser = (username: string) => {
    const user = users.value[username.toLowerCase()];
    setEditingUser(username);
    setEditUsername(user?.username || username);
    setEditNickname(user?.nickname ?? null);
  };

  const handleUserUpdate = () => {
    if (!editingUser) return;
    const originalUser = users.value[editingUser.toLowerCase()];
    const updates: { username?: string; nickname?: string | null } = {};

    if (editUsername !== originalUser?.username) {
      updates.username = editUsername;
    }
    if (editNickname !== (originalUser?.nickname ?? null)) {
      updates.nickname = editNickname;
    }

    if (Object.keys(updates).length > 0) {
      wsSend(
        {
          cmd: "user_update",
          user: editingUser,
          updates,
        },
        serverUrl.value
      );
      showInfo(`User "${editingUser}" updated`);
    }
    setEditingUser(null);
  };

  const cancelEditUser = () => {
    setEditingUser(null);
    setEditUsername("");
    setEditNickname(null);
  };

  const handleRoleDragStart = (roleName: string) => {
    setDraggedRole(roleName);
  };

  const handleRoleDragOver = (e: DragEvent, roleName: string) => {
    e.preventDefault();
    setDragOverRole(roleName);
  };

  const handleRoleDrop = (targetRoleName: string) => {
    if (!draggedRole || draggedRole === targetRoleName) {
      setDraggedRole(null);
      setDragOverRole(null);
      return;
    }

    const draggedIndex = serverRoles.findIndex((r) => r.name === draggedRole);
    const targetIndex = serverRoles.findIndex((r) => r.name === targetRoleName);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedRole(null);
      setDragOverRole(null);
      return;
    }

    const newRoles = [...serverRoles];
    const [removed] = newRoles.splice(draggedIndex, 1);
    newRoles.splice(targetIndex, 0, removed);
    setServerRoles(newRoles);

    wsSend({ cmd: "role_reorder", roles: newRoles.map((r) => r.name) }, serverUrl.value);

    setDraggedRole(null);
    setDragOverRole(null);
  };

  const handleRoleDragEnd = () => {
    setDraggedRole(null);
    setDragOverRole(null);
  };

  const handleChannelDragStart = (channelName: string) => {
    setDraggedChannel(channelName);
  };

  const handleChannelDragOver = (e: DragEvent, channelName: string) => {
    e.preventDefault();
    setDragOverChannel(channelName);
  };

  const handleChannelDrop = (targetChannelName: string) => {
    if (!draggedChannel || draggedChannel === targetChannelName) {
      setDraggedChannel(null);
      setDragOverChannel(null);
      return;
    }

    const draggedIndex = channelsList.findIndex((c) => c.name === draggedChannel);
    const targetIndex = channelsList.findIndex((c) => c.name === targetChannelName);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedChannel(null);
      setDragOverChannel(null);
      return;
    }

    wsSend(
      {
        cmd: "channel_move",
        name: draggedChannel,
        position: targetIndex,
      },
      serverUrl.value
    );

    setDraggedChannel(null);
    setDragOverChannel(null);
  };

  const handleChannelDragEnd = () => {
    setDraggedChannel(null);
    setDragOverChannel(null);
  };

  const openAddEmoji = () => {
    setEmojiName("");
    setEmojiFile(null);
    setEmojiPreview(null);
    setEmojiModalOpen(true);
  };

  const handleEmojiFileChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const allowedTypes = ["image/gif", "image/jpeg", "image/jpg", "image/svg+xml"];
      if (!allowedTypes.includes(file.type)) {
        showError("Invalid file type. Allowed: GIF, JPG, JPEG, SVG");
        return;
      }
      setEmojiFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setEmojiPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddEmoji = () => {
    if (!emojiName.trim()) {
      showError("Emoji name is required");
      return;
    }
    if (!emojiFile || !emojiPreview) {
      showError("Please select an image file");
      return;
    }
    wsSend(
      {
        cmd: "emoji_add",
        name: emojiName.trim(),
        image: emojiPreview,
      },
      serverUrl.value
    );
    setEmojiModalOpen(false);
    showInfo(`Emoji "${emojiName}" added`);
  };

  const handleDeleteEmoji = (emoji: CustomEmoji) => {
    if (confirm(`Delete emoji "${emoji.name}"?`)) {
      wsSend({ cmd: "emoji_delete", emoji_id: parseInt(emoji.id, 10) }, serverUrl.value);
      showInfo(`Emoji "${emoji.name}" deleted`);
    }
  };

  const handleUpdateEmojiName = (emoji: CustomEmoji, newName: string) => {
    if (!newName.trim()) {
      showError("Emoji name is required");
      return;
    }
    wsSend(
      {
        cmd: "emoji_update",
        emoji_id: parseInt(emoji.id, 10),
        name: newName.trim(),
      },
      serverUrl.value
    );
    setEmojiEditModal(null);
    showInfo(`Emoji renamed to "${newName}"`);
  };

  const getEmojiUrl = (emoji: CustomEmoji): string => {
    const baseUrl = serverUrl.value.startsWith("http")
      ? serverUrl.value
      : `https://${serverUrl.value}`;
    return `${baseUrl}/emojis/${emoji.fileName}`;
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
              {server?.icon ? (
                <img src={server.icon} alt={server.name} />
              ) : (
                <span>{(server?.name || "S").charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="server-settings-title">
              <div className="server-settings-name">{server?.name || "Server"}</div>
              <div className="server-settings-url">{serverUrl.value}</div>
            </div>
          </div>
          <nav className="server-settings-nav">
            {(
              [
                "overview",
                canChannels ? "channels" : null,
                canRoles ? "roles" : null,
                canUsers ? "members" : null,
                canUsers ? "bans" : null,
                canEmojis ? "emojis" : null,
              ].filter(Boolean) as Section[]
            ).map((s) => (
              <button
                key={s}
                className={`server-nav-item ${section === s ? "active" : ""}`}
                onClick={() => setSection(s)}
              >
                <Icon
                  name={
                    s === "overview"
                      ? "Info"
                      : s === "channels"
                        ? "Hash"
                        : s === "roles"
                          ? "Shield"
                          : s === "members"
                            ? "Users"
                            : s === "emojis"
                              ? "Smile"
                              : "Ban"
                  }
                  size={16}
                />
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </nav>
        </div>
        <div className="server-settings-content">
          <div className="server-settings-content-header">
            <h2>{section.charAt(0).toUpperCase() + section.slice(1)}</h2>
            <button className="server-settings-close" onClick={close}>
              <Icon name="X" size={20} />
            </button>
          </div>

          {section === "overview" && (
            <div className="server-section-body">
              <div className="settings-field">
                <label>Server Name</label>
                <div className="settings-value">{server?.name || "-"}</div>
              </div>
              <div className="settings-field">
                <label>Server URL</label>
                <div className="settings-value">{serverUrl.value}</div>
              </div>
              <div className="settings-field">
                <label>Your Role</label>
                <div
                  className="settings-value"
                  style={{
                    color: myServerUser?.roles?.[0]
                      ? getRoleColor(myServerUser.roles[0])
                      : "var(--text-dim)",
                  }}
                >
                  {myServerUser?.roles?.join(", ") || "None"}
                </div>
              </div>
              <div className="settings-field">
                <label>Members</label>
                <div className="settings-value">{usersList.length}</div>
              </div>
              <div className="settings-field">
                <label>Channels</label>
                <div className="settings-value">
                  {channelsList.filter((c) => c.type !== "separator").length}
                </div>
              </div>
            </div>
          )}

          {section === "channels" && (
            <div className="server-section-body" style={{ position: "relative" }}>
              {channelsList.length === 0 ? (
                <div className="settings-empty">No channels found</div>
              ) : (
                <div className="settings-list">
                  {channelsList.map((channel) => {
                    const iconName =
                      channel.type === "voice"
                        ? "Mic"
                        : channel.type === "separator"
                          ? "Minus"
                          : "Hash";
                    return (
                      <div
                        key={channel.name}
                        className={`settings-list-item clickable ${draggedChannel === channel.name ? "dragging" : ""} ${dragOverChannel === channel.name ? "drag-over" : ""}`}
                        draggable={isOwner}
                        onDragStart={() => handleChannelDragStart(channel.name)}
                        onDragOver={(e) => handleChannelDragOver(e as any, channel.name)}
                        onDrop={() => handleChannelDrop(channel.name)}
                        onDragEnd={handleChannelDragEnd}
                        onClick={() => {
                          channelEditFromSettings.value = true;
                          showChannelEditModal.value = channel.name;
                          close();
                        }}
                      >
                        {isOwner && (
                          <div className="channel-drag-handle">
                            <Icon name="GripVertical" size={14} />
                          </div>
                        )}
                        <div className="settings-item-icon">
                          <Icon name={iconName} size={16} />
                        </div>
                        <div className="settings-item-info">
                          <div className="settings-item-name">
                            <TwemojiText>
                              {(channel as any).display_name || channel.name}
                            </TwemojiText>
                          </div>
                          <div className="settings-item-meta">
                            {channel.type}
                            {channel.type === "separator" ? "" : ` - ${channel.name}`}
                          </div>
                        </div>
                        {isOwner && (
                          <button
                            className="settings-icon-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              channelEditFromSettings.value = true;
                              showChannelEditModal.value = channel.name;
                              close();
                            }}
                            title="Edit"
                          >
                            <Icon name="Edit3" size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {section === "roles" && (
            <div className="server-section-body roles-section-body">
              <div className="roles-list-container">
                {isOwner && (
                  <button
                    className="settings-action-btn"
                    onClick={() => {
                      setCreatingRole(true);
                      setEditingRole(null);
                    }}
                  >
                    <Icon name="Plus" size={16} /> Create Role
                  </button>
                )}

                {serverRoles.length === 0 ? (
                  <div className="settings-empty">No roles found</div>
                ) : (
                  <div className="roles-list-new">
                    {serverRoles.map((role) => {
                      const isSystem = ["owner", "user"].includes(role.name);
                      const rolePerms = getRolePermissions(role);

                      return (
                        <div
                          key={role.name}
                          className={`role-card ${editingRole === role.name ? "active" : ""} ${draggedRole === role.name ? "dragging" : ""} ${dragOverRole === role.name ? "drag-over" : ""}`}
                          draggable={isOwner && editingRole !== role.name}
                          onDragStart={() => handleRoleDragStart(role.name)}
                          onDragOver={(e) => handleRoleDragOver(e as any, role.name)}
                          onDrop={() => handleRoleDrop(role.name)}
                          onDragEnd={handleRoleDragEnd}
                        >
                          <div
                            className="role-card-header"
                            onClick={() => startEditingRole(role.name)}
                          >
                            <div className="role-drag-area">
                              {isOwner && <Icon name="GripVertical" size={14} />}
                            </div>
                            <div
                              className="role-color-dot"
                              style={{
                                background: role.color || "var(--text-dim)",
                              }}
                            />
                            <div className="role-card-info">
                              <span
                                className="role-card-name"
                                style={{ color: role.color || "inherit" }}
                              >
                                {role.name}
                              </span>
                              <span className="role-card-meta">
                                {role.description || "No description"}
                                {role.category && ` · ${role.category}`}
                                {!isSystem && ` · ${rolePerms.length} permissions`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="role-editor-panel">
                {creatingRole ? (
                  <>
                    <div className="role-editor-panel-header">
                      <h3>Create Role</h3>
                      <button
                        className="server-settings-close"
                        onClick={() => setCreatingRole(false)}
                      >
                        <Icon name="X" size={18} />
                      </button>
                    </div>
                    <div className="role-editor-panel-body">
                      <div className="role-editor-field">
                        <label>Role Name</label>
                        <input
                          type="text"
                          className="role-name-input"
                          value={newRoleName}
                          onInput={(e) => setNewRoleName((e.target as HTMLInputElement).value)}
                          placeholder="New role name"
                          autoFocus
                        />
                      </div>
                      <div className="role-editor-field">
                        <label>Description</label>
                        <input
                          type="text"
                          value={newRoleDesc}
                          onInput={(e) => setNewRoleDesc((e.target as HTMLInputElement).value)}
                          placeholder="Role description"
                        />
                      </div>
                      <div className="role-editor-field">
                        <label>Color</label>
                        <div className="color-picker-row">
                          <input
                            type="color"
                            value={newRoleColor ?? "#5865F2"}
                            onInput={(e) => setNewRoleColor((e.target as HTMLInputElement).value)}
                          />
                          <input
                            type="text"
                            value={newRoleColor ?? ""}
                            onInput={(e) =>
                              setNewRoleColor((e.target as HTMLInputElement).value || null)
                            }
                            placeholder="#5865F2"
                            className="color-hex-input"
                          />
                          <button
                            className="settings-btn-secondary small"
                            onClick={() => setNewRoleColor(null)}
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="role-editor-row">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={newRoleHoisted}
                            onChange={(e) =>
                              setNewRoleHoisted((e.target as HTMLInputElement).checked)
                            }
                          />
                          <span>Hoisted (show separately in member list)</span>
                        </label>
                      </div>
                      <div className="role-editor-row">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={newRoleSelfAssignable}
                            onChange={(e) =>
                              setNewRoleSelfAssignable((e.target as HTMLInputElement).checked)
                            }
                          />
                          <span>Self-assignable (users can assign to themselves)</span>
                        </label>
                      </div>
                      <div className="role-editor-field">
                        <label>Category</label>
                        <input
                          type="text"
                          value={newRoleCategory ?? ""}
                          onInput={(e) =>
                            setNewRoleCategory((e.target as HTMLInputElement).value || null)
                          }
                          placeholder="No category"
                        />
                      </div>
                      <div className="role-permissions-section">
                        <label>Permissions</label>
                        <div className="permissions-grid">
                          {ALL_PERMISSIONS.map((perm) => (
                            <button
                              key={perm.id}
                              className={`permission-chip ${newRolePermissions.includes(perm.id) ? "active" : ""}`}
                              onClick={() => {
                                if (newRolePermissions.includes(perm.id)) {
                                  setNewRolePermissions(
                                    newRolePermissions.filter((p) => p !== perm.id)
                                  );
                                } else {
                                  setNewRolePermissions([...newRolePermissions, perm.id]);
                                }
                              }}
                              title={perm.description}
                            >
                              {perm.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="role-editor-actions">
                      <button
                        className="settings-btn-cancel"
                        onClick={() => setCreatingRole(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="settings-btn-confirm"
                        onClick={saveNewRole}
                        disabled={!newRoleName.trim()}
                      >
                        Create Role
                      </button>
                    </div>
                  </>
                ) : editingRole ? (
                  (() => {
                    const role = serverRoles.find((r) => r.name === editingRole);
                    if (!role) return null;
                    const isSystem = ["owner", "user"].includes(role.name);
                    const rolePerms = getRolePermissions(role);

                    return (
                      <>
                        <div className="role-editor-panel-header">
                          <h3>Edit Role</h3>
                        </div>
                        <div className="role-editor-panel-body">
                          <div className="role-editor-field">
                            <label>Role Name</label>
                            <input
                              type="text"
                              className="role-name-input"
                              value={role.name}
                              disabled
                              style={{
                                color: role.color || "inherit",
                                fontWeight: 600,
                              }}
                            />
                          </div>
                          <div className="role-editor-field">
                            <label>Color</label>
                            <div className="color-picker-row">
                              <input
                                type="color"
                                value={(getRoleEditValue(role, "color") as string) ?? "#5865F2"}
                                onInput={(e) => {
                                  updateRoleField(
                                    role.name,
                                    "color",
                                    (e.target as HTMLInputElement).value
                                  );
                                }}
                                onBlur={() => saveRoleField(role.name, "color")}
                              />
                              <input
                                type="text"
                                value={(getRoleEditValue(role, "color") as string) ?? ""}
                                onInput={(e) => {
                                  updateRoleField(
                                    role.name,
                                    "color",
                                    (e.target as HTMLInputElement).value || null
                                  );
                                }}
                                onBlur={() => saveRoleField(role.name, "color")}
                                placeholder="No color"
                                className="color-hex-input"
                              />
                              <button
                                className="settings-btn-secondary small"
                                onClick={() => {
                                  wsSend(
                                    {
                                      cmd: "role_update",
                                      name: role.name,
                                      color: null,
                                    },
                                    serverUrl.value
                                  );
                                  showInfo(`Role "${role.name}" color cleared`);
                                }}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                          <div className="role-editor-field">
                            <label>Description</label>
                            <input
                              type="text"
                              value={(getRoleEditValue(role, "description") as string) ?? ""}
                              onInput={(e) =>
                                updateRoleField(
                                  role.name,
                                  "description",
                                  (e.target as HTMLInputElement).value
                                )
                              }
                              onBlur={() => saveRoleField(role.name, "description")}
                              placeholder="No description"
                            />
                          </div>
                          <div className="role-editor-field">
                            <label>Category</label>
                            <input
                              type="text"
                              value={(getRoleEditValue(role, "category") as string) ?? ""}
                              onInput={(e) =>
                                updateRoleField(
                                  role.name,
                                  "category",
                                  (e.target as HTMLInputElement).value || null
                                )
                              }
                              onBlur={() => saveRoleField(role.name, "category")}
                              placeholder="No category"
                            />
                          </div>
                          <div className="role-editor-toggles">
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={(getRoleEditValue(role, "hoisted") as boolean) ?? false}
                                onChange={(e) => {
                                  const checked = (e.target as HTMLInputElement).checked;
                                  updateRoleField(role.name, "hoisted", checked);
                                  wsSend(
                                    {
                                      cmd: "role_update",
                                      name: role.name,
                                      hoisted: checked,
                                    },
                                    serverUrl.value
                                  );
                                  showInfo(
                                    `Role "${role.name}" ${checked ? "hoisted" : "unhoisted"}`
                                  );
                                }}
                              />
                              <span>Hoisted (show separately in member list)</span>
                            </label>
                            {!["owner", "admin", "moderator"].includes(role.name) && (
                              <label className="checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={
                                    (getRoleEditValue(role, "self_assignable") as boolean) ?? false
                                  }
                                  onChange={(e) => {
                                    const checked = (e.target as HTMLInputElement).checked;
                                    updateRoleField(role.name, "self_assignable", checked);
                                    wsSend(
                                      {
                                        cmd: "role_update",
                                        name: role.name,
                                        self_assignable: checked,
                                      },
                                      serverUrl.value
                                    );
                                    showInfo(
                                      `Role "${role.name}" ${checked ? "is now self-assignable" : "is no longer self-assignable"}`
                                    );
                                  }}
                                />
                                <span>Self-assignable (users can assign to themselves)</span>
                              </label>
                            )}
                          </div>
                          <div className="role-permissions-section">
                            <div className="permissions-header">
                              <label>Permissions</label>
                              <div className="permissions-actions">
                                <button
                                  className="settings-btn-secondary small"
                                  onClick={() => {
                                    const allPerms = ALL_PERMISSIONS.map((p) => p.id);
                                    wsSend(
                                      {
                                        cmd: "role_update",
                                        name: role.name,
                                        permissions: allPerms,
                                      },
                                      serverUrl.value
                                    );
                                    showInfo(`All permissions added to "${role.name}"`);
                                  }}
                                >
                                  Select All
                                </button>
                                <button
                                  className="settings-btn-secondary small"
                                  onClick={() => {
                                    wsSend(
                                      {
                                        cmd: "role_update",
                                        name: role.name,
                                        permissions: [],
                                      },
                                      serverUrl.value
                                    );
                                    showInfo(`All permissions removed from "${role.name}"`);
                                  }}
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>
                            <div className="permissions-grid">
                              {ALL_PERMISSIONS.map((perm) => {
                                const hasPerm = rolePerms.includes(perm.id);
                                return (
                                  <button
                                    key={perm.id}
                                    className={`permission-chip ${hasPerm ? "active" : ""}`}
                                    onClick={() => togglePermission(role.name, perm.id)}
                                    title={perm.description}
                                  >
                                    {perm.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        {!isSystem && (
                          <div className="role-editor-panel-footer">
                            <button
                              className="settings-btn-danger"
                              onClick={() => {
                                if (confirm(`Delete role "${role.name}"?`)) {
                                  wsSend({ cmd: "role_delete", name: role.name }, serverUrl.value);
                                  showInfo(`Role "${role.name}" deleted`);
                                  const nextRole = serverRoles.find((r) => r.name !== role.name);
                                  setEditingRole(nextRole?.name || null);
                                }
                              }}
                            >
                              Delete Role
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()
                ) : (
                  <div className="role-editor-empty">
                    <p>Select a role to edit</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {section === "members" && (
            <div className="server-section-body">
              <div className="settings-search">
                <Icon name="Search" size={14} />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={memberFilter}
                  onInput={(e) => setMemberFilter((e.target as HTMLInputElement).value)}
                />
              </div>
              <div className="settings-list">
                {filteredMembers.map((member) => (
                  <div
                    key={member.username}
                    className="settings-list-item clickable member-row"
                    onClick={() =>
                      setUserDetailModal({
                        username: member.username,
                        tab: "overview",
                      })
                    }
                  >
                    <UserAvatar
                      username={member.username}
                      className="settings-member-avatar"
                      alt=""
                    />
                    <div className="settings-item-info">
                      <div
                        className="settings-item-name"
                        style={{ color: member.color || "inherit" }}
                      >
                        {member.username}
                      </div>
                      <div className="settings-item-roles">
                        {(member.roles || []).slice(0, 3).map((role) => {
                          const roleColor = getRoleColor(role);
                          return (
                            <span
                              key={role}
                              className="member-role-badge"
                              style={roleColor ? { background: roleColor } : undefined}
                            >
                              {role}
                            </span>
                          );
                        })}
                        {(member.roles || []).length > 3 && (
                          <span className="member-role-badge">
                            +{(member.roles || []).length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="settings-icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUserDetailModal({
                          username: member.username,
                          tab: "overview",
                        });
                      }}
                      title="Manage"
                    >
                      <Icon name="Settings" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === "bans" && (
            <div className="server-section-body">
              {bannedUsers.length === 0 ? (
                <div className="settings-empty">No banned users</div>
              ) : (
                <div className="settings-list">
                  {bannedUsers.map((username) => (
                    <div key={username} className="settings-list-item">
                      <div className="settings-item-icon">
                        <Icon name="Ban" size={16} />
                      </div>
                      <div className="settings-item-info">
                        <div className="settings-item-name">{username}</div>
                        <div className="settings-item-meta">Banned from server</div>
                      </div>
                      {isOwner && (
                        <button
                          className="settings-icon-btn"
                          onClick={() => handleUnbanUser(username)}
                          title="Unban"
                        >
                          <Icon name="UserCheck" size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === "emojis" && (
            <div className="server-section-body">
              {isOwner && (
                <div className="settings-section-actions">
                  <button className="settings-action-btn" onClick={openAddEmoji}>
                    <Icon name="Plus" size={16} /> Add Emoji
                  </button>
                </div>
              )}
              {serverEmojis.length === 0 ? (
                <div className="settings-empty">No custom emojis</div>
              ) : (
                <div className="emoji-grid">
                  {serverEmojis.map((emoji) => (
                    <div key={emoji.id} className="emoji-grid-item">
                      <img
                        src={getEmojiUrl(emoji)}
                        alt={emoji.name}
                        className="emoji-preview-img"
                      />
                      <div className="emoji-item-info">
                        <span className="emoji-item-name">:{emoji.name}:</span>
                      </div>
                      {isOwner && (
                        <div className="emoji-item-actions">
                          <button
                            className="settings-icon-btn"
                            onClick={() => setEmojiEditModal(emoji)}
                            title="Edit"
                          >
                            <Icon name="Edit3" size={14} />
                          </button>
                          <button
                            className="settings-icon-btn danger"
                            onClick={() => handleDeleteEmoji(emoji)}
                            title="Delete"
                          >
                            <Icon name="Trash2" size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {channelModalOpen && (
          <div
            className="settings-inner-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setChannelModalOpen(false);
            }}
          >
            <div className="settings-inner-dialog">
              <h3>Create Channel</h3>
              <div className="settings-field">
                <label>Channel Name</label>
                <input
                  type="text"
                  value={channelName}
                  onInput={(e) => setChannelName((e.target as HTMLInputElement).value)}
                  placeholder="channel-name"
                />
              </div>
              <div className="settings-field">
                <label>Channel Type</label>
                <div className="settings-radio-group">
                  <label className="settings-radio-option">
                    <input
                      type="radio"
                      name="channelType"
                      value="text"
                      checked={channelType === "text"}
                      onChange={() => setChannelType("text")}
                    />
                    <Icon name="Hash" size={16} />
                    <span>Text</span>
                  </label>
                  <label className="settings-radio-option">
                    <input
                      type="radio"
                      name="channelType"
                      value="voice"
                      checked={channelType === "voice"}
                      onChange={() => setChannelType("voice")}
                    />
                    <Icon name="Mic" size={16} />
                    <span>Voice</span>
                  </label>
                  <label className="settings-radio-option">
                    <input
                      type="radio"
                      name="channelType"
                      value="separator"
                      checked={channelType === "separator"}
                      onChange={() => setChannelType("separator")}
                    />
                    <Icon name="Minus" size={16} />
                    <span>Separator</span>
                  </label>
                </div>
              </div>
              {channelType !== "separator" && (
                <div className="settings-field">
                  <label>Description</label>
                  <input
                    type="text"
                    value={channelDescription}
                    onInput={(e) => setChannelDescription((e.target as HTMLInputElement).value)}
                    placeholder="Channel description (optional)"
                  />
                </div>
              )}
              <div className="settings-dialog-actions">
                <button className="settings-btn-cancel" onClick={() => setChannelModalOpen(false)}>
                  Cancel
                </button>
                <button
                  className="settings-btn-confirm"
                  onClick={handleCreateChannel}
                  disabled={!channelName.trim()}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {userDetailModal && (
          <div
            className="settings-inner-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setUserDetailModal(null);
            }}
          >
            <div className="settings-inner-dialog settings-inner-dialog-wide">
              <div className="user-detail-header">
                <UserAvatar
                  username={userDetailModal.username}
                  className="user-detail-avatar"
                  alt=""
                />
                <div className="user-detail-info">
                  <h3>{userDetailModal.username}</h3>
                  <div className="user-detail-roles">
                    {(users.value[userDetailModal.username.toLowerCase()]?.roles || []).map(
                      (role) => (
                        <span
                          key={role}
                          className="member-role-badge"
                          style={{ background: getRoleColor(role) }}
                        >
                          {role}
                        </span>
                      )
                    )}
                  </div>
                </div>
              </div>
              <div className="user-detail-tabs">
                <button
                  className={`user-detail-tab ${userDetailModal.tab === "overview" ? "active" : ""}`}
                  onClick={() => setUserDetailModal({ ...userDetailModal, tab: "overview" })}
                >
                  Overview
                </button>
                <button
                  className={`user-detail-tab ${userDetailModal.tab === "roles" ? "active" : ""}`}
                  onClick={() => setUserDetailModal({ ...userDetailModal, tab: "roles" })}
                >
                  Roles
                </button>
                <button
                  className={`user-detail-tab ${userDetailModal.tab === "moderation" ? "active" : ""}`}
                  onClick={() =>
                    setUserDetailModal({
                      ...userDetailModal,
                      tab: "moderation",
                    })
                  }
                >
                  Moderation
                </button>
              </div>
              <div className="user-detail-content">
                {userDetailModal.tab === "overview" && (
                  <div className="settings-field-group">
                    {editingUser === userDetailModal.username ? (
                      <>
                        <div className="settings-field">
                          <label>Nickname</label>
                          <div className="settings-nickname-field">
                            <input
                              type="text"
                              value={editNickname ?? ""}
                              onInput={(e) => {
                                const val = (e.target as HTMLInputElement).value;
                                setEditNickname(val || null);
                              }}
                              placeholder="No nickname"
                            />
                            <button
                              type="button"
                              className="settings-btn-secondary"
                              onClick={() => setEditNickname(null)}
                              title="Clear nickname"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="settings-dialog-actions">
                          <button className="settings-btn-cancel" onClick={cancelEditUser}>
                            Cancel
                          </button>
                          <button className="settings-btn-confirm" onClick={handleUserUpdate}>
                            Save
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="settings-field">
                          <label>Username</label>
                          <div className="settings-value">
                            {users.value[userDetailModal.username.toLowerCase()]?.username ||
                              userDetailModal.username}
                          </div>
                        </div>
                        <div className="settings-field">
                          <label>Nickname</label>
                          <div className="settings-value">
                            {users.value[userDetailModal.username.toLowerCase()]?.nickname ||
                              "None"}
                          </div>
                        </div>
                        <div className="settings-field">
                          <label>Status</label>
                          <div className="settings-value">
                            {users.value[userDetailModal.username.toLowerCase()]?.status?.status ||
                              "offline"}
                          </div>
                        </div>
                        {isOwner && (
                          <button
                            className="settings-btn-secondary"
                            onClick={() => openEditUser(userDetailModal.username)}
                          >
                            Edit User
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
                {userDetailModal.tab === "roles" && (
                  <UserRolesEditor
                    username={userDetailModal.username}
                    serverRoles={serverRoles}
                    serverUrl={serverUrl.value}
                  />
                )}
                {userDetailModal.tab === "moderation" && (
                  <div className="moderation-actions">
                    <div className="moderation-section">
                      <h4>Timeout</h4>
                      <p className="moderation-description">
                        Temporarily prevent the user from sending messages.
                      </p>
                      <div className="moderation-buttons">
                        <button
                          className="moderation-btn warning"
                          onClick={() => handleTimeoutUser(userDetailModal.username, 60)}
                        >
                          1 min
                        </button>
                        <button
                          className="moderation-btn warning"
                          onClick={() => handleTimeoutUser(userDetailModal.username, 300)}
                        >
                          5 min
                        </button>
                        <button
                          className="moderation-btn warning"
                          onClick={() => handleTimeoutUser(userDetailModal.username, 3600)}
                        >
                          1 hour
                        </button>
                        <button
                          className="moderation-btn warning"
                          onClick={() => handleTimeoutUser(userDetailModal.username, 86400)}
                        >
                          24 hours
                        </button>
                        <button
                          className="moderation-btn warning"
                          onClick={() => setTimeoutModal(userDetailModal.username)}
                        >
                          Custom
                        </button>
                      </div>
                    </div>
                    <div className="moderation-section">
                      <h4>Delete Account</h4>
                      <p className="moderation-description">
                        Permanently delete this user's account from the server.
                      </p>
                      <button
                        className="moderation-btn danger"
                        onClick={() => setConfirmDelete(userDetailModal.username)}
                      >
                        Delete Account
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="settings-dialog-actions">
                <button className="settings-btn-confirm" onClick={() => setUserDetailModal(null)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {timeoutModal && (
          <div
            className="settings-inner-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setTimeoutModal(null);
            }}
          >
            <div className="settings-inner-dialog">
              <h3>Set Custom Timeout</h3>
              <div className="settings-field">
                <label>Duration (seconds)</label>
                <input
                  type="number"
                  value={timeoutSeconds}
                  onInput={(e) => setTimeoutSeconds(Number((e.target as HTMLInputElement).value))}
                  min={0}
                />
              </div>
              <div className="timeout-presets">
                <button onClick={() => setTimeoutSeconds(60)}>1m</button>
                <button onClick={() => setTimeoutSeconds(300)}>5m</button>
                <button onClick={() => setTimeoutSeconds(900)}>15m</button>
                <button onClick={() => setTimeoutSeconds(3600)}>1h</button>
                <button onClick={() => setTimeoutSeconds(86400)}>24h</button>
              </div>
              <div className="settings-dialog-actions">
                <button className="settings-btn-cancel" onClick={() => setTimeoutModal(null)}>
                  Cancel
                </button>
                <button
                  className="settings-btn-confirm"
                  onClick={() => handleTimeoutUser(timeoutModal, timeoutSeconds)}
                >
                  Apply Timeout
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmDelete && (
          <div
            className="settings-inner-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirmDelete(null);
            }}
          >
            <div className="settings-inner-dialog">
              <h3>Delete Account</h3>
              <p className="settings-warning-text">
                Are you sure you want to permanently delete "{confirmDelete}"? This cannot be
                undone.
              </p>
              <div className="settings-dialog-actions">
                <button className="settings-btn-cancel" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button
                  className="settings-btn-danger"
                  onClick={() => handleDeleteUser(confirmDelete)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {emojiModalOpen && (
          <div
            className="settings-inner-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEmojiModalOpen(false);
            }}
          >
            <div className="settings-inner-dialog">
              <h3>Add Emoji</h3>
              <div className="settings-field">
                <label>Emoji Name</label>
                <input
                  type="text"
                  value={emojiName}
                  onInput={(e) => setEmojiName((e.target as HTMLInputElement).value)}
                  placeholder="emoji_name"
                />
              </div>
              <div className="settings-field">
                <label>Image (GIF, JPG, JPEG, SVG)</label>
                <input
                  type="file"
                  accept=".gif,.jpg,.jpeg,.svg,image/gif,image/jpeg,image/svg+xml"
                  onChange={handleEmojiFileChange}
                />
              </div>
              {emojiPreview && (
                <div className="emoji-preview-container">
                  <img src={emojiPreview} alt="Preview" className="emoji-preview-img" />
                  <span className="emoji-preview-label">:{emojiName || "name"}:</span>
                </div>
              )}
              <div className="settings-dialog-actions">
                <button className="settings-btn-cancel" onClick={() => setEmojiModalOpen(false)}>
                  Cancel
                </button>
                <button
                  className="settings-btn-confirm"
                  onClick={handleAddEmoji}
                  disabled={!emojiName.trim() || !emojiFile}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {emojiEditModal && (
          <div
            className="settings-inner-modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEmojiEditModal(null);
            }}
          >
            <div className="settings-inner-dialog">
              <h3>Edit Emoji</h3>
              <div className="settings-field">
                <label>Current Emoji</label>
                <div className="emoji-preview-container">
                  <img
                    src={getEmojiUrl(emojiEditModal)}
                    alt={emojiEditModal.name}
                    className="emoji-preview-img"
                  />
                  <span className="emoji-preview-label">:{emojiEditModal.name}:</span>
                </div>
              </div>
              <div className="settings-field">
                <label>New Name</label>
                <input
                  type="text"
                  defaultValue={emojiEditModal.name}
                  id="emoji-edit-name-input"
                  placeholder="emoji_name"
                />
              </div>
              <div className="settings-dialog-actions">
                <button className="settings-btn-cancel" onClick={() => setEmojiEditModal(null)}>
                  Cancel
                </button>
                <button
                  className="settings-btn-confirm"
                  onClick={() => {
                    const input = document.getElementById(
                      "emoji-edit-name-input"
                    ) as HTMLInputElement;
                    if (input) {
                      handleUpdateEmojiName(emojiEditModal, input.value);
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
