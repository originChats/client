import { ENTRY_SIZE, IDX, parsePathComponents, OriginFSBase } from "./lib/origin-fs-base";

const BASE_URL = "https://api.rotur.dev";

export class OriginFSClientClass extends OriginFSBase {
  token: string;
  username = "";

  constructor(token: string) {
    super();
    this.token = token;
  }

  async request(method: string, path: string, body: any = null): Promise<any> {
    const url = new URL(BASE_URL + path);
    url.searchParams.set("auth", this.token);
    const options: RequestInit = {
      method,
      headers: {},
    };
    if (body !== null) {
      (options.headers as Record<string, string>)["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url.toString(), options);
    if (response.status !== 200) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    try {
      const json = JSON.parse(await response.text());
      if (json.error) {
        throw new Error(json.error);
      }
      return json;
    } catch (e) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
  }

  async loadIndex(): Promise<void> {
    if (this.loaded) {
      return;
    }
    const raw = await this.request("GET", "/files/path-index");
    this.username = raw.username;
    const indexData = raw.index || {};
    for (const [key, value] of Object.entries(indexData)) {
      if (typeof value === "string") {
        this.index[this.cleanPath(key)] = value;
      }
    }
    this.loaded = true;
  }

  async ensureEntry(uuid: string): Promise<void> {
    if (this.entries[uuid]) {
      return;
    }
    const entry = await this.request("GET", `/files/by-uuid?uuid=${uuid}`);
    this.entries[uuid] = entry;
  }

  async writeEntry(_path: string, _entry: any, _op: "put" | "delete" = "put"): Promise<void> {
    // Remote client uses dirty array + commit() instead
  }

  async readFile(path: string): Promise<any> {
    await this.loadIndex();
    const uuid = this.index[path.toLowerCase()];
    if (!uuid) {
      throw new Error("not found");
    }
    await this.ensureEntry(uuid);
    return this.cloneEntry(this.entries[uuid]);
  }

  async readFileContent(path: string): Promise<string> {
    await this.loadIndex();
    const uuid = this.index[path.toLowerCase()];
    if (!uuid) {
      throw new Error("not found");
    }
    await this.ensureEntry(uuid);
    const data = this.entries[uuid][IDX.DATA];
    if (typeof data !== "string") {
      throw new Error("invalid data type");
    }
    return data;
  }

  async writeFile(path: string, data: string): Promise<void> {
    await this.loadIndex();
    const now = Date.now();
    const uuid = this.index[path.toLowerCase()];
    if (!uuid) {
      throw new Error("create via createFile");
    }
    await this.ensureEntry(uuid);
    const entry = this.entries[uuid];
    entry[IDX.DATA] = data;
    entry[IDX.EDITED] = now;
    entry[IDX.SIZE] = data.length;
    this.entries[uuid] = entry;
    this.dirty.push({ command: "UUIDr", uuid, dta: data, idx: IDX.DATA + 1 });
    this.dirty.push({ command: "UUIDr", uuid, dta: now, idx: IDX.EDITED + 1 });
    this.dirty.push({ command: "UUIDr", uuid, dta: data.length, idx: IDX.SIZE + 1 });
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
        this.dirty.push({ command: "UUIDa", uuid, dta: entry });
      }
    }
  }

  async createFile(path: string, data: string): Promise<void> {
    path = path.toLowerCase();
    await this.loadIndex();
    const now = Date.now();
    const { dir, name, ext } = parsePathComponents(path);
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
    this.dirty.push({ command: "UUIDa", uuid, dta: entry });
  }

  async createFolder(path: string): Promise<void> {
    path = path.toLowerCase();
    await this.loadIndex();
    const now = Date.now();
    const { dir, name } = parsePathComponents(path);
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
    this.dirty.push({ command: "UUIDa", uuid, dta: entry });
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
    this.dirty.push({ command: "UUIDd", uuid });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.loadIndex();
    const uuid = this.index[oldPath.toLowerCase()];
    if (!uuid) {
      throw new Error("not found");
    }
    await this.ensureEntry(uuid);
    const entry = this.entries[uuid];
    const { dir, name, ext } = parsePathComponents(newPath);
    const now = Date.now();
    entry[IDX.TYPE] = ext;
    entry[IDX.NAME] = name;
    entry[IDX.LOCATION] = `origin/(c) users/${this.username}/${dir.replace(/^\/|\/$/g, "")}`;
    entry[IDX.EDITED] = now;
    this.entries[uuid] = entry;
    delete this.index[oldPath.toLowerCase()];
    this.index[newPath.toLowerCase()] = uuid;
    this.dirty.push({ command: "UUIDr", uuid, dta: ext, idx: IDX.TYPE + 1 });
    this.dirty.push({ command: "UUIDr", uuid, dta: name, idx: IDX.NAME + 1 });
    this.dirty.push({ command: "UUIDr", uuid, dta: entry[IDX.LOCATION], idx: IDX.LOCATION + 1 });
    this.dirty.push({ command: "UUIDr", uuid, dta: now, idx: IDX.EDITED + 1 });
  }

  async statUUID(uuid: string): Promise<any> {
    await this.loadIndex();
    await this.ensureEntry(uuid);
    const entry = this.entries[uuid];
    if (!entry) {
      throw new Error("not found");
    }
    return this.cloneEntry(entry);
  }

  async commit(): Promise<void> {
    if (this.dirty.length === 0) {
      return;
    }
    const req = { updates: this.dirty };
    await this.request("POST", "/files", req);
    this.dirty = [];
  }
}

(window as any).originFSKit = { OriginFSClient: OriginFSClientClass, IDX };
