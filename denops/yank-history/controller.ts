import { DBOptions, YankHistoryDatabase } from "./db.ts";
import { defer, Denops, fn, isLike, vars } from "./deps.ts";
import { PLUGIN_AUTOLOAD_NS, YankEvent, YankHistoryItem } from "./types.ts";
import { regContentsToText } from "./util.ts";

export type Options = {
  minLength: number;
  db: DBOptions;
};

export class YankHistoryController {
  static async create(denops: Denops): Promise<YankHistoryController> {
    const options = await YankHistoryController.getOptions(denops);
    return new YankHistoryController(denops, options);
  }

  static getOptions(denops: Denops): Promise<Options> {
    return defer(denops, (helper) => {
      async function get<D, R>(name: string, def: D, ref: R): Promise<D | R> {
        const varName = `${PLUGIN_AUTOLOAD_NS}#${name}`;
        const value = await vars.globals.get(helper, varName, def);
        return isLike(ref ?? def, value) ? value : def;
      }
      function toAbsolutePath(path: string) {
        return fn.fnamemodify(helper, path, ":p") as Promise<string>;
      }
      return {
        minLength: get("min_length", 2, 0),
        db: {
          path: get("persist_path", undefined, "").then(
            (path) => path ? toAbsolutePath(path) : undefined,
          ),
          updateDuration: get("update_duration", undefined, 0),
          mtimeMargin: get("mtime_margin", undefined, 0),
          maxItems: get("max_items", undefined, 0),
          truncateThreshold: get("truncate_threshold", undefined, 0),
        },
      };
    });
  }

  #denops: Denops;
  #options: Readonly<Options>;
  #db: YankHistoryDatabase;

  constructor(denops: Denops, options: Options) {
    this.#denops = denops;
    this.#options = options;
    this.#db = new YankHistoryDatabase(options.db);
    // Initial loading
    this.#db.values();
  }

  async updateOptions(): Promise<void> {
    this.#options = await YankHistoryController.getOptions(this.#denops);
    this.#db.setOptions(this.#options.db);
  }

  async get(count = -1): Promise<YankHistoryItem[]> {
    const history = await this.#db.values();
    if (count > 0) {
      // from start
      return history.slice(0, count);
    }
    if (count < 0) {
      // from tail
      return history.slice(count);
    }
    return history;
  }

  delete(ids: number[]): void {
    for (const id of ids) {
      this.#db.delete(id);
    }
  }

  onTextYankPost(event: YankEvent): void {
    const text = regContentsToText(event.regcontents);
    if (text.length < this.#options.minLength) return;
    if (event.regname === "") {
      event.regname = '"';
    }
    this.#db.add(event);
  }
}
