const ENTRY_SIZE = 14;

const IDX = {
  TYPE: 0,
  NAME: 1,
  LOCATION: 2,
  DATA: 3,
  CREATED: 8,
  EDITED: 9,
  SIZE: 11,
  UUID: 13,
};

const DB_NAME = "localOriginFS";
const DB_VERSION = 1;
const STORE_NAME = "files";

async function md5(text: string): Promise<string> {
  if (crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
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

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "path" });
      }
    };
    req.onsuccess = (e) => {
      resolve((e.target as IDBOpenDBRequest).result);
    };
    req.onerror = () => reject(req.error);
  });
}

export class LocalOriginFSClass {
  index: Record<string, string>;
  entries: Record<string, any>;
  dirty: any[];
  loaded: boolean;
  username: string;

  constructor() {
    this.index = {};
    this.entries = {};
    this.dirty = [];
    this.loaded = false;
    this.username = "local";
  }

  cleanPath(p: string): string {
    p = p.toLowerCase();
    p = p.replace(/^origin\/\(c\) users\//, "");
    const parts = p.split("/");
    if (parts.length >= 2) {
      p = parts.slice(1).join("/");
    } else {
      p = "";
    }
    p = ("/" + p).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
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
    const formatted = dir.replace(/^\/|\/$/g, "");
    return (basePath + formatted).replace(/\/$/, "");
  }

  randomString(length: number): string {
    const charset =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  }

  async generateUUID(): Promise<string> {
    const data = this.randomString(16) + Date.now().toString() + this.username;
    return await md5(data);
  }

  cloneEntry(entry: any): any {
    return [...entry];
  }

  async loadIndex(): Promise<void> {
    if (this.loaded) {
      return;
    }

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const files = req.result as Array<{ path: string; entry: any }>;
        for (const file of files) {
          const path = file.path.toLowerCase();
          const uuid = file.entry[IDX.UUID];
          this.index[path] = uuid;
          this.entries[uuid] = file.entry;
        }
        this.loaded = true;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

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

  private async writeEntry(
    path: string,
    entry: any,
    op: "put" | "delete" = "put",
  ): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      if (op === "put") {
        store.put({ path: path.toLowerCase(), entry });
      } else {
        store.delete(path.toLowerCase());
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async writeFile(path: string, data: string): Promise<void> {
    await this.loadIndex();
    const now = Date.now();
    const uuid = this.index[path.toLowerCase()];
    if (!uuid) {
      throw new Error("create via createFile");
    }
    const entry = this.entries[uuid];
    entry[IDX.DATA] = data;
    entry[IDX.EDITED] = now;
    entry[IDX.SIZE] = data.length;
    this.entries[uuid] = entry;
    await this.writeEntry(path, entry);
  }

  async createFolders(dir: string): Promise<void> {
    dir = dir.replace(/\/$/, "");
    if (!dir || dir === "/") {
      return;
    }

    const parts = dir.split("/").filter((p) => p);
    for (let i = 1; i <= parts.length; i++) {
      let subPath = "/" + parts.slice(0, i).join("/");
      subPath = subPath.toLowerCase();

      if (!this.index[subPath]) {
        const now = Date.now();
        const uuid = await this.generateUUID();
        const entry = new Array(ENTRY_SIZE);
        entry[IDX.TYPE] = ".folder";
        entry[IDX.NAME] = parts[i - 1];
        entry[IDX.LOCATION] = this.formatPath(parts.slice(0, i - 1).join("/"));
        entry[IDX.DATA] = [];
        entry[IDX.CREATED] = now;
        entry[IDX.EDITED] = now;
        entry[IDX.SIZE] = 0;
        entry[IDX.UUID] = uuid;
        this.entries[uuid] = entry;
        this.index[subPath] = uuid;
        await this.writeEntry(subPath, entry);
      }
    }
  }

  async createFile(path: string, data: string): Promise<void> {
    path = path.toLowerCase();
    await this.loadIndex();
    const now = Date.now();
    const lastSlash = path.lastIndexOf("/");
    const dir = lastSlash >= 0 ? path.substring(0, lastSlash) : "";
    const file = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
    const lastDot = file.lastIndexOf(".");
    const ext = lastDot >= 0 ? file.substring(lastDot) : "";
    const name = lastDot >= 0 ? file.substring(0, lastDot) : file;

    await this.createFolders(dir);

    const uuid = await this.generateUUID();
    const entry = new Array(ENTRY_SIZE);
    entry[IDX.TYPE] = ext;
    entry[IDX.NAME] = name;
    entry[IDX.LOCATION] = this.formatPath(dir);
    entry[IDX.DATA] = data;
    entry[IDX.CREATED] = now;
    entry[IDX.EDITED] = now;
    entry[IDX.SIZE] = data.length;
    entry[IDX.UUID] = uuid;
    this.entries[uuid] = entry;
    this.index[path] = uuid;
    await this.writeEntry(path, entry);
  }

  async createFolder(path: string): Promise<void> {
    path = path.toLowerCase();
    await this.loadIndex();
    const now = Date.now();
    const lastSlash = path.lastIndexOf("/");
    const dir = lastSlash >= 0 ? path.substring(0, lastSlash) : "";
    const file = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
    const lastDot = file.lastIndexOf(".");
    const name = lastDot >= 0 ? file.substring(0, lastDot) : file;

    await this.createFolders(dir);

    const uuid = await this.generateUUID();
    const entry = new Array(ENTRY_SIZE);
    entry[IDX.TYPE] = ".folder";
    entry[IDX.NAME] = name;
    entry[IDX.LOCATION] = this.formatPath(dir);
    entry[IDX.DATA] = [];
    entry[IDX.CREATED] = now;
    entry[IDX.EDITED] = now;
    entry[IDX.SIZE] = 0;
    entry[IDX.UUID] = uuid;
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

  async remove(path: string): Promise<void> {
    path = path.toLowerCase();
    await this.loadIndex();
    const uuid = this.index[path];
    if (!uuid) {
      throw new Error("not found");
    }
    delete this.index[path];
    delete this.entries[uuid];
    await this.writeEntry(path, null, "delete");
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

  joinPath(...elements: string[]): string {
    let joined = elements.join("/").replace(/\/+/g, "/").replace(/\/$/, "");
    if (!joined.startsWith("/")) {
      joined = "/" + joined;
    }
    return joined.toLowerCase();
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.loadIndex();
    const uuid = this.index[oldPath.toLowerCase()];
    if (!uuid) {
      throw new Error("not found");
    }
    const entry = this.entries[uuid];
    const lastSlash = newPath.lastIndexOf("/");
    const dir = lastSlash >= 0 ? newPath.substring(0, lastSlash) : "";
    const file = lastSlash >= 0 ? newPath.substring(lastSlash + 1) : newPath;
    const lastDot = file.lastIndexOf(".");
    const ext = lastDot >= 0 ? file.substring(lastDot) : "";
    const name = lastDot >= 0 ? file.substring(0, lastDot) : file;
    const now = Date.now();

    entry[IDX.TYPE] = ext;
    entry[IDX.NAME] = name;
    entry[IDX.LOCATION] =
      `origin/(c) users/${this.username}/${dir.replace(/^\/|\/$/g, "")}`;
    entry[IDX.EDITED] = now;
    this.entries[uuid] = entry;
    delete this.index[oldPath.toLowerCase()];
    this.index[newPath.toLowerCase()] = uuid;

    await this.writeEntry(oldPath, null, "delete");
    await this.writeEntry(newPath, entry);
  }

  async statUUID(uuid: string): Promise<any> {
    await this.loadIndex();
    const entry = this.entries[uuid];
    if (!entry) {
      throw new Error("not found");
    }
    return this.cloneEntry(entry);
  }

  async commit(): Promise<void> {
    // Local storage commits immediately on each write
    // This is a no-op for compatibility with OriginFSClientClass
  }
}

(window as any).LocalOriginFS = { LocalOriginFSClass: LocalOriginFSClass, IDX };
