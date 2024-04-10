import { defer } from "https://deno.land/x/denops_defer@v1.0.0/batch/defer.ts";
import type { Denops } from "https://deno.land/x/denops_std@v6.4.0/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v6.4.0/function/mod.ts";
import * as vars from "https://deno.land/x/denops_std@v6.4.0/variable/mod.ts";
import { is } from "https://deno.land/x/unknownutil@v3.17.2/mod.ts";
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

  static getOptions(denops: Denops): Promise<Options> {
    return defer(denops, (helper) => {
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
      return {
        minLength: get("min_length", 2, is.Number),
        db: {
          path: get("persist_path", undefined, is.String).then(
            (path) => path ? toAbsolutePath(path) : undefined,
          ),
          updateDuration: get("update_duration", undefined, is.Number),
          mtimeMargin: get("mtime_margin", undefined, is.Number),
          maxItems: get("max_items", undefined, is.Number),
          truncateThreshold: get("truncate_threshold", undefined, is.Number),
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
