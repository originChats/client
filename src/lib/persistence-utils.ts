import { getOriginFS } from "../state";

const APP_DATA = "/application data/chats@mistium";

export async function loadJsonFile<T>(
  filename: string,
  defaultValue: T,
): Promise<T> {
  const originFS = getOriginFS();
  if (!originFS) return defaultValue;
  try {
    await originFS.loadIndex();
    const content = await originFS.readFileContent(`${APP_DATA}/${filename}`);
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

export async function saveJsonFile<T>(
  filename: string,
  data: T,
): Promise<void> {
  const originFS = getOriginFS();
  if (!originFS) return;
  try {
    await originFS.loadIndex();
    await originFS.writeFile(`${APP_DATA}/${filename}`, JSON.stringify(data));
  } catch (e) {
    console.warn(`[persistence-utils] Failed to save ${filename}:`, e);
  }
}
