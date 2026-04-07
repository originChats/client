import { serverUrl, wsConnections, wsStatus } from "../state";
import { dismissBanner } from "./ui-signals";

const reconnectBannerIds: Record<string, string> = {};

export function closeWebSocket(url: string): void {
  if (wsConnections[url]) {
    const conn = wsConnections[url];
    if (conn.socket) {
      if (conn.closeHandler)
        conn.socket.removeEventListener("close", conn.closeHandler);
      if (conn.errorHandler)
        conn.socket.removeEventListener("error", conn.errorHandler);
      if (conn.socket.readyState !== WebSocket.CLOSED) {
        conn.socket.close();
      }
    }
    delete wsConnections[url];
    delete wsStatus[url];
  }

  const bannerId = reconnectBannerIds[url] || `reconnect-${url}`;
  dismissBanner(bannerId);
  delete reconnectBannerIds[url];
}

