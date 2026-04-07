import { useEffect, useState } from "preact/hooks";
import { friendNicknames, usersByServer, serverUrl } from "../state";

export function useDisplayName(
  username: string,
  overrideServerUrl?: string,
): string {
  const [displayName, setDisplayName] = useState(() =>
    getDisplayName(username, overrideServerUrl),
  );

  useEffect(() => {
    const update = () =>
      setDisplayName(getDisplayName(username, overrideServerUrl));

    const unsub1 = friendNicknames.subscribe(update);
    const unsub2 = usersByServer.subscribe(update);

    return () => {
      unsub1();
      unsub2();
    };
  }, [username, overrideServerUrl]);

  return displayName;
}

export function getDisplayName(
  username: string,
  overrideServerUrl?: string,
): string {
  const friendNick = friendNicknames.value[username];
  if (friendNick) return friendNick;

  const sUrl = overrideServerUrl ?? serverUrl.value;
  const serverUser = usersByServer.value[sUrl]?.[username.toLowerCase()];
  if (serverUser?.nickname) return serverUser.nickname;

  return username;
}

export function useUserColor(
  username: string,
  overrideServerUrl?: string,
): string | undefined {
  const [color, setColor] = useState<string | undefined>(() =>
    getUserColor(username, overrideServerUrl),
  );

  useEffect(() => {
    const update = () => setColor(getUserColor(username, overrideServerUrl));

    const unsub = usersByServer.subscribe(update);
    return unsub;
  }, [username, overrideServerUrl]);

  return color;
}

function getUserColor(
  username: string,
  overrideServerUrl?: string,
): string | undefined {
  const sUrl = overrideServerUrl ?? serverUrl.value;
  return (
    usersByServer.value[sUrl]?.[username.toLowerCase()]?.color ?? undefined
  );
}
