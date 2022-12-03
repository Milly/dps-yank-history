import { YankHistoryController } from "./controller.ts";
import { assertArray, autocmd, Denops, isNumber, maybeNumber } from "./deps.ts";
import { assertYankEvent, PLUGIN_AUGROUP } from "./types.ts";

export async function main(denops: Denops) {
  const controller = await YankHistoryController.create(denops);

  denops.dispatcher = {
    updateOptions() {
      return controller.updateOptions();
    },
    get(count: unknown) {
      return controller.get(maybeNumber(count));
    },
    delete(ids: unknown) {
      assertArray(ids, isNumber);
      controller.delete(ids);
      return Promise.resolve();
    },
    onTextYankPost(event: unknown) {
      assertYankEvent(event);
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
