import type { Denops } from "https://deno.land/x/denops_std@v5.0.1/mod.ts";
import * as autocmd from "https://deno.land/x/denops_std@v5.0.1/autocmd/mod.ts";
import {
  assert,
  is,
  maybe,
} from "https://deno.land/x/unknownutil@v3.2.0/mod.ts";
import { YankHistoryController } from "./controller.ts";
import { isYankEvent, PLUGIN_AUGROUP } from "./types.ts";

export async function main(denops: Denops) {
  const controller = await YankHistoryController.create(denops);

  denops.dispatcher = {
    updateOptions() {
      return controller.updateOptions();
    },
    get(count: unknown) {
      return controller.get(maybe(count, is.Number));
    },
    delete(ids: unknown) {
      assert(ids, is.ArrayOf(is.Number));
      controller.delete(ids);
      return Promise.resolve();
    },
    onTextYankPost(event: unknown) {
      assert(event, isYankEvent);
      controller.onTextYankPost(event);
      return Promise.resolve();
    },
  };

  await autocmd.group(
    denops,
    PLUGIN_AUGROUP,
    (group) => {
      group.remove();
      group.define(
        "TextYankPost",
        "*",
        `call denops#notify("${denops.name}", "onTextYankPost", [v:event])`,
      );
    },
  );
}
