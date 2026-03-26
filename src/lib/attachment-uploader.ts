import { serverUrl, serverValidatorKeys } from "../state";
import { generateValidator } from "./rotur-api";

export interface PendingAttachment {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  url: string;
  uploading: boolean;
  progress?: number;
  localUrl?: string;
  expires_at?: number | null;
  permanent?: boolean;
}

export interface UploadedAttachment {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  url: string;
  expires_at: number | null;
  permanent: boolean;
}

interface UploadController {
  abort: () => void;
}

const activeUploads = new Map<string, UploadController>();

export function cancelUpload(tempId: string) {
  const controller = activeUploads.get(tempId);
  if (controller) {
    controller.abort();
    activeUploads.delete(tempId);
  }
}

function fileToBase64(file: File, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);

    if (signal) {
      signal.addEventListener("abort", () => {
        reader.abort();
        reject(new Error("Upload cancelled"));
      });
    }
  });
}

export async function uploadAttachment(
  file: File,
  channel: string,
  tempId: string,
  onProgress?: (progress: number) => void,
): Promise<UploadedAttachment> {
  const sUrl = serverUrl.value;
  const validatorKey = serverValidatorKeys[sUrl];

  if (!validatorKey) {
    throw new Error("No validator key available for this server");
  }

  const controller = new AbortController();
  activeUploads.set(tempId, controller);

  try {
    const validator = await generateValidator(validatorKey);

    onProgress?.(0.1);

    const base64 = await fileToBase64(file, controller.signal);

    onProgress?.(0.3);

    const baseUrl = sUrl.startsWith("http") ? sUrl : `https://${sUrl}`;
    const uploadUrl = `${baseUrl}/attachments/upload`;

    onProgress?.(0.5);

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        validator_key: validatorKey,
        validator,
        file: base64,
        name: file.name,
        mime_type: file.type || "application/octet-stream",
        channel,
      }),
      signal: controller.signal,
    });

    onProgress?.(0.8);

    if (!response.ok) {
      let errorMessage = "Upload failed";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }

    const data = await response.json();

    onProgress?.(1);

    return data.attachment;
  } finally {
    activeUploads.delete(tempId);
  }
}

export function mimeTypeToAcceptString(types: string[]): string {
  return types.join(",");
}

export function isMimeTypeAllowed(
  mimeType: string,
  allowedTypes: string[],
): boolean {
  for (const pattern of allowedTypes) {
    if (pattern === "*" || pattern === "*/*") return true;
    if (pattern.endsWith("/*")) {
      const category = pattern.slice(0, -2);
      if (mimeType.startsWith(category + "/")) return true;
    } else {
      if (mimeType === pattern) return true;
    }
  }
  return false;
}
