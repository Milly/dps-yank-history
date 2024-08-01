import type { Denops } from "jsr:@denops/std@^7.0.0";
import * as autocmd from "jsr:@denops/std@^7.0.0/autocmd";
import { assert, is, maybe } from "jsr:@core/unknownutil@^3.18.1";
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
