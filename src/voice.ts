import Peer from "peerjs";
import type { MediaConnection } from "peerjs";
import { signal } from "@preact/signals";
import { wsSend } from "./lib/ws-sender";
import {
  serverUrl,
  micThreshold as micThresholdSignal,
  voiceVideoRes,
  voiceVideoFps,
} from "./state";
import { showVoiceCallView } from "./lib/ui-signals";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceParticipant {
  username: string;
  peer_id: string;
  muted: boolean;
  speaking: boolean;
}

/** The type of a video stream — used to label inbound calls via metadata. */
type VideoKind = "screen" | "camera";

export interface VoiceState {
  currentChannel: string | null;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isSpeaking: boolean;
  micDenied: boolean;
  isScreenSharing: boolean;
  isCameraOn: boolean;
  /** peerId -> remote screen-share stream */
  screenStreams: Record<string, MediaStream>;
  /** peerId -> remote camera stream */
  cameraStreams: Record<string, MediaStream>;
  /** local screen-share stream for self-preview */
  localScreenStream: MediaStream | null;
  /** local camera stream for self-preview */
  localCameraStream: MediaStream | null;
}

const DEFAULT_STATE: VoiceState = {
  currentChannel: null,
  participants: [],
  isMuted: false,
  isSpeaking: false,
  micDenied: false,
  isScreenSharing: false,
  isCameraOn: false,
  screenStreams: {},
  cameraStreams: {},
  localScreenStream: null,
  localCameraStream: null,
};

/** Single observable snapshot of all voice state. Components subscribe to this. */
export const voiceState = signal<VoiceState>({ ...DEFAULT_STATE });

// ── Per-peer connection record ────────────────────────────────────────────────
//
// Inbound and outbound calls are tracked separately so that closing our own
// outbound video call never accidentally closes (or overwrites) a remote peer's
// inbound stream in the same slot.

interface PeerConn {
  // Outbound calls we initiated
  outAudioCall: MediaConnection | null;
  outScreenCall: MediaConnection | null;
  outCameraCall: MediaConnection | null;

  // Inbound calls the remote peer initiated (we answered)
  inAudioCall: MediaConnection | null;
  inScreenCall: MediaConnection | null;
  inCameraCall: MediaConnection | null;

  // Received streams (always from inbound calls)
  audioStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;

  // Retry timers for outbound video calls (setTimeout IDs)
  screenRetryTimer: ReturnType<typeof setTimeout> | null;
  cameraRetryTimer: ReturnType<typeof setTimeout> | null;
  // How many retry attempts so far (for backoff)
  screenRetryCount: number;
  cameraRetryCount: number;
}

function emptyPeerConn(): PeerConn {
  return {
    outAudioCall: null,
    outScreenCall: null,
    outCameraCall: null,
    inAudioCall: null,
    inScreenCall: null,
    inCameraCall: null,
    audioStream: null,
    screenStream: null,
    cameraStream: null,
    screenRetryTimer: null,
    cameraRetryTimer: null,
    screenRetryCount: 0,
    cameraRetryCount: 0,
  };
}

// Max retry attempts and backoff ceiling (ms) for outbound video calls
const VIDEO_RETRY_MAX = 6;
const VIDEO_RETRY_BASE_MS = 1500;
const VIDEO_RETRY_CAP_MS = 20_000;

// ── Speaking detection ────────────────────────────────────────────────────────

interface SpeakingDetector {
  ctx: AudioContext;
  frameId: number;
}

// ── Logging ───────────────────────────────────────────────────────────────────

function vcWarn(...args: unknown[]): void {
  console.warn("[Voice]", ...args);
}

// ── Voice Manager ─────────────────────────────────────────────────────────────

class VoiceManager {
  // PeerJS
  private _peer: Peer | null = null;
  private _peerReady: Promise<Peer> | null = null;

  // Local streams (each independently managed)
  private _localAudioStream: MediaStream | null = null;
  private _localScreenStream: MediaStream | null = null;
  private _localCameraStream: MediaStream | null = null;

  // Per-peer connection records
  private _peers = new Map<string, PeerConn>();

  // Periodic video health-check interval
  private _videoHealthInterval: ReturnType<typeof setInterval> | null = null;

  // Internal state
  private _currentChannel: string | null = null;
  private _myUsername: string | null = null;
  private _participants: VoiceParticipant[] = [];
  private _isMuted = false;
  private _isSpeaking = false;
  private _micDenied = false;

  // Speaking detection
  private _localDetector: SpeakingDetector | null = null;
  private _remoteDetectors = new Map<string, SpeakingDetector>();

  // ── Public read-only accessors ──────────────────────────────────────────────

  get currentChannel(): string | null {
    return this._currentChannel;
  }
  get isMuted(): boolean {
    return this._isMuted;
  }
  get isSpeaking(): boolean {
    return this._isSpeaking;
  }
  get localStream(): MediaStream | null {
    return this._localAudioStream;
  }

  // ── Join / Leave ────────────────────────────────────────────────────────────

  async joinChannel(
    channelName: string,
    myUsername?: string,
    channelType?: string,
  ): Promise<boolean> {
    if (this._currentChannel === channelName) {
      // For chat channels the embedded panel is always visible — toggling
      // fullscreen is handled by the expand button in the panel itself.
      if (channelType !== "chat") {
        showVoiceCallView.value = !showVoiceCallView.value;
      }
      return true;
    }

    if (this._currentChannel) {
      this.leaveChannel();
    }

    if (myUsername) this._myUsername = myUsername;

    // Acquire microphone
    this._micDenied = false;
    try {
      this._localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch {
      this._micDenied = true;
      // Create a silent stream so PeerJS always has something to send
      try {
        const ctx = new AudioContext();
        this._localAudioStream = ctx.createMediaStreamDestination().stream;
      } catch {
        this._localAudioStream = new MediaStream();
      }
    }

    // Initialize PeerJS
    let peer: Peer;
    try {
      peer = await this._initPeer();
    } catch (err) {
      vcWarn("PeerJS initialization failed", err);
      this._stopAudioStream();
      return false;
    }

    if (!peer.id) {
      vcWarn("No peer ID assigned");
      this._stopAudioStream();
      return false;
    }

    this._currentChannel = channelName;
    this._isMuted = this._micDenied;

    // Notify server — _currentChannel must be set first so onJoined() isn't
    // dropped if the server responds synchronously before we continue.
    wsSend(
      { cmd: "voice_join", channel: channelName, peer_id: peer.id },
      serverUrl.value,
    );

    // Show self immediately (don't wait for server response)
    if (this._myUsername && peer.id) {
      this._participants = [
        {
          username: this._myUsername,
          peer_id: peer.id,
          muted: this._isMuted,
          speaking: false,
        },
      ];
    }
    if (this._micDenied) {
      this._localAudioStream?.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
      wsSend({ cmd: "voice_mute" }, serverUrl.value);
    } else {
      this._startLocalSpeakingDetection();
    }

    // Start periodic health-check to catch silently dropped video calls
    this._startVideoHealthCheck();

    // For chat channels the embedded panel in MessageArea shows automatically;
    // for all other channel types open the fullscreen overlay.
    if (channelType !== "chat") {
      showVoiceCallView.value = true;
    }
    this._publish();
    return true;
  }

  leaveChannel(): void {
    if (!this._currentChannel) return;
    wsSend({ cmd: "voice_leave" }, serverUrl.value);
    this._cleanup();
    showVoiceCallView.value = false;
  }

  // ── Server event handlers ───────────────────────────────────────────────────

  onJoined(channel: string, participants: VoiceParticipant[]): void {
    if (this._currentChannel !== channel) return;

    this._participants = (participants || []).map((p) => ({
      ...p,
      speaking: false,
    }));

    // Call all existing participants (audio + any active video streams)
    for (const p of this._participants) {
      if (!p.peer_id || p.peer_id === this._peer?.id) continue;
      this._callPeerAudio(p.peer_id);
      this._pushVideoStreams(p.peer_id);
    }

    // Insert self at the front (server list does not include us)
    const myPeerId = this._peer?.id;
    if (myPeerId && !this._participants.find((p) => p.peer_id === myPeerId)) {
      this._participants.unshift({
        username: this._myUsername || "You",
        peer_id: myPeerId,
        muted: this._isMuted,
        speaking: this._isSpeaking,
      });
    }

    this._publish();
  }

  onUserJoined(
    channel: string,
    user: { username: string; peer_id: string; muted: boolean },
  ): void {
    if (this._currentChannel !== channel || !user.peer_id) return;

    if (!this._participants.find((p) => p.peer_id === user.peer_id)) {
      this._participants.push({
        username: user.username,
        peer_id: user.peer_id,
        muted: user.muted,
        speaking: false,
      });
    }

    // Call the new joiner with audio + push any active video streams.
    // miloclient always calls the new joiner from onUserJoined, so we must too
    // for cross-client compatibility. The dedup logic in _callPeerAudio and
    // _handleInboundCall guards against double-calling if they also call us.
    this._callPeerAudio(user.peer_id);
    this._pushVideoStreams(user.peer_id);
    this._publish();
  }

  onUserLeft(channel: string, username: string): void {
    if (this._currentChannel !== channel) return;

    const p = this._participants.find((x) => x.username === username);
    // Filter the participant list first so the subsequent _publish (inside
    // _detachPeer) already reflects the final state — no transient flicker.
    this._participants = this._participants.filter(
      (x) => x.username !== username,
    );
    if (p?.peer_id) this._detachPeer(p.peer_id);
    else this._publish(); // nothing to detach, still need a publish
  }

  onUserUpdated(
    channel: string,
    user: { username: string; peer_id?: string; muted: boolean },
  ): void {
    if (this._currentChannel !== channel) return;

    const p = this._participants.find(
      (x) =>
        (user.peer_id && x.peer_id === user.peer_id) ||
        x.username === user.username,
    );
    if (p) {
      p.muted = user.muted;
      if (user.username && p.username === "You") p.username = user.username;
    }
    this._publish();
  }

  // ── Controls ────────────────────────────────────────────────────────────────

  toggleMute(): void {
    this._isMuted = !this._isMuted;
    this._localAudioStream
      ?.getAudioTracks()
      .forEach((t) => (t.enabled = !this._isMuted));

    const me = this._selfParticipant();
    if (me) me.muted = this._isMuted;

    if (
      !wsSend(
        { cmd: this._isMuted ? "voice_mute" : "voice_unmute" },
        serverUrl.value,
      )
    ) {
      vcWarn("Failed to send mute state — WebSocket not open");
    }

    this._publish();
  }

  async toggleScreenShare(): Promise<void> {
    if (this._localScreenStream) {
      this._stopScreenShare();
      return;
    }

    const constraints = this._videoConstraints();
    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: constraints,
        audio: true,
      });
    } catch {
      vcWarn("Screen share cancelled or denied");
      return;
    }

    this._localScreenStream = stream;

    // Auto-cleanup when OS/browser ends the share
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener("ended", () => this._stopScreenShare(), {
        once: true,
      });
    }

    // Send to all remote peers
    this._broadcastVideo("screen", stream);
    this._publish();
  }

  async toggleCamera(): Promise<void> {
    if (this._localCameraStream) {
      this._stopCamera();
      return;
    }

    const constraints = this._videoConstraints();
    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: constraints,
        audio: false,
      });
    } catch {
      vcWarn("Camera access denied or unavailable");
      return;
    }

    this._localCameraStream = stream;

    // Auto-cleanup if track ends externally
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener("ended", () => this._stopCamera(), {
        once: true,
      });
    }

    // Send to all remote peers
    this._broadcastVideo("camera", stream);
    this._publish();
  }

  /** Re-acquire screen share with current quality settings. */
  async restartScreenShare(): Promise<void> {
    if (!this._localScreenStream) return;

    // Tear down current
    this._localScreenStream.getTracks().forEach((t) => t.stop());
    this._localScreenStream = null;
    this._closeVideoCalls("screen");

    // Re-acquire
    const constraints = this._videoConstraints();
    try {
      this._localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: constraints,
        audio: true,
      });
    } catch {
      vcWarn("Could not restart screen share");
      this._publish();
      return;
    }

    const videoTrack = this._localScreenStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener("ended", () => this._stopScreenShare(), {
        once: true,
      });
    }

    this._broadcastVideo("screen", this._localScreenStream);
    this._publish();
  }

  /** Re-acquire camera with current quality settings. */
  async restartCamera(): Promise<void> {
    if (!this._localCameraStream) return;

    this._localCameraStream.getTracks().forEach((t) => t.stop());
    this._localCameraStream = null;
    this._closeVideoCalls("camera");

    const constraints = this._videoConstraints();
    try {
      this._localCameraStream = await navigator.mediaDevices.getUserMedia({
        video: constraints,
        audio: false,
      });
    } catch {
      vcWarn("Could not restart camera");
      this._publish();
      return;
    }

    const videoTrack = this._localCameraStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener("ended", () => this._stopCamera(), {
        once: true,
      });
    }

    this._broadcastVideo("camera", this._localCameraStream);
    this._publish();
  }

  setMyUsername(username: string): void {
    this._myUsername = username;
    const me = this._selfParticipant();
    if (me) me.username = username;
    this._publish();
  }

  isInChannel(): boolean {
    return this._currentChannel !== null;
  }

  getMyPeerId(): string | null {
    return this._peer?.id ?? null;
  }

  // ── Private: stream lifecycle ───────────────────────────────────────────────

  private _stopAudioStream(): void {
    if (this._localAudioStream) {
      this._localAudioStream.getTracks().forEach((t) => t.stop());
      this._localAudioStream = null;
    }
  }

  private _stopScreenShare(): void {
    if (!this._localScreenStream) return;
    this._localScreenStream.getTracks().forEach((t) => t.stop());
    this._localScreenStream = null;
    this._closeVideoCalls("screen");
    this._publish();
  }

  private _stopCamera(): void {
    if (!this._localCameraStream) return;
    this._localCameraStream.getTracks().forEach((t) => t.stop());
    this._localCameraStream = null;
    this._closeVideoCalls("camera");
    this._publish();
  }

  /** Close all OUTBOUND video calls of a specific kind and cancel any retries. */
  private _closeVideoCalls(kind: VideoKind): void {
    const outKey = kind === "screen" ? "outScreenCall" : "outCameraCall";
    const timerKey =
      kind === "screen" ? "screenRetryTimer" : "cameraRetryTimer";
    const countKey =
      kind === "screen" ? "screenRetryCount" : "cameraRetryCount";
    for (const conn of this._peers.values()) {
      if (conn[timerKey] !== null) {
        clearTimeout(conn[timerKey]!);
        conn[timerKey] = null;
      }
      conn[countKey] = 0;
      if (conn[outKey]) {
        try {
          conn[outKey]!.close();
        } catch {}
        conn[outKey] = null;
      }
    }
  }

  /** Send a video stream to all remote peers. */
  private _broadcastVideo(kind: VideoKind, stream: MediaStream): void {
    if (!this._peer) return;
    const myPeerId = this._peer.id;
    for (const p of this._participants) {
      if (!p.peer_id || p.peer_id === myPeerId) continue;
      this._callPeerVideo(p.peer_id, kind, stream);
    }
  }

  /** Push any active video streams (screen + camera) to a specific peer. */
  private _pushVideoStreams(peerId: string): void {
    if (this._localScreenStream) {
      this._callPeerVideo(peerId, "screen", this._localScreenStream);
    }
    if (this._localCameraStream) {
      this._callPeerVideo(peerId, "camera", this._localCameraStream);
    }
  }

  // ── Private: PeerJS calls ───────────────────────────────────────────────────

  private _callPeerAudio(peerId: string): void {
    if (!this._peer || !this._localAudioStream) return;
    const conn = this._getConn(peerId);
    if (conn.outAudioCall) return; // already have an outbound audio call
    const call = this._peer.call(peerId, this._localAudioStream, {
      metadata: { kind: "audio" },
    });
    if (!call) return;
    conn.outAudioCall = call;
    this._onOutboundAudioStream(call);
  }

  private _callPeerVideo(
    peerId: string,
    kind: VideoKind,
    stream: MediaStream,
  ): void {
    if (!this._peer || this._peer.destroyed) return;

    // Verify the stream is still live — don't try to call with a dead stream.
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0 || videoTracks[0].readyState === "ended") {
      vcWarn(`_callPeerVideo(${kind}): stream already ended, skipping`);
      return;
    }

    const conn = this._getConn(peerId);
    const outKey = kind === "screen" ? "outScreenCall" : "outCameraCall";
    const timerKey =
      kind === "screen" ? "screenRetryTimer" : "cameraRetryTimer";
    const countKey =
      kind === "screen" ? "screenRetryCount" : "cameraRetryCount";

    // Cancel any pending retry for this kind — we're about to make a fresh call.
    if (conn[timerKey] !== null) {
      clearTimeout(conn[timerKey]!);
      conn[timerKey] = null;
    }

    // Close any existing OUTBOUND call of this kind (never touch inbound slots).
    if (conn[outKey]) {
      try {
        conn[outKey]!.close();
      } catch {}
      conn[outKey] = null;
    }

    const call = this._peer.call(peerId, stream, { metadata: { kind } });
    if (!call) {
      vcWarn(
        `_callPeerVideo(${kind}): peer.call() returned null for ${peerId}`,
      );
      this._scheduleVideoRetry(peerId, kind, stream);
      return;
    }
    conn[outKey] = call;

    // PeerJS fires "stream" on outbound calls when the answerer sends a stream
    // back. We don't use it (answerers send an empty stream) but listening keeps
    // the connection alive and lets us detect a successful ICE exchange.
    let iceEstablished = false;
    call.on("stream", () => {
      iceEstablished = true;
      // Reset retry counter — ICE succeeded.
      const c = this._peers.get(peerId);
      if (c) c[countKey] = 0;
    });

    call.on("close", () => {
      const c = this._peers.get(peerId);
      if (!c || c[outKey] !== call) return;
      c[outKey] = null;
      // If the stream is still live and we haven't explicitly stopped this
      // kind, schedule a retry so the remote sees the stream again.
      const localStream =
        kind === "screen" ? this._localScreenStream : this._localCameraStream;
      if (localStream && !this._peer?.destroyed) {
        vcWarn(`Outbound ${kind} call to ${peerId} closed — will retry`);
        this._scheduleVideoRetry(peerId, kind, localStream);
      }
    });

    call.on("error", (err) => {
      vcWarn(`Outbound ${kind} call error for ${peerId}:`, err);
      const c = this._peers.get(peerId);
      if (!c || c[outKey] !== call) return;
      c[outKey] = null;
      const localStream =
        kind === "screen" ? this._localScreenStream : this._localCameraStream;
      if (localStream && !this._peer?.destroyed) {
        this._scheduleVideoRetry(peerId, kind, localStream);
      }
    });
  }

  /**
   * Schedule a retry for a failed outbound video call, with exponential
   * backoff capped at VIDEO_RETRY_CAP_MS.  Gives up after VIDEO_RETRY_MAX
   * attempts (the remote may have left, or their client doesn't support it).
   */
  private _scheduleVideoRetry(
    peerId: string,
    kind: VideoKind,
    stream: MediaStream,
  ): void {
    const conn = this._peers.get(peerId);
    if (!conn) return; // peer was detached

    const timerKey =
      kind === "screen" ? "screenRetryTimer" : "cameraRetryTimer";
    const countKey =
      kind === "screen" ? "screenRetryCount" : "cameraRetryCount";

    if (conn[countKey] >= VIDEO_RETRY_MAX) {
      vcWarn(
        `Giving up ${kind} retries for ${peerId} after ${conn[countKey]} attempts`,
      );
      conn[countKey] = 0;
      return;
    }

    // Cancel any existing timer before scheduling a new one.
    if (conn[timerKey] !== null) {
      clearTimeout(conn[timerKey]!);
      conn[timerKey] = null;
    }

    const attempt = conn[countKey];
    const delay = Math.min(
      VIDEO_RETRY_BASE_MS * 2 ** attempt,
      VIDEO_RETRY_CAP_MS,
    );
    conn[countKey] += 1;

    vcWarn(
      `Scheduling ${kind} retry #${conn[countKey]} for ${peerId} in ${delay}ms`,
    );

    conn[timerKey] = setTimeout(() => {
      const c = this._peers.get(peerId);
      if (!c) return; // peer left while we were waiting
      c[timerKey] = null;

      // Confirm the stream is still live before retrying.
      const tracks = stream.getVideoTracks();
      if (tracks.length === 0 || tracks[0].readyState === "ended") {
        vcWarn(
          `${kind} stream ended before retry #${c[countKey]} for ${peerId}`,
        );
        c[countKey] = 0;
        return;
      }

      this._callPeerVideo(peerId, kind, stream);
    }, delay);
  }

  private _onOutboundAudioStream(call: MediaConnection): void {
    call.on("stream", (stream) => {
      // The remote peer answered our audio call — play their audio.
      // Guard against duplicate delivery: if we already have audio from their
      // inbound call, don't restart the element/detector.
      const conn = this._getConn(call.peer);
      if (conn.audioStream) return; // already receiving audio via inbound call
      conn.audioStream = stream;
      this._playAudio(call.peer, stream);
      this._startRemoteSpeakingDetection(call.peer, stream);
    });
    call.on("close", () => {
      // Outbound audio call closed — clean up audio only, keep the peer entry
      // and any video streams intact. A transient disconnect shouldn't wipe the
      // entire peer.
      const conn = this._peers.get(call.peer);
      if (conn && conn.outAudioCall === call) {
        conn.outAudioCall = null;
        conn.audioStream = null;
        document.getElementById("vcaudio-" + call.peer)?.remove();
        this._stopRemoteSpeakingDetection(call.peer);
        this._publish();
      }
    });
    call.on("error", () => {
      const conn = this._peers.get(call.peer);
      if (conn && conn.outAudioCall === call) {
        conn.outAudioCall = null;
        conn.audioStream = null;
        document.getElementById("vcaudio-" + call.peer)?.remove();
        this._stopRemoteSpeakingDetection(call.peer);
        this._publish();
      }
    });
  }

  // ── Private: PeerJS initialization ──────────────────────────────────────────

  private _initPeer(): Promise<Peer> {
    if (this._peer && !this._peer.destroyed && this._peerReady) {
      return this._peerReady;
    }

    // Discard any stale promise
    this._peerReady = null;

    this._peerReady = new Promise<Peer>((resolve, reject) => {
      try {
        const peer = new Peer({
          debug: 0,
          config: {
            iceServers: [
              {
                urls: "turn:free.expressturn.com:3478",
                username: "000000002088393795",
                credential: "82ycGu9kC/rKWJvfFicKScjmtxw=",
              },
            ],
            iceTransportPolicy: "relay",
          },
        });

        peer.on("open", () => {
          this._peer = peer;
          resolve(peer);
        });

        peer.on("error", (err) => {
          vcWarn("PeerJS error:", err);
          if (!this._peer) reject(err);
        });

        // Handle all inbound calls
        peer.on("call", (call) => this._handleInboundCall(call));
      } catch (err) {
        vcWarn("Failed to create Peer:", err);
        reject(err);
      }
    });

    return this._peerReady;
  }

  /**
   * Inbound call handler. Uses `call.metadata.kind` to determine the stream
   * type ("audio" | "screen" | "camera"). Falls back to track inspection
   * for backwards compatibility with peers that don't send metadata.
   */
  private _handleInboundCall(call: MediaConnection): void {
    if (!this._currentChannel) return;

    // Determine the call kind upfront from metadata so we can answer correctly.
    // Audio calls get our audio stream; video calls get an empty stream so the
    // remote client's video-call stream handler doesn't receive our audio and
    // misclassify it as a duplicate audio source.
    const meta = (call as any).metadata;
    const isVideoCall = meta?.kind === "screen" || meta?.kind === "camera";
    call.answer(
      isVideoCall
        ? new MediaStream()
        : (this._localAudioStream ?? new MediaStream()),
    );

    call.on("stream", (stream) => {
      const kind: VideoKind | "audio" = this._resolveStreamKind(call, stream);
      const conn = this._getConn(call.peer);

      switch (kind) {
        case "audio": {
          conn.inAudioCall = call;
          // Only use this inbound stream if we don't already have audio from
          // the outbound call's stream event. Both sides calling each other
          // (miloclient compatibility) means audio can arrive twice — first
          // delivery wins.
          if (!conn.audioStream) {
            conn.audioStream = stream;
            this._playAudio(call.peer, stream);
            this._startRemoteSpeakingDetection(call.peer, stream);
          }
          break;
        }
        case "screen": {
          conn.inScreenCall = call;
          conn.screenStream = stream;
          this._publish();
          break;
        }
        case "camera": {
          conn.inCameraCall = call;
          conn.cameraStream = stream;
          this._publish();
          break;
        }
      }
    });

    call.on("close", () => {
      const conn = this._peers.get(call.peer);
      if (!conn) return;

      // Match against inbound slots only — outbound slots are managed separately.
      if (conn.inScreenCall === call) {
        conn.inScreenCall = null;
        conn.screenStream = null;
        this._publish();
      } else if (conn.inCameraCall === call) {
        conn.inCameraCall = null;
        conn.cameraStream = null;
        this._publish();
      } else if (conn.inAudioCall === call) {
        // Inbound audio closed — clean up audio but keep peer in participant list.
        conn.inAudioCall = null;
        conn.audioStream = null;
        document.getElementById("vcaudio-" + call.peer)?.remove();
        this._stopRemoteSpeakingDetection(call.peer);
        this._publish();
      }
      // Unknown/stale call — ignore.
    });

    call.on("error", (err) => {
      vcWarn(`Inbound call error from ${call.peer}:`, err);
      this._detachPeer(call.peer);
    });
  }

  /**
   * Determine the kind of stream from call metadata, falling back to track
   * inspection for compatibility with older peers.
   */
  private _resolveStreamKind(
    call: MediaConnection,
    stream: MediaStream,
  ): VideoKind | "audio" {
    const meta = (call as any).metadata;
    if (meta?.kind === "screen" || meta?.kind === "camera") return meta.kind;
    if (meta?.kind === "audio") return "audio";

    // Fallback: if it has video tracks, assume screen share (legacy behaviour)
    if (stream.getVideoTracks().length > 0) return "screen";
    return "audio";
  }

  // ── Private: audio playback ─────────────────────────────────────────────────

  private _playAudio(peerId: string, stream: MediaStream): void {
    const id = "vcaudio-" + peerId;
    let el = document.getElementById(id) as HTMLAudioElement | null;
    if (!el) {
      el = document.createElement("audio");
      el.id = id;
      el.autoplay = true;
      el.style.display = "none";
      document.body.appendChild(el);
    }
    el.srcObject = stream;
  }

  // ── Private: peer management ────────────────────────────────────────────────

  private _getConn(peerId: string): PeerConn {
    if (!this._peers.has(peerId)) {
      this._peers.set(peerId, emptyPeerConn());
    }
    return this._peers.get(peerId)!;
  }

  private _selfParticipant(): VoiceParticipant | undefined {
    return this._participants.find((p) => p.peer_id === this._peer?.id);
  }

  private _detachPeer(peerId: string): void {
    const conn = this._peers.get(peerId);
    if (conn) {
      // Cancel any pending retry timers first
      if (conn.screenRetryTimer !== null) {
        clearTimeout(conn.screenRetryTimer);
        conn.screenRetryTimer = null;
      }
      if (conn.cameraRetryTimer !== null) {
        clearTimeout(conn.cameraRetryTimer);
        conn.cameraRetryTimer = null;
      }
      // Close all outbound calls
      try {
        conn.outAudioCall?.close();
      } catch {}
      try {
        conn.outScreenCall?.close();
      } catch {}
      try {
        conn.outCameraCall?.close();
      } catch {}
      // Close all inbound calls
      try {
        conn.inAudioCall?.close();
      } catch {}
      try {
        conn.inScreenCall?.close();
      } catch {}
      try {
        conn.inCameraCall?.close();
      } catch {}
      this._peers.delete(peerId);
    }

    document.getElementById("vcaudio-" + peerId)?.remove();
    this._stopRemoteSpeakingDetection(peerId);
    this._publish();
  }

  private _cleanup(): void {
    // Cancel all retry timers and close all peer connections (both directions)
    for (const conn of this._peers.values()) {
      if (conn.screenRetryTimer !== null) {
        clearTimeout(conn.screenRetryTimer);
        conn.screenRetryTimer = null;
      }
      if (conn.cameraRetryTimer !== null) {
        clearTimeout(conn.cameraRetryTimer);
        conn.cameraRetryTimer = null;
      }
      try {
        conn.outAudioCall?.close();
      } catch {}
      try {
        conn.outScreenCall?.close();
      } catch {}
      try {
        conn.outCameraCall?.close();
      } catch {}
      try {
        conn.inAudioCall?.close();
      } catch {}
      try {
        conn.inScreenCall?.close();
      } catch {}
      try {
        conn.inCameraCall?.close();
      } catch {}
    }
    this._peers.clear();

    // Stop all local streams
    this._stopAllLocalStreams();

    // Stop the video health-check
    this._stopVideoHealthCheck();

    // Remove all audio elements
    document.querySelectorAll('[id^="vcaudio-"]').forEach((el) => el.remove());

    // Stop all speaking detectors
    this._stopLocalSpeakingDetection();
    for (const peerId of this._remoteDetectors.keys()) {
      this._stopRemoteSpeakingDetection(peerId);
    }

    // Destroy peer
    if (this._peer) {
      try {
        this._peer.destroy();
      } catch {}
      this._peer = null;
    }
    this._peerReady = null;

    // Reset state
    this._currentChannel = null;
    this._myUsername = null;
    this._participants = [];
    this._isMuted = false;
    this._isSpeaking = false;
    this._micDenied = false;

    this._publish();
  }

  private _stopAllLocalStreams(): void {
    if (this._localScreenStream) {
      this._localScreenStream.getTracks().forEach((t) => t.stop());
      this._localScreenStream = null;
    }
    if (this._localCameraStream) {
      this._localCameraStream.getTracks().forEach((t) => t.stop());
      this._localCameraStream = null;
    }
    this._stopAudioStream();
  }

  // ── Video health-check ──────────────────────────────────────────────────────
  //
  // Every 8 seconds, scan all remote peers and re-push any video stream whose
  // outbound call slot is null (meaning the call was never made, silently
  // dropped, or closed without a "close" event firing).  This is a last-resort
  // safety net against silent ICE failures.

  private _startVideoHealthCheck(): void {
    this._stopVideoHealthCheck();
    this._videoHealthInterval = setInterval(() => {
      if (!this._peer || this._peer.destroyed) return;
      const myPeerId = this._peer.id;

      for (const p of this._participants) {
        if (!p.peer_id || p.peer_id === myPeerId) continue;
        const conn = this._peers.get(p.peer_id);

        if (this._localScreenStream) {
          const tracks = this._localScreenStream.getVideoTracks();
          const alive = tracks.length > 0 && tracks[0].readyState !== "ended";
          const missing = !conn?.outScreenCall && !conn?.screenRetryTimer;
          if (alive && missing) {
            vcWarn(`Health-check: re-pushing screen to ${p.peer_id}`);
            this._callPeerVideo(p.peer_id, "screen", this._localScreenStream);
          }
        }

        if (this._localCameraStream) {
          const tracks = this._localCameraStream.getVideoTracks();
          const alive = tracks.length > 0 && tracks[0].readyState !== "ended";
          const missing = !conn?.outCameraCall && !conn?.cameraRetryTimer;
          if (alive && missing) {
            vcWarn(`Health-check: re-pushing camera to ${p.peer_id}`);
            this._callPeerVideo(p.peer_id, "camera", this._localCameraStream);
          }
        }
      }
    }, 8_000);
  }

  private _stopVideoHealthCheck(): void {
    if (this._videoHealthInterval !== null) {
      clearInterval(this._videoHealthInterval);
      this._videoHealthInterval = null;
    }
  }

  // ── Speaking detection ──────────────────────────────────────────────────────

  private _startLocalSpeakingDetection(): void {
    if (!this._localAudioStream) return;
    this._stopLocalSpeakingDetection();

    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(this._localAudioStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const check = () => {
        if (!this._localDetector) return;
        try {
          analyser.getByteFrequencyData(data);
          const avg =
            (data.reduce((a, b) => a + b, 0) / data.length) * (100 / 255);
          const speaking = avg > micThresholdSignal.value && !this._isMuted;
          if (speaking !== this._isSpeaking) {
            this._isSpeaking = speaking;
            const me = this._selfParticipant();
            if (me) me.speaking = speaking;
            this._publish();
          }
        } catch {}
        this._localDetector!.frameId = requestAnimationFrame(check);
      };

      const frameId = requestAnimationFrame(check);
      this._localDetector = { ctx, frameId };
    } catch (e) {
      vcWarn("Local speaking detection failed:", e);
    }
  }

  private _stopLocalSpeakingDetection(): void {
    if (this._localDetector) {
      cancelAnimationFrame(this._localDetector.frameId);
      try {
        this._localDetector.ctx.close();
      } catch {}
      this._localDetector = null;
    }
    this._isSpeaking = false;
  }

  private _startRemoteSpeakingDetection(
    peerId: string,
    stream: MediaStream,
  ): void {
    this._stopRemoteSpeakingDetection(peerId);

    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const det: SpeakingDetector = { ctx, frameId: 0 };

      const check = () => {
        if (!this._remoteDetectors.has(peerId)) return;
        try {
          analyser.getByteFrequencyData(data);
          const avg =
            (data.reduce((a, b) => a + b, 0) / data.length) * (100 / 255);
          const speaking = avg > 15;
          const participant = this._participants.find(
            (p) => p.peer_id === peerId,
          );
          if (participant && participant.speaking !== speaking) {
            participant.speaking = speaking;
            this._publish();
          }
        } catch {}
        det.frameId = requestAnimationFrame(check);
      };

      det.frameId = requestAnimationFrame(check);
      this._remoteDetectors.set(peerId, det);
    } catch (e) {
      vcWarn("Remote speaking detection failed:", e);
    }
  }

  private _stopRemoteSpeakingDetection(peerId: string): void {
    const det = this._remoteDetectors.get(peerId);
    if (det) {
      cancelAnimationFrame(det.frameId);
      try {
        det.ctx.close();
      } catch {}
      this._remoteDetectors.delete(peerId);
    }
  }

  // ── Private: video constraints ──────────────────────────────────────────────

  private _videoConstraints(): MediaTrackConstraints {
    const h = voiceVideoRes.value;
    const w =
      h >= 2160
        ? 3840
        : h >= 1440
          ? 2560
          : h >= 1080
            ? 1920
            : h >= 720
              ? 1280
              : 854;
    const fps = voiceVideoFps.value;
    return {
      width: { ideal: w },
      height: { ideal: h },
      frameRate: { ideal: fps, max: fps },
    };
  }

  // ── Private: publish state ──────────────────────────────────────────────────

  private _publish(): void {
    const screenStreams: Record<string, MediaStream> = {};
    const cameraStreams: Record<string, MediaStream> = {};

    for (const [peerId, conn] of this._peers) {
      if (conn.screenStream) screenStreams[peerId] = conn.screenStream;
      if (conn.cameraStream) cameraStreams[peerId] = conn.cameraStream;
    }

    voiceState.value = {
      currentChannel: this._currentChannel,
      participants: [...this._participants],
      isMuted: this._isMuted,
      isSpeaking: this._isSpeaking,
      micDenied: this._micDenied,
      isScreenSharing: !!this._localScreenStream,
      isCameraOn: !!this._localCameraStream,
      screenStreams,
      cameraStreams,
      localScreenStream: this._localScreenStream,
      localCameraStream: this._localCameraStream,
    };
  }
}

export const voiceManager = new VoiceManager();
