import { ENTRY_SIZE, IDX } from "./fs-constants";

export async function prepareFolderEntries(
  dir: string,
  index: Record<string, string>,
  generateUUID: () => Promise<string>,
  formatPath: (p: string) => string
) {
  dir = dir.replace(/\/$/, "");
  if (!dir || dir === "/") {
    return [];
  }
  const parts = dir.split("/").filter((p) => p);
  const entries: {
    subPath: string;
    entry: any[];
    uuid: string;
    now: number;
  }[] = [];
  for (let i = 1; i <= parts.length; i++) {
    let subPath = "/" + parts.slice(0, i).join("/");
    subPath = subPath.toLowerCase();
    if (!index[subPath]) {
      const now = Date.now();
      const uuid = await generateUUID();
      const entry = new Array(ENTRY_SIZE);
      entry[IDX.TYPE] = ".folder";
      entry[IDX.NAME] = parts[i - 1];
      entry[IDX.LOCATION] = formatPath(parts.slice(0, i - 1).join("/"));
      entry[IDX.DATA] = [];
      entry[IDX.CREATED] = now;
      entry[IDX.EDITED] = now;
      entry[IDX.SIZE] = 0;
      entry[IDX.UUID] = uuid;
      entries.push({ subPath, entry, uuid, now });
    }
  }
  return entries;
}
