import type {
  GatherArguments,
  OnCompleteDoneArguments,
  OnInitArguments,
} from "https://deno.land/x/ddc_vim@v4.1.0/base/source.ts";
import {
  BaseSource,
  type Item as DdcItem,
} from "https://deno.land/x/ddc_vim@v4.1.0/types.ts";
import type { Denops } from "https://deno.land/x/denops_std@v5.0.2/mod.ts";
import { globalOptions } from "https://deno.land/x/denops_std@v5.0.2/variable/option.ts";
import {
  Unprintable,
  type UnprintableUserData,
} from "https://deno.land/x/ddc_unprintable@v2.0.1/mod.ts";
import type { RegType, YankHistoryItem } from "../yank-history/types.ts";
import { regContentsToText, toDuration } from "../yank-history/util.ts";

type Params = {
  /** Max width of the abbreviates column. (default: 0)
   *
   * If 0 is specified, be unlimited.
   */
  maxAbbrWidth: number;
  /** Highlight group name for unprintable chars. (default: "SpecialKey")
   *
   * If empty, highlight is disabled.
   */
  ctrlCharHlGroup: string;
};

type OperatorWise = "c" | "l" | "b" | "";

type UserData = Record<string, never> & UnprintableUserData;

type Item = DdcItem<UserData>;

export class Source extends BaseSource<Params, UserData> {
  #unprintable?: Unprintable<UserData>;

  override params(): Params {
    return {
      maxAbbrWidth: 0,
      ctrlCharHlGroup: "SpecialKey",
    };
  }

  override async onInit(args: OnInitArguments<Params>): Promise<void> {
    const { sourceParams: { ctrlCharHlGroup } } = args;

    this.#unprintable = new Unprintable<UserData>({
      highlightGroup: ctrlCharHlGroup,
      callbackId: `source/${this.name}`,
    });
    await this.#unprintable.onInit(args);
  }

  override async gather(
    args: GatherArguments<Params>,
  ): Promise<Item[]> {
    const {
      denops,
      context: { nextInput },
      sourceParams: { maxAbbrWidth, ctrlCharHlGroup },
      sourceOptions: { maxItems },
    } = args;

    const [abbrWidth, recentHistory] = await Promise.all([
      this.#getAbbrWidth(denops, maxAbbrWidth),
      this.#getHistory(denops, maxItems),
    ]);
    this.#unprintable!.abbrWidth = abbrWidth;
    this.#unprintable!.highlightGroup = ctrlCharHlGroup;
    const items = this.#generateItems(recentHistory);
    return this.#unprintable!.convertItems(denops, items, nextInput);
  }

  override onCompleteDone(
    args: OnCompleteDoneArguments<Params, UserData>,
  ): Promise<void> {
    return this.#unprintable!.onCompleteDone(args);
  }

  async #getAbbrWidth(denops: Denops, maxAbbrWidth: number): Promise<number> {
    const vimColumns = await globalOptions.get(denops, "columns", 9999);
    return maxAbbrWidth > 0 ? Math.min(maxAbbrWidth, vimColumns) : vimColumns;
  }

  #getHistory(denops: Denops, maxItems: number): Promise<YankHistoryItem[]> {
    return denops.dispatch(
      "yank-history",
      "get",
      -maxItems,
    ) as Promise<YankHistoryItem[]>;
  }

  #generateItems(history: YankHistoryItem[]): Item[] {
    const now = Date.now();
    return history.map(({ regcontents, regtype, time }): Item => {
      const word = regContentsTypeToText(regcontents, regtype);
      const wise = regTypeToOperatorWise(regtype);
      const duration = toDuration(now - time);
      return {
        word,
        info: word,
        kind: wise,
        menu: duration,
      };
    });
  }
}

function regTypeToOperatorWise(type: RegType): OperatorWise {
  if (type === "v") return "c";
  if (type === "V") return "l";
  if (type.charCodeAt(0) === 0x16) return "b";
  return "";
}

function regContentsTypeToText(contents: string[], type: RegType): string {
  let text = regContentsToText(contents);
  if (["V", "\x16"].includes(type[0])) {
    text += "\n";
  }
  return text;
}
