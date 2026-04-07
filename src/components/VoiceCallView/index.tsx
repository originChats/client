import { currentUserByServer, serverUrl } from "../../state";
import { showVoiceCallView } from "../../lib/ui-signals";
import { voiceState, voiceManager } from "../../voice";
import { Icon } from "../Icon";
import { avatarUrl } from "../../utils";
import styles from "./VoiceCallView.module.css";

interface VoiceCallViewProps {
  /**
   * When true the component renders in its embedded "split" mode inside the
   * message area.  The minimize button is replaced by a fullscreen-expand
   * button that sets showVoiceCallView = true to promote it to fullscreen.
   * When false (default) it renders as the fullscreen takeover view.
   */
  embedded?: boolean;
}

export function VoiceCallView({ embedded = false }: VoiceCallViewProps) {
  const state = voiceState.value;

  const myUsername =
    currentUserByServer.value[serverUrl.value]?.username || "You";

  const {
    currentChannel: channel,
    participants,
    isMuted,
    isSpeaking,
    isScreenSharing,
    isCameraOn,
    screenStreams,
    cameraStreams,
    localScreenStream,
    localCameraStream,
  } = state;

  const hasVideoStreams =
    Object.keys(screenStreams).length > 0 ||
    Object.keys(cameraStreams).length > 0 ||
    isScreenSharing ||
    isCameraOn;

  const selfPeerId = voiceManager.getMyPeerId();

  const rootClass = embedded
    ? `${styles.voiceCallView} ${styles.voiceCallViewEmbedded}`
    : styles.voiceCallView;

  return (
    <div
      className={rootClass}
      {...(embedded ? { "data-voice-call-embedded": true } : {})}
    >
      <div className={styles.voiceCallHeader}>
        <div className={styles.voiceCallHeaderLeft}>
          <Icon name="Mic" size={20} />
          <span className={styles.voiceCallChannelName}>{channel}</span>
          <span className={styles.voiceCallParticipantCount}>
            {participants.length} participant
            {participants.length !== 1 ? "s" : ""}
          </span>
        </div>
        {embedded ? (
          <button
            className={styles.voiceCallMinimizeBtn}
            onClick={() => (showVoiceCallView.value = true)}
            title="Expand to fullscreen"
          >
            <Icon name="Maximize2" size={18} />
          </button>
        ) : (
          <button
            className={styles.voiceCallMinimizeBtn}
            onClick={() => (showVoiceCallView.value = false)}
            title="Minimize"
          >
            <Icon name="Minimize2" size={18} />
          </button>
        )}
      </div>

      {hasVideoStreams && (
        <div className={styles.voiceCallVideoArea}>
          {isScreenSharing && localScreenStream && (
            <VideoTile
              stream={localScreenStream}
              label={`${myUsername} (Screen)`}
              muted
              isSelf
            />
          )}

          {isCameraOn && localCameraStream && (
            <VideoTile
              stream={localCameraStream}
              label={`${myUsername} (Camera)`}
              muted
              isSelf
              isCamera
            />
          )}

          {Object.entries(screenStreams).map(([peerId, stream]) => {
            const p = participants.find((x) => x.peer_id === peerId);
            return (
              <VideoTile
                key={`screen-${peerId}`}
                stream={stream}
                label={`${p?.username || peerId} (Screen)`}
              />
            );
          })}

          {Object.entries(cameraStreams).map(([peerId, stream]) => {
            const p = participants.find((x) => x.peer_id === peerId);
            return (
              <VideoTile
                key={`camera-${peerId}`}
                stream={stream}
                label={p?.username || peerId}
                isCamera
              />
            );
          })}
        </div>
      )}

      <div
        className={`${styles.voiceCallParticipants} ${hasVideoStreams ? styles.compact : ""}`}
      >
        {participants.map((p) => {
          const isSelf =
            (selfPeerId && p.peer_id === selfPeerId) ||
            p.username === myUsername;
          const speaking = isSelf ? isSpeaking : p.speaking;
          const muted = isSelf ? isMuted : p.muted;
          const displayName = isSelf ? `${myUsername} (You)` : p.username;

          return (
            <div
              key={p.peer_id}
              className={`${styles.voiceCallTile} ${speaking ? styles.speaking : ""} ${muted ? styles.muted : ""}`}
            >
              <div className={styles.voiceCallTileAvatarWrap}>
                <div
                  className={`${styles.voiceCallTileSpeakingRing} ${speaking ? styles.active : ""}`}
                />
                <img
                  src={avatarUrl(isSelf ? myUsername : p.username)}
                  alt={displayName}
                  className={styles.voiceCallTileAvatar}
                />
              </div>
              <div className={styles.voiceCallTileName}>{displayName}</div>
              <div className={styles.voiceCallTileStatus}>
                <Icon name={muted ? "MicOff" : "Mic"} size={14} />
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.voiceCallControls}>
        <button
          className={`${styles.voiceCallControlBtn} ${isMuted ? styles.muted : ""}`}
          onClick={() => voiceManager.toggleMute()}
          title={isMuted ? "Unmute" : "Mute"}
        >
          <Icon name={isMuted ? "MicOff" : "Mic"} size={22} />
        </button>
        <button
          className={`${styles.voiceCallControlBtn} ${isCameraOn ? styles.active : ""}`}
          onClick={() => voiceManager.toggleCamera()}
          title={isCameraOn ? "Turn Off Camera" : "Turn On Camera"}
        >
          <Icon name={isCameraOn ? "VideoOff" : "Video"} size={22} />
        </button>
        <button
          className={`${styles.voiceCallControlBtn} ${isScreenSharing ? styles.active : ""}`}
          onClick={() => voiceManager.toggleScreenShare()}
          title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
        >
          <Icon name={isScreenSharing ? "MonitorOff" : "Monitor"} size={22} />
        </button>
        <button
          className={`${styles.voiceCallControlBtn} ${styles.danger}`}
          onClick={() => voiceManager.leaveChannel()}
          title="Disconnect"
        >
          <Icon name="PhoneOff" size={22} />
        </button>
      </div>
    </div>
  );
}

function VideoTile({
  stream,
  label,
  muted,
  isSelf,
  isCamera,
}: {
  stream: MediaStream;
  label: string;
  muted?: boolean;
  isSelf?: boolean;
  isCamera?: boolean;
}) {
  const classes = [
    styles.voiceCallVideoTile,
    isSelf && styles.voiceCallVideoSelf,
    isCamera && styles.voiceCallVideoCamera,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <video
        ref={(el) => {
          if (el && el.srcObject !== stream) el.srcObject = stream;
        }}
        autoPlay
        muted={!!muted}
        playsInline
        className={styles.voiceCallVideoElement}
      />
      <div className={styles.voiceCallVideoLabel}>
        <span>{label}</span>
      </div>
    </div>
  );
}
