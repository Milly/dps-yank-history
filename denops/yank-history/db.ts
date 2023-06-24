import { debounce } from "https://deno.land/std@0.192.0/async/mod.ts";
import { dirname } from "https://deno.land/std@0.192.0/path/mod.ts";
import { Lock } from "https://deno.land/x/async@v2.0.2/mod.ts";
import { assert, is } from "https://deno.land/x/unknownutil@v3.2.0/mod.ts";
import { isRegType, RegInfo, RegType, YankHistoryItem } from "./types.ts";

export type DBOptions = {
  path?: string;
  updateDuration?: number;
  mtimeMargin?: number;
  maxItems?: number;
  truncateThreshold?: number;
};

export const DefaultDBOptions: Readonly<Required<DBOptions>> = {
  path: "",
  updateDuration: 1000,
  mtimeMargin: 200,
  maxItems: 100,
  truncateThreshold: 0,
};

export class YankHistoryDatabase {
  #options: Required<DBOptions> = { ...DefaultDBOptions };
  #history = new Map<number, Item>();
  #nextId = 0;
  #lastLoadedTime = 0;
  #lastLoadedSize = 0;
  #nextSaveIndex = 0;
  #truncateRequired = false;
  #lock = new Lock(undefined);
  #debounceUpdate = () => {};

  constructor(options: Readonly<DBOptions> = {}) {
    this.setOptions(options);
  }

  setOptions(options: Readonly<DBOptions>): void {
    if (this.#options.path !== options.path) {
      this.#lastLoadedTime = 0;
      this.#lastLoadedSize = 0;
    }
    this.#options = {
      ...this.#options,
      ...Object.fromEntries(
        Object.entries(options).filter(
          ([k, v]) => k in DefaultDBOptions && v !== undefined,
        ),
      ),
    };
    // Fix values
    const { maxItems, truncateThreshold } = this.#options;
    this.#options.truncateThreshold = truncateThreshold <= 0
      ? (maxItems + 20)
      : Math.max(maxItems, truncateThreshold);
    this.#options.mtimeMargin = Math.max(0, this.#options.mtimeMargin);
    this.#debounceUpdate = debounce(
      () => this.#update(),
      Math.max(10, this.#options.updateDuration),
    );
  }

  add(reginfo: RegInfo): void {
    const time = Date.now();
    const { regname, regtype, regcontents } = reginfo;
    const id = this.#nextId++;
    this.#history.set(id, [time, regname, regtype, regcontents]);
    this.#debounceUpdate();
  }

  async values(): Promise<YankHistoryItem[]> {
    await this.#update();
    const { maxItems } = this.#options;
    return [...this.#history].slice(-maxItems).map(asYankHistoryItem);
  }

  delete(id: number): boolean {
    const ret = this.#history.delete(id);
    if (ret) {
      this.#truncateRequired = true;
    }
    this.#debounceUpdate();
    return ret;
  }

  async #update(): Promise<void> {
    await this.#lock.lock(async () => {
      const { path } = this.#options;
      if (!path) {
        this.#gc();
        return;
      }

      let file;
      try {
        const dir = dirname(path);
        await Deno.mkdir(dir, { recursive: true });
        file = await Deno.open(path, { read: true, write: true, create: true });

        const newItems = await this.#load(file);
        this.#merge(newItems);
        this.#gc();
        await this.#save(file);
      } catch (e: unknown) {
        if ((e as Error)?.name === "NotFound") {
          console.error(`Cannot open or create the persist file: ${path}`);
        } else {
          console.error(`The persist file may be damaged: ${path}`);
          console.error(e);
        }
        // Disable persist
        this.#options.path = "";
        return;
      } finally {
        file?.close();
      }
    });
  }

  #isFileChanged(stat: Deno.FileInfo): boolean {
    if (stat.mtime) {
      const mtime = stat.mtime.getTime();
      const { mtimeMargin } = this.#options;
      return mtime > (this.#lastLoadedTime + mtimeMargin) ||
        (this.#lastLoadedTime - mtimeMargin) > mtime;
    }
    // Always returns true if the platform does not have an mtime
    return true;
  }

  async #load(file: Deno.FsFile): Promise<Item[]> {
    const stat = await file.stat();
    let items: Item[] = [];

    if (this.#isFileChanged(stat) && stat.size > 0) {
      if (stat.size > this.#lastLoadedSize) {
        // Read incremantal
        items = await this.#readChunk(file, this.#lastLoadedSize, stat.size);
      } else {
        // Read all
        items = await this.#readChunk(file, 0, stat.size);
      }
    }

    this.#lastLoadedTime = stat.mtime?.getTime() ?? Date.now();
    this.#lastLoadedSize = stat.size;
    return items;
  }

  async #readChunk(
    file: Deno.FsFile,
    start: number,
    end: number,
  ): Promise<Item[]> {
    // Read text from file
    await file.seek(start, Deno.SeekMode.Start);
    const buf = new Uint8Array(end - start);
    file.read(buf);
    const rows = new TextDecoder().decode(buf).trimEnd().replaceAll("\n", ",");

    // Parse JSON text
    const items = JSON.parse(`[${rows}]`);
    assert(items, is.ArrayOf(isHistoryItem));
    return items;
  }

  async #save(file: Deno.FsFile): Promise<void> {
    if (this.#truncateRequired) {
      await file.truncate();
      this.#nextSaveIndex = 0;
    }

    const items = [...this.#history.values()].slice(this.#nextSaveIndex);

    // Write lined JSON
    if (items.length > 0) {
      if (this.#truncateRequired) {
        await file.seek(0, Deno.SeekMode.Start);
      } else {
        await file.seek(0, Deno.SeekMode.End);
      }
      const rows = items.map((item) => JSON.stringify(item)).join("\n") + "\n";
      await file.write(new TextEncoder().encode(rows));
    }

    const stat = await file.stat();
    this.#lastLoadedTime = stat.mtime?.getTime() ?? Date.now();
    this.#lastLoadedSize = stat.size;
    this.#nextSaveIndex = this.#history.size;
    this.#truncateRequired = false;
  }

  #merge(items: Item[]): void {
    if (items.length === 0) return;

    if (this.#history.size === 0) {
      // Initial loading
      this.#history = new Map(items.map((item) => [this.#nextId++, item]));
      this.#nextSaveIndex = this.#history.size;
    } else {
      const { time } = HistoryItemField;
      const lastItem = [...this.#history.values()].at(-1);

      if (lastItem && lastItem[time] < items[0][time]) {
        // Time is newer than last item, so append
        for (const item of items) {
          this.#history.set(this.#nextId++, item);
        }
      } else {
        // Merge and unify
        const prevSize = this.#history.size;
        const merged = new Map([
          // Import new items
          items.map((item): [Item, number] => [item, this.#nextId++]),
          // Overwrite with existing items and id
          [...this.#history].map(invertKeyValue),
        ].flat());

        if (merged.size > prevSize) {
          // New item is appended, sort by time
          this.#history = new Map(
            [...merged]
              .sort(([a], [b]) => b[time] - a[time])
              .map(invertKeyValue),
          );
          this.#truncateRequired = true;
        }
      }
    }
  }

  #gc(): void {
    const { maxItems, truncateThreshold } = this.#options;
    if (this.#history.size > truncateThreshold) {
      this.#history = new Map([...this.#history].slice(-maxItems));
      this.#truncateRequired = true;
    }
  }
}

type Item = readonly [number, string, RegType, readonly string[]];

const HistoryItemField = {
  time: 0,
  regname: 1,
  regtype: 2,
  regcontents: 3,
} as const;

function isHistoryItem(obj: unknown): obj is Item {
  return is.Array(obj) && obj.length === 4 &&
    is.Number(obj[HistoryItemField.time]) &&
    is.String(obj[HistoryItemField.regname]) &&
    isRegType(obj[HistoryItemField.regtype]) &&
    is.ArrayOf(is.String)(obj[HistoryItemField.regcontents]);
}

function asYankHistoryItem([id, item]: [number, Item]): YankHistoryItem {
  return {
    id,
    time: item[HistoryItemField.time],
    regname: item[HistoryItemField.regname],
    regtype: item[HistoryItemField.regtype],
    regcontents: [...item[HistoryItemField.regcontents]],
  };
}

function invertKeyValue<K, V>([a, b]: [K, V]): [V, K] {
  return [b, a];
}
