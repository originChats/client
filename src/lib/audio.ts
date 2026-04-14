import { pingSound, pingVolume, customPingSound } from "../state";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new window.AudioContext();
  return audioCtx;
}

function cleanupAudioContext(): void {
  if (audioCtx && audioCtx.state !== "closed") {
    audioCtx.close();
    audioCtx = null;
  }
}

export function playPingSound(): void {
  if (document.hidden) return;
  const type = pingSound.value;
  if (type === "none") return;
  const volume = pingVolume.value;

  if (type === "custom") {
    const dataUri = customPingSound.value;
    if (!dataUri) return;
    try {
      const audio = new Audio(dataUri);
      audio.volume = volume;
      audio.play().catch(() => {});
    } catch (e) {
      console.warn("[Notification] Failed to play custom ping:", e);
    }
    return;
  }

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
      osc.frequency.value = 600;
      osc.type = "sine";
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else {
      osc.frequency.value = 1000;
      osc.type = "square";
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) {
    console.warn("[Notification] Failed to play ping:", e);
  }
}
