import type { Denops } from "jsr:@denops/std@^7.0.0";
import * as fn from "jsr:@denops/std@^7.0.0/function";
import * as vars from "jsr:@denops/std@^7.0.0/variable";
import { is } from "jsr:@core/unknownutil@^3.18.1";
import { accumulate } from "jsr:@milly/denops-batch-accumulate@^1.0.0";
import { DBOptions, YankHistoryDatabase } from "./db.ts";
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

  static async getOptions(denops: Denops): Promise<Options> {
    const [
      minLength,
      path,
      updateDuration,
      mtimeMargin,
      maxItems,
      truncateThreshold,
    ] = await accumulate(denops, (helper) => {
      async function get<D, R>(
        name: string,
        def: D,
        pred: (value: unknown) => value is R,
      ): Promise<D | R> {
        const varName = `${PLUGIN_AUTOLOAD_NS}#${name}`;
        const value = await vars.globals.get(helper, varName, def);
        return pred(value) ? value : def;
      }
      function toAbsolutePath(path: string) {
        return fn.fnamemodify(helper, path, ":p") as Promise<string>;
      }
      return Promise.all([
        get("min_length", 2, is.Number),
        (async () => {
          const path = await get("persist_path", undefined, is.String);
          return path ? await toAbsolutePath(path) : undefined;
        })(),
        get("update_duration", undefined, is.Number),
        get("mtime_margin", undefined, is.Number),
        get("max_items", undefined, is.Number),
        get("truncate_threshold", undefined, is.Number),
      ]);
    });

    return {
      minLength,
      db: {
        path,
        updateDuration,
        mtimeMargin,
        maxItems,
        truncateThreshold,
      },
    };
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
