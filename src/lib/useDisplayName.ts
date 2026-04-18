import { useEffect, useState, useRef } from "preact/hooks";
import { friendNicknames, usersByServer, serverUrl } from "../state";

export function useDisplayName(username: string, overrideServerUrl?: string): string {
  const [displayName, setDisplayName] = useState(() => getDisplayName(username, overrideServerUrl));
  const prevRef = useRef(displayName);

  useEffect(() => {
    const update = () => {
      const next = getDisplayName(username, overrideServerUrl);
      if (next !== prevRef.current) {
        prevRef.current = next;
        setDisplayName(next);
      }
    };
    const unsub1 = friendNicknames.subscribe(update);
    const sUrl = overrideServerUrl ?? serverUrl.value;
    const unsub2 = usersByServer.get(sUrl).subscribe(update);
    const unsub3 = overrideServerUrl
      ? () => {}
      : serverUrl.subscribe(() => {
          update();
        });
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [username, overrideServerUrl]);

  return displayName;
}

export function getDisplayName(username: string, overrideServerUrl?: string): string {
  const friendNick = friendNicknames.value[username];
  if (friendNick) return friendNick;
  const sUrl = overrideServerUrl ?? serverUrl.value;
  const serverUser = usersByServer.read(sUrl)?.[username.toLowerCase()];
  if (serverUser?.nickname) return serverUser.nickname;
  return username;
}

export function useUserColor(username: string, overrideServerUrl?: string): string | undefined {
  const [color, setColor] = useState<string | undefined>(() =>
    getUserColor(username, overrideServerUrl)
  );
  const prevRef = useRef(color);

  useEffect(() => {
    const update = () => {
      const next = getUserColor(username, overrideServerUrl);
      if (next !== prevRef.current) {
        prevRef.current = next;
        setColor(next);
      }
    };
    const sUrl = overrideServerUrl ?? serverUrl.value;
    const unsub1 = usersByServer.get(sUrl).subscribe(update);
    const unsub2 = overrideServerUrl
      ? () => {}
      : serverUrl.subscribe(() => {
          update();
        });
    return () => {
      unsub1();
      unsub2();
    };
  }, [username, overrideServerUrl]);

  return color;
}

function getUserColor(username: string, overrideServerUrl?: string): string | undefined {
  const sUrl = overrideServerUrl ?? serverUrl.value;
  return usersByServer.read(sUrl)?.[username.toLowerCase()]?.color ?? undefined;
}
