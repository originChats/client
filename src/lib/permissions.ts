import { rolesByServer, usersByServer, currentUser } from "../state";
import type { Role } from "../types";

function getUserPermissions(serverUrl: string): string[] {
  const myServerUser =
    usersByServer.value[serverUrl]?.[
      currentUser.value?.username?.toLowerCase() || ""
    ];

  if (!myServerUser?.roles) return [];

  const roles = rolesByServer.value[serverUrl];
  if (!roles) return [];

  const allPermissions: string[] = [];

  for (const roleName of myServerUser.roles) {
    const role = roles[roleName];
    if (role?.permissions) {
      if (Array.isArray(role.permissions)) {
        for (const perm of role.permissions) {
          if (!allPermissions.includes(perm)) {
            allPermissions.push(perm);
          }
        }
      } else if (typeof role.permissions === "object") {
        for (const perm of Object.keys(role.permissions)) {
          if (!allPermissions.includes(perm)) {
            allPermissions.push(perm);
          }
        }
      }
    }
  }

  return allPermissions;
}

function hasPermission(serverUrl: string, permission: string): boolean {
  const permissions = getUserPermissions(serverUrl);
  if (permissions.includes("administrator")) return true;
  return permissions.includes(permission);
}

function hasAnyPermission(serverUrl: string, perms: string[]): boolean {
  for (const perm of perms) {
    if (hasPermission(serverUrl, perm)) return true;
  }
  return false;
}

export function isServerOwner(serverUrl: string): boolean {
  const myServerUser =
    usersByServer.value[serverUrl]?.[
      currentUser.value?.username?.toLowerCase() || ""
    ];
  return myServerUser?.roles?.includes("owner") ?? false;
}

function canManageServer(serverUrl: string): boolean {
  if (isServerOwner(serverUrl)) return true;
  return hasPermission(serverUrl, "manage_server");
}

export function canManageRoles(serverUrl: string): boolean {
  if (isServerOwner(serverUrl)) return true;
  return hasPermission(serverUrl, "manage_roles");
}

export function canManageChannels(serverUrl: string): boolean {
  if (isServerOwner(serverUrl)) return true;
  return hasPermission(serverUrl, "manage_channels");
}

export function canManageUsers(serverUrl: string): boolean {
  if (isServerOwner(serverUrl)) return true;
  return hasPermission(serverUrl, "manage_users");
}

export function canManageEmojis(serverUrl: string): boolean {
  if (isServerOwner(serverUrl)) return true;
  return hasPermission(serverUrl, "manage_server");
}
