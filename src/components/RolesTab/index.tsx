import { useEffect, useState, useCallback, useMemo } from "preact/hooks";
import { useSignalEffect } from "@preact/signals";
import {
  serverUrl,
  currentUser,
  usersByServer,
  rolesByServer,
} from "../../state";
import { wsSend } from "../../lib/websocket";
import { Icon } from "../Icon";
import { UserProfileCard } from "../UserProfile";
import { Header } from "../Header";
import styles from "./RolesTab.module.css";

interface RoleWithStatus {
  name: string;
  description: string;
  color: string | null;
  category: string | null;
  assigned: boolean;
  pending?: boolean;
}

interface RoleCategory {
  name: string;
  roles: RoleWithStatus[];
}

export function RolesTab() {
  const [roles, setRoles] = useState<RoleWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const sUrl = serverUrl.value;
  const myUsername = currentUser.value?.username;

  useSignalEffect(() => {
    const allRoles = rolesByServer.value[sUrl] || {};
    const serverUsers = usersByServer.value[sUrl] || {};
    const myRoles = myUsername
      ? serverUsers[myUsername.toLowerCase()]?.roles || []
      : [];

    const selfAssignable: RoleWithStatus[] = Object.entries(allRoles)
      .filter(([, role]) => (role as any).self_assignable === true)
      .map(([name, role]) => ({
        name,
        description: (role as any).description || "",
        color: (role as any).color || null,
        category: (role as any).category || null,
        assigned: myRoles.includes(name),
      }));

    setRoles(selfAssignable);
    setLoading(false);
  });

  useEffect(() => {
    wsSend({ cmd: "self_roles_list" }, sUrl);
  }, [sUrl]);

  const toggleRole = useCallback(
    (roleName: string, currentlyAssigned: boolean) => {
      setRoles((prev) =>
        prev.map((r) => (r.name === roleName ? { ...r, pending: true } : r)),
      );

      setRoles((prev) =>
        prev.map((r) =>
          r.name === roleName ? { ...r, assigned: !currentlyAssigned } : r,
        ),
      );

      const serverUsers = usersByServer.value[sUrl] || {};
      const lowerUser = myUsername?.toLowerCase() || "";
      const user = serverUsers[lowerUser];
      if (user) {
        if (!currentlyAssigned) {
          if (!user.roles) user.roles = [];
          if (!user.roles.includes(roleName)) {
            user.roles.push(roleName);
          }
        } else {
          if (user.roles) {
            user.roles = user.roles.filter((r) => r !== roleName);
          }
        }
        usersByServer.value = {
          ...usersByServer.value,
          [sUrl]: { ...serverUsers },
        };
      }

      if (currentlyAssigned) {
        wsSend({ cmd: "self_role_remove", role: roleName }, sUrl);
      } else {
        wsSend({ cmd: "self_role_add", role: roleName }, sUrl);
      }

      setRoles((prev) =>
        prev.map((r) => (r.name === roleName ? { ...r, pending: false } : r)),
      );
    },
    [sUrl, myUsername],
  );

  const categorizedRoles = useMemo(() => {
    const categories: RoleCategory[] = [];
    const uncategorized: RoleWithStatus[] = [];

    for (const role of roles) {
      if (role.category) {
        let cat = categories.find((c) => c.name === role.category);
        if (!cat) {
          cat = { name: role.category, roles: [] };
          categories.push(cat);
        }
        cat.roles.push(role);
      } else {
        uncategorized.push(role);
      }
    }

    return { categories, uncategorized };
  }, [roles]);

  if (loading) {
    return (
      <div className="main-content-wrapper">
        <Header />
        <div className="main-content-area">
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading roles...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content-wrapper">
      <Header />
      <div className="main-content-area">
        <div className={styles.rolesContainer}>
          <div className={styles.rolesContent}>
            <div className={styles.rolesHeader}>
              <h2>Self-Assignable Roles</h2>
              <p>Click a role to add or remove it from your profile</p>
            </div>
            {roles.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <Icon name="Shield" size={48} />
                </div>
                <div className={styles.emptyTitle}>No Roles Available</div>
                <div className={styles.emptyText}>
                  This server doesn't have any self-assignable roles yet.
                </div>
              </div>
            ) : (
              <div className={styles.rolesSections}>
                {categorizedRoles.categories.map((category) => (
                  <div key={category.name} className={styles.roleCategory}>
                    <div className={styles.categoryHeader}>
                      <span className={styles.categoryTitle}>
                        {category.name}
                      </span>
                    </div>
                    <div className={styles.rolesGrid}>
                      {category.roles.map((role) => (
                        <button
                          key={role.name}
                          className={`${styles.rolePill} ${role.assigned ? styles.assigned : ""}`}
                          style={
                            role.color
                              ? { "--role-color": role.color }
                              : undefined
                          }
                          onClick={() => toggleRole(role.name, role.assigned)}
                          disabled={role.pending}
                          title={role.description || role.name}
                        >
                          <span
                            className={styles.roleDot}
                            style={
                              role.color
                                ? { background: role.color }
                                : undefined
                            }
                          />
                          <span className={styles.roleName}>{role.name}</span>
                          {role.assigned && (
                            <span className={styles.checkIcon}>
                              <Icon name="Check" size={14} />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {categorizedRoles.uncategorized.length > 0 && (
                  <div className={styles.roleCategory}>
                    {categorizedRoles.categories.length > 0 && (
                      <div className={styles.categoryHeader}>
                        <span className={styles.categoryTitle}>Other</span>
                      </div>
                    )}
                    <div className={styles.rolesGrid}>
                      {categorizedRoles.uncategorized.map((role) => (
                        <button
                          key={role.name}
                          className={`${styles.rolePill} ${role.assigned ? styles.assigned : ""}`}
                          style={
                            role.color
                              ? { "--role-color": role.color }
                              : undefined
                          }
                          onClick={() => toggleRole(role.name, role.assigned)}
                          disabled={role.pending}
                          title={role.description || role.name}
                        >
                          <span
                            className={styles.roleDot}
                            style={
                              role.color
                                ? { background: role.color }
                                : undefined
                            }
                          />
                          <span className={styles.roleName}>{role.name}</span>
                          {role.assigned && (
                            <span className={styles.checkIcon}>
                              <Icon name="Check" size={14} />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={styles.previewPanel}>
            <div className={styles.previewHeader}>
              <Icon name="User" size={16} />
              <span>Your Profile</span>
            </div>
            <div className={styles.previewContent}>
              {myUsername ? (
                <UserProfileCard username={myUsername} compact />
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyText}>
                    Log in to see your profile preview
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
