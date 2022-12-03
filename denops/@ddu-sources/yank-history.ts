import { abortablePromise, fn } from "../yank-history/deps.ts";
import {
  ActionFlags,
  Actions,
  BaseSource,
  GatherArguments,
  Item,
} from "../yank-history/deps_ddu.ts";
import { YankHistoryItem } from "../yank-history/types.ts";
import {
  regContentsToText,
  toDuration,
  zeroPad,
} from "../yank-history/util.ts";

const PLUGIN_NAME = "yank-history";

type Params = {
  /** Highlight group name for header. (default: "Special")
   *
   * If empty, highlight is disabled.
   */
  headerHlGroup: string;
  /** Prefix for displayed items. (default: "") */
  prefix: string;
};

export type ActionData = {
  text: string;
  regType?: string;
  yankHistory: YankHistoryItem;
};

export class Source extends BaseSource<Params> {
  override kind = "word";

  override params(): Params {
    return {
      headerHlGroup: "Special",
      prefix: "",
    };
  }

  override actions: Actions<Params> = {
    "delete-yank-history": (args) => {
      const { denops, items } = args;
      const ids = items
        .map(({ action }) => (action as ActionData)?.yankHistory.id)
        .filter((id) => id != null);
      denops.dispatch(PLUGIN_NAME, "delete", ids);
      return Promise.resolve(ActionFlags.RefreshItems);
    },
  };

  override gather(
    args: GatherArguments<Params>,
  ): ReadableStream<Item<ActionData>[]> {
    const abortController = new AbortController();
    return new ReadableStream({
      start: async (controller) => {
        try {
          const items = await abortablePromise(
            this.#generateItems(args),
            abortController.signal,
          );
          controller.enqueue(items);
        } catch (e: unknown) {
          if ((e as Error)?.name !== "AbortError") {
            console.error(e);
          }
        } finally {
          controller.close();
        }
      },
      cancel: (reason) => abortController.abort(reason),
    });
  }

  async #generateItems(
    args: GatherArguments<Params>,
  ): Promise<Item<ActionData>[]> {
    const {
      denops,
      sourceParams: { prefix, headerHlGroup },
      sourceOptions: { maxItems },
    } = args;

    const [prefixWidth, recentHistory] = await Promise.all([
      fn.strlen(denops, prefix) as Promise<number>,
      denops.dispatch(PLUGIN_NAME, "get", -maxItems) as Promise<
        readonly YankHistoryItem[]
      >,
    ]);
    const now = Date.now();

    const maxId = Math.max(...recentHistory.map(({ id }) => id));
    const idWidth = maxId.toFixed().length;

    return recentHistory.map<Item<ActionData>>((item) => {
      const { id, regname } = item;
      const text = regContentsToText(item.regcontents);
      const regType = item.regtype;
      const duration = toDuration(now - item.time);
      const header = `${zeroPad(id, idWidth)}:${
        zeroPad(duration, 3)
      }:${regname}:`;
      return {
        word: `${prefix}${header} ${text}`,
        action: { text, regType, yankHistory: item },
        highlights: [
          {
            name: `source/${PLUGIN_NAME}/header`,
            hl_group: headerHlGroup,
            col: 1,
            width: prefixWidth + header.length,
          },
        ],
      };
    });
  }
}
