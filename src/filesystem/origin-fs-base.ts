export const ENTRY_SIZE = 14;

export const IDX = {
  TYPE: 0,
  NAME: 1,
  LOCATION: 2,
  DATA: 3,
  CREATED: 8,
  EDITED: 9,
  SIZE: 11,
  UUID: 13,
};

export async function md5(text: string): Promise<string> {
  if (crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex.substring(0, 32);
  } else {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(32, "0");
  }
}

export function randomString(length: number): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

export function parsePathComponents(path: string): {
  dir: string;
  name: string;
  ext: string;
} {
  const lastSlash = path.lastIndexOf("/");
  const dir = lastSlash >= 0 ? path.substring(0, lastSlash) : "";
  const file = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
  const lastDot = file.lastIndexOf(".");
  const ext = lastDot >= 0 ? file.substring(lastDot) : "";
  const name = lastDot >= 0 ? file.substring(0, lastDot) : file;
  return { dir, name, ext };
}

import { prepareFolderEntries } from "./fsHelpers";

export abstract class OriginFSBase {
  index: Record<string, string> = {};
  entries: Record<string, any> = {};
  dirty: any[] = [];
  loaded = false;
  abstract username: string;

  cleanPath(p: string): string {
    p = p.toLowerCase();
    p = p.replace(/^origin\/\(c\) users\//, "");
    const parts = p.split("/");
    if (parts.length >= 2) {
      p = parts.slice(1).join("/");
    } else {
      p = "";
    }
    p = ("/" + p).replace(/\/+/, "/").replace(/\/$/, "") || "/";
    return p;
  }

  entryToPath(entry: any): string {
    const location = String(entry[IDX.LOCATION]);
    const name = String(entry[IDX.NAME]);
    const type = String(entry[IDX.TYPE]);
    const rawPath = location.replace(/^\//, "") + "/" + name + type;
    return this.cleanPath(rawPath);
  }

  formatPath(dir: string): string {
    const basePath = `origin/(c) users/${this.username}/`;
    const formatted = dir.replace(/^\//, "").replace(/\/$/, "");
    return (basePath + formatted).replace(/\/$/, "");
  }

  cloneEntry(entry: any): any {
    return [...entry];
  }

  protected buildEntry(params: {type:string; name:string; location:string; data:any; created:number; edited:number; size:number; uuid:string}): any[] {
    const entry = new Array(ENTRY_SIZE);
    entry[IDX.TYPE] = params.type;
    entry[IDX.NAME] = params.name;
    entry[IDX.LOCATION] = params.location;
    entry[IDX.DATA] = params.data;
    entry[IDX.CREATED] = params.created;
    entry[IDX.EDITED] = params.edited;
    entry[IDX.SIZE] = params.size;
    entry[IDX.UUID] = params.uuid;
    return entry;
  }

  async generateUUID(): Promise<string> {
    const data = randomString(16) + Date.now().toString() + this.username;
    return await md5(data);
  }

  joinPath(...elements: string[]): string {
    let joined = elements.join("/").replace(/\/+/, "/").replace(/\/$/, "");
    if (!joined.startsWith("/")) {
      joined = "/" + joined;
    }
    return joined.toLowerCase();
  }

  abstract loadIndex(): Promise<void>;

  abstract writeEntry(path: string, entry: any, op?: "put" | "delete"): Promise<void>;

  async getUuid(path: string): Promise<string> {
    await this.loadIndex();
    const uuid = this.index[path.toLowerCase()];
    if (!uuid) {
      throw new Error("not found");
    }
    return uuid;
  }

  async getPath(uuid: string): Promise<string> {
    await this.loadIndex();
    const entry = this.entries[uuid];
    if (!entry) {
      throw new Error("not found");
    }
    return this.entryToPath(entry);
  }

  async listPaths(): Promise<string[]> {
    await this.loadIndex();
    return Object.keys(this.index);
  }

  async readFile(path: string): Promise<any> {
    await this.loadIndex();
    const uuid = this.index[path.toLowerCase()];
    if (!uuid) {
      throw new Error("not found");
    }
    return this.cloneEntry(this.entries[uuid]);
  }

  async readFileContent(path: string): Promise<string> {
    await this.loadIndex();
    const uuid = this.index[path.toLowerCase()];
    if (!uuid) {
      throw new Error("not found");
    }
    const data = this.entries[uuid][IDX.DATA];
    if (typeof data !== "string") {
      throw new Error("invalid data type");
    }
    return data;
  }

  async createFolders(dir: string): Promise<void> {
    const entries = await prepareFolderEntries(
      dir,
      this.index,
      this.generateUUID.bind(this),
      this.formatPath.bind(this)
    );
    for (const { subPath, entry, uuid } of entries) {
      this.entries[uuid] = entry;
      this.index[subPath] = uuid;
      await this.writeEntry(subPath, entry);
    }
  }

  async createFile(path: string, data: string): Promise<void> {
    path = path.toLowerCase();
    await this.loadIndex();
    const now = Date.now();
    const { dir, name, ext } = parsePathComponents(path);
    await this.createFolders(dir);
    const uuid = await this.generateUUID();
    const entry = this.buildEntry({
      type: ext,
      name,
      location: this.formatPath(dir),
      data,
      created: now,
      edited: now,
      size: data.length,
      uuid,
    });
    this.entries[uuid] = entry;
    this.index[path] = uuid;
    await this.writeEntry(path, entry);
  }

  async createFolder(path: string): Promise<void> {
    path = path.toLowerCase();
    await this.loadIndex();
    const now = Date.now();
    const { dir, name } = parsePathComponents(path);
    await this.createFolders(dir);
    const uuid = await this.generateUUID();
    const entry = this.buildEntry({
      type: ".folder",
      name,
      location: this.formatPath(dir),
      data: [],
      created: now,
      edited: now,
      size: 0,
      uuid,
    });
    this.entries[uuid] = entry;
    this.index[path] = uuid;
    await this.writeEntry(path, entry);
  }

  async listDir(path: string): Promise<string[]> {
    path = path.toLowerCase().replace(/\/$/, "");
    if (!path) {
      path = "/";
    }
    const paths = await this.listPaths();
    const children = new Set<string>();
    const prefix = path === "/" ? "/" : path + "/";
    for (const fullPath of paths) {
      if (fullPath.startsWith(prefix)) {
        const rest = fullPath.substring(prefix.length);
        const firstSlash = rest.indexOf("/");
        const child = firstSlash >= 0 ? rest.substring(0, firstSlash) : rest;
        children.add(child);
      }
    }
    return Array.from(children);
  }

  async exists(path: string): Promise<boolean> {
    path = path.toLowerCase();
    try {
      await this.loadIndex();
      return !!this.index[path];
    } catch {
      return false;
    }
  }
}
