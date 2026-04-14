import type { MediaServer } from "@/types";
import { mediaServersDb } from "./db";
import { generateValidator } from "./rotur-api";

const DEFAULT_ROTUR_PHOTOS_CONFIG: MediaServer = {
  id: "roturphotos",
  name: "roturPhotos",
  enabled: true,
  uploadUrl: "https://photos.rotur.dev/api/image/upload",
  method: "POST",
  headers: [],
  bodyParams: [],
  responseUrlPath: "$.path",
  urlTemplate: "https://photos.rotur.dev/{id}",
  requiresAuth: true,
  authType: "session",
};

let mediaServers: MediaServer[] = [];
let mediaServersLoaded: Promise<void>;
let roturPhotosSessionId = null as string | null;

async function loadMediaServers(): Promise<void> {
  const saved = await mediaServersDb.get<MediaServer[]>();
  if (saved && saved.length > 0) {
    mediaServers = saved;
  } else {
    mediaServers = [DEFAULT_ROTUR_PHOTOS_CONFIG];
    await saveMediaServers();
  }
}

async function saveMediaServers(): Promise<void> {
  await mediaServersDb.set(mediaServers);
}

export async function getEnabledMediaServer(): Promise<MediaServer> {
  await mediaServersLoaded;
  return mediaServers.find((s) => s.enabled) || mediaServers[0]!;
}

export function getMediaServers(): MediaServer[] {
  return [...mediaServers];
}

function getMediaServerById(id: string): MediaServer | undefined {
  return mediaServers.find((s) => s.id === id);
}

export async function addMediaServer(config: MediaServer): Promise<void> {
  await mediaServersLoaded;
  const index = mediaServers.findIndex((s) => s.id === config.id);
  if (config.enabled) {
    mediaServers.forEach((s) => (s.enabled = false));
  }
  if (index >= 0) {
    mediaServers[index] = { ...mediaServers[index], ...config };
  } else {
    mediaServers.push(config);
  }
  await saveMediaServers();
}

export async function deleteMediaServer(id: string): Promise<void> {
  await mediaServersLoaded;
  const index = mediaServers.findIndex((s) => s.id === id);
  if (index >= 0) {
    mediaServers.splice(index, 1);
    if (mediaServers.length === 0) {
      mediaServers = [DEFAULT_ROTUR_PHOTOS_CONFIG];
    }
    await saveMediaServers();
  }
}

export async function setMediaServerEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  await mediaServersLoaded;
  const server = getMediaServerById(id);
  if (server) {
    if (enabled) {
      mediaServers.forEach((s) => (s.enabled = false));
    }
    server.enabled = enabled;
    await saveMediaServers();
  }
}

async function initRoturPhotosAuth(): Promise<boolean> {
  try {
    const validator = await generateValidator("rotur-photos");

    const response = await fetch(
      `https://photos.rotur.dev/api/auth?v=${validator}`,
    );
    if (!response.ok) {
      console.error("Auth request failed:", response.status);
      return false;
    }

    const data = await response.json();
    if (data.ok && data.sessionId) {
      roturPhotosSessionId = data.sessionId;
      return true;
    }

    console.error("Auth response missing sessionId:", data);
    return false;
  } catch (error) {
    console.error("Failed to authenticate with roturPhotos:", error);
    return false;
  }
}

function extractValueByPath(obj: any, path: string): string | null {
  const parts = path.replace(/^\$\./, "").split(".");
  let current = obj;

  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }

  return current || null;
}

function buildImageUrl(server: MediaServer, response: any, file: File): string {
  if (!server.urlTemplate) {
    const url = extractValueByPath(response, server.responseUrlPath);
    return url || "";
  }

  if (server.responseUrlPath) {
    const extracted = extractValueByPath(response, server.responseUrlPath);
    if (extracted) {
      return server.urlTemplate
        .replace(/{id}/g, extracted)
        .replace(/{url}/g, extracted);
    }
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");

  const username = (window as any).state?.currentUser?.username || "unknown";

  const template = server.urlTemplate
    .replace(/{username}/g, username)
    .replace(/{name}/g, safeName)
    .replace(/{timestamp}/g, timestamp.toString())
    .replace(
      /{id}/g,
      extractValueByPath(response, server.responseUrlPath) ||
        timestamp.toString(),
    );

  return template;
}

function uploadImageWithXHR(
  file: File,
  url: string,
  headers: Record<string, string>,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value.replace("$filename", file.name));
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch {
          reject(new Error("Invalid response from server"));
        }
      } else {
        let errorMessage = "Upload failed";
        try {
          const errorData = JSON.parse(xhr.responseText);
          errorMessage = errorData.error || errorMessage;
        } catch {}
        reject(new Error(`${xhr.status}: ${errorMessage}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during upload"));
    };

    const reader = new FileReader();
    reader.onload = () => {
      xhr.send(reader.result);
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function uploadImage(
  file: File,
  server?: MediaServer,
): Promise<string> {
  const mediaServer = server || (await getEnabledMediaServer());
  const headers: Record<string, string> = {};

  if (mediaServer.headers) {
    mediaServer.headers.forEach((h) => {
      headers[h.key] = h.value;
    });
  }

  if (mediaServer.requiresAuth && mediaServer.authType === "session") {
    const authOk = await initRoturPhotosAuth();
    if (!authOk) {
      throw new Error("Failed to authenticate with media server");
    }
    if (roturPhotosSessionId) {
      headers["sessionId"] = roturPhotosSessionId;
    }
  } else if (mediaServer.authType === "token" && mediaServer.apiKey) {
    headers["Authorization"] = `Bearer ${mediaServer.apiKey}`;
  } else if (mediaServer.authType === "apiKey" && mediaServer.apiKey) {
    headers["Authorization"] = mediaServer.apiKey;
  }

  let uploadUrl = mediaServer.uploadUrl;
  if (mediaServer.id === "roturphotos") {
    uploadUrl += "?public=true";
  }

  const data = await uploadImageWithXHR(file, uploadUrl, headers);

  if (!data.ok) {
    throw new Error(data.error || "Upload failed");
  }

  return buildImageUrl(mediaServer, data, file);
}

export function generateServerId(): string {
  return (
    "server_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11)
  );
}

mediaServersLoaded = loadMediaServers();

(window as any).mediaServers = mediaServers;
(window as any).getEnabledMediaServer = getEnabledMediaServer;
(window as any).getMediaServerById = getMediaServerById;
(window as any).addMediaServer = addMediaServer;
(window as any).deleteMediaServer = deleteMediaServer;
(window as any).setMediaServerEnabled = setMediaServerEnabled;
(window as any).uploadImage = uploadImage;
(window as any).generateServerId = generateServerId;
(window as any).initRoturPhotosAuth = initRoturPhotosAuth;
