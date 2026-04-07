import { useSignalEffect } from "@preact/signals";
import { friendRequests, servers, token } from "../../state";
import {
  selectRelationshipsChannel,
  selectChannel,
  selectDiscoveryChannel,
  switchServer,
} from "../../lib/actions";
import { Icon } from "../Icon";
import { Header } from "../Header";

export function DMHomeTab() {
  useSignalEffect(() => {
    friendRequests.value;
  });

  const hasToken = !!token.value;

  return (
    <div className="dm-home-container">
      <Header />
      <div className="home-content">
        <div className="home-heading-icon">
          <Icon name="Home" size={64} />
        </div>
        <h2 className="home-heading-title">Welcome Home</h2>
        <p className="home-heading-subtitle">What would you like to do?</p>
        <div className="home-options-grid">
          {hasToken && (
            <div
              className="home-option-card"
              onClick={() => selectRelationshipsChannel()}
            >
              <div className="home-option-icon">
                <Icon name="Users" size={20} />
              </div>
              <h3 className="home-option-title">
                Manage Relationships
                {friendRequests.value.length > 0 && (
                  <span className="dm-home-card-badge">
                    {friendRequests.value.length}
                  </span>
                )}
              </h3>
              <p className="home-option-description">
                View and manage your friends
              </p>
            </div>
          )}

          {hasToken && (
            <div
              className="home-option-card"
              onClick={() =>
                selectChannel({
                  name: "new_message",
                  type: "new_message",
                  display_name: "New Message",
                })
              }
            >
              <div className="home-option-icon">
                <Icon name="UserPlus" size={20} />
              </div>
              <h3 className="home-option-title">Create DM</h3>
              <p className="home-option-description">
                Start a new conversation
              </p>
            </div>
          )}

          <div
            className="home-option-card"
            onClick={() => selectDiscoveryChannel()}
          >
            <div className="home-option-icon">
              <Icon name="Compass" size={20} />
            </div>
            <h3 className="home-option-title">Discover Servers</h3>
            <p className="home-option-description">
              Browse and join public servers
            </p>
          </div>

          <div
            className="home-option-card"
            onClick={async () => {
              const url = prompt("Enter server URL to join:");
              if (url && url.trim()) {
                const trimmed = url.trim();
                if (trimmed === "dms.mistium.com") return;
                const existing = servers.value;
                if (!existing.find((s: any) => s.url === trimmed)) {
                  servers.value = [
                    ...existing,
                    { name: trimmed, url: trimmed, icon: null },
                  ];
                  try {
                    const { saveServers } =
                      await import("../../lib/persistence");
                    await saveServers();
                  } catch (err) {
                    console.error("Failed to save servers:", err);
                  }
                }
                await switchServer(trimmed);
              }
            }}
          >
            <div className="home-option-icon">
              <Icon name="PlusCircle" size={20} />
            </div>
            <h3 className="home-option-title">Join Server</h3>
            <p className="home-option-description">Connect to a new server</p>
          </div>
        </div>
      </div>
    </div>
  );
}
