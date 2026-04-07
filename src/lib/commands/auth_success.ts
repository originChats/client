import {
  serverCapabilitiesByServer,
  readTimesByServer,
  DM_SERVER_URL,
} from "../../state";
import { wsSend } from "../ws-sender";
import { readTimes as dbReadTimes } from "../db";

export function handleAuthSuccess(sUrl: string): void {
  const caps = serverCapabilitiesByServer.value[sUrl] ?? [];
  const serverHas = (cap: string) => caps.includes(cap);
  wsSend({ cmd: "channels_get" }, sUrl);
  wsSend({ cmd: "users_list" }, sUrl);
  wsSend({ cmd: "users_online" }, sUrl);
  if (serverHas("roles_list")) wsSend({ cmd: "roles_list" }, sUrl);
  if (serverHas("slash_list")) wsSend({ cmd: "slash_list" }, sUrl);
  if (serverHas("emoji_get_all")) wsSend({ cmd: "emoji_get_all" }, sUrl);
  if (sUrl !== DM_SERVER_URL && serverHas("pings_get")) {
    const channelReadTimes = readTimesByServer.value[sUrl];
    if (!channelReadTimes || Object.keys(channelReadTimes).length === 0) {
      dbReadTimes.get(sUrl).then((times) => {
        if (times && Object.keys(times).length > 0) {
          readTimesByServer.value = {
            ...readTimesByServer.value,
            [sUrl]: times,
          };
        }
      });
    }
  }
}
