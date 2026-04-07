import { serverUrl, wsConnections } from "../state";

const pendingMessageFetchesByServer: Record<
  string,
  Record<string, boolean>
> = {};

export function wsSend(data: any, sUrl?: string): boolean {
  const url = sUrl || serverUrl.value;
  const conn = wsConnections[url];
  if (conn && conn.socket && conn.socket.readyState === WebSocket.OPEN) {
    conn.socket.send(JSON.stringify(data));
    return true;
  }
  return false;
}

export function finishMessageFetch(sUrl: string, channelName: string): void {
  if (pendingMessageFetchesByServer[sUrl]) {
    delete pendingMessageFetchesByServer[sUrl][channelName];
  }
}

export function startMessageFetch(sUrl: string, channelName: string): void {
  if (!pendingMessageFetchesByServer[sUrl]) {
    pendingMessageFetchesByServer[sUrl] = {};
  }
  pendingMessageFetchesByServer[sUrl][channelName] = true;
}

function isMessageFetching(sUrl: string, channelName: string): boolean {
  return pendingMessageFetchesByServer[sUrl]?.[channelName] ?? false;
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new window.AudioContext();
  }
  return audioCtx;
}

function playPingSound(
  type: "default" | "soft" | "bell" | "pop" | "none" | "custom" = "default",
  volume: number = 0.5,
): void {
  if (type === "none") return;

  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);

    if (type === "default") {
      osc.frequency.value = 800;
      osc.type = "sine";
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "soft") {
      osc.frequency.value = 520;
      osc.type = "sine";
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === "bell") {
      osc.frequency.value = 1200;
      osc.type = "triangle";
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } else if (type === "pop") {
      osc.frequency.value = 600;
      osc.type = "square";
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch (e) {
    console.warn("[Notification] Failed to play ping sound:", e);
  }
}
