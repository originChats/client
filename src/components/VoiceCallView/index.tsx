import { useState } from "preact/hooks";
import { currentUserByServer, serverUrl } from "../../state";
import { showVoiceCallView } from "../../lib/ui-signals";
import { voiceState, voiceManager } from "../../voice";
import { Icon } from "../Icon";
import { UserAvatar } from "../UserAvatar";
import styles from "./VoiceCallView.module.css";

interface VoiceCallViewProps {
  embedded?: boolean;
}

interface FullscreenVideo {
  stream: MediaStream;
  label: string;
  isCamera?: boolean;
}

export function VoiceCallView({ embedded = false }: VoiceCallViewProps) {
  const state = voiceState.value;
  const [fullscreenVideo, setFullscreenVideo] = useState<FullscreenVideo | null>(null);

  const myUsername = currentUserByServer.value[serverUrl.value]?.username || "You";

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

  const selfPeerId = voiceManager.getMyPeerId();

  const rootClass = embedded
    ? `${styles.voiceCallView} ${styles.voiceCallViewEmbedded}`
    : styles.voiceCallView;

  const getVideoStream = (peerId: string): { stream: MediaStream; isCamera: boolean } | null => {
    if (cameraStreams[peerId]) {
      return { stream: cameraStreams[peerId], isCamera: true };
    }
    if (screenStreams[peerId]) {
      return { stream: screenStreams[peerId], isCamera: false };
    }
    return null;
  };

  const getSelfVideoStream = (): { stream: MediaStream; isCamera: boolean } | null => {
    if (localCameraStream) {
      return { stream: localCameraStream, isCamera: true };
    }
    if (localScreenStream) {
      return { stream: localScreenStream, isCamera: false };
    }
    return null;
  };

  if (fullscreenVideo) {
    return (
      <div className={styles.voiceCallView}>
        <div className={styles.voiceCallHeader}>
          <div className={styles.voiceCallHeaderLeft}>
            <Icon name="Mic" size={20} />
            <span className={styles.voiceCallChannelName}>{channel}</span>
          </div>
          <button
            className={styles.voiceCallBackBtn}
            onClick={() => setFullscreenVideo(null)}
            title="Back to grid"
          >
            <Icon name="ArrowLeft" size={18} />
          </button>
        </div>
        <div className={styles.voiceCallFullscreenVideo}>
          <video
            ref={(el) => {
              if (el && el.srcObject !== fullscreenVideo.stream) {
                el.srcObject = fullscreenVideo.stream;
              }
            }}
            autoPlay
            playsInline
            className={fullscreenVideo.isCamera ? styles.videoCameraMirror : ""}
          />
          <div className={styles.voiceCallVideoLabel}>
            <span>{fullscreenVideo.label}</span>
          </div>
        </div>
        <VoiceCallFooter
          isMuted={isMuted}
          isCameraOn={isCameraOn}
          isScreenSharing={isScreenSharing}
        />
      </div>
    );
  }

  return (
    <div className={rootClass} {...(embedded ? { "data-voice-call-embedded": true } : {})}>
      <div className={styles.voiceCallHeader}>
        <div className={styles.voiceCallHeaderLeft}>
          <Icon name="Mic" size={20} />
          <span className={styles.voiceCallChannelName}>{channel}</span>
          <span className={styles.voiceCallParticipantCount}>
            {participants.length} participant{participants.length !== 1 ? "s" : ""}
          </span>
        </div>
        {embedded && (
          <button
            className={styles.voiceCallBackBtn}
            onClick={() => (showVoiceCallView.value = true)}
            title="Expand"
          >
            <Icon name="Maximize2" size={18} />
          </button>
        )}
      </div>

      <div className={styles.voiceCallGrid}>
        {participants.map((p) => {
          const isSelf = (selfPeerId && p.peer_id === selfPeerId) || p.username === myUsername;
          const speaking = isSelf ? isSpeaking : p.speaking;
          const muted = isSelf ? isMuted : p.muted;
          const displayName = isSelf ? myUsername : p.username;

          const videoInfo = isSelf ? getSelfVideoStream() : getVideoStream(p.peer_id);
          const hasVideo = !!videoInfo;

          const handleClick = () => {
            if (hasVideo && videoInfo) {
              setFullscreenVideo({
                stream: videoInfo.stream,
                label: displayName,
                isCamera: videoInfo.isCamera,
              });
            }
          };

          return (
            <div
              key={p.peer_id}
              className={`${styles.voiceCallGridItem} ${speaking ? styles.speaking : ""} ${hasVideo ? styles.hasVideo : ""}`}
              onClick={handleClick}
            >
              {hasVideo && videoInfo ? (
                <>
                  <video
                    ref={(el) => {
                      if (el && el.srcObject !== videoInfo.stream) {
                        el.srcObject = videoInfo.stream;
                      }
                    }}
                    autoPlay
                    muted={isSelf}
                    playsInline
                    className={`${styles.voiceCallGridVideo} ${videoInfo.isCamera ? styles.videoCameraMirror : ""}`}
                  />
                  <div className={styles.voiceCallGridOverlay}>
                    <UserAvatar
                      username={displayName}
                      alt={displayName}
                      className={styles.voiceCallGridOverlayAvatar}
                    />
                    <span className={styles.voiceCallGridOverlayName}>{displayName}</span>
                  </div>
                </>
              ) : (
                <div className={styles.voiceCallGridAvatar}>
                  <UserAvatar
                    username={displayName}
                    alt={displayName}
                    className={styles.voiceCallGridAvatarImg}
                  />
                  <span className={styles.voiceCallGridName}>{displayName}</span>
                </div>
              )}
              <div className={styles.voiceCallGridMute}>
                <Icon name={muted ? "MicOff" : "Mic"} size={14} />
              </div>
            </div>
          );
        })}
      </div>

      <VoiceCallFooter
        isMuted={isMuted}
        isCameraOn={isCameraOn}
        isScreenSharing={isScreenSharing}
      />
    </div>
  );
}

function VoiceCallFooter({
  isMuted,
  isCameraOn,
  isScreenSharing,
}: {
  isMuted: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
}) {
  return (
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
  );
}
