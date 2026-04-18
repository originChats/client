import { Icon } from "../Icon";
import { voiceManager, voiceState } from "../../voice";
import { currentChannel, serverUrl, currentUserByServer } from "../../state";

interface CallButtonProps {
  /** CSS class applied to the button element */
  className?: string;
  /** Icon size passed to <Icon> */
  iconSize?: number;
}

export function CallButton({ className = "header-btn", iconSize }: CallButtonProps) {
  const ch = currentChannel.value;
  const voice = voiceState.value;
  const myUsername = currentUserByServer.read(serverUrl.value)?.username;
  const inCallHere = ch !== null && ch.type === "chat" && voice.currentChannel === ch.name;

  const handleClick = () => {
    if (!ch) return;
    if (inCallHere) {
      voiceManager.leaveChannel();
    } else {
      voiceManager.joinChannel(ch.name, myUsername, ch.type);
    }
  };

  return (
    <button
      className={`${className}${inCallHere ? " active" : ""}`}
      onClick={handleClick}
      aria-label={inCallHere ? "Open call" : "Start call"}
      title={inCallHere ? "Open call" : "Start call"}
    >
      <Icon name={inCallHere ? "PhoneCall" : "Phone"} size={iconSize} />
    </button>
  );
}
