import {
  is,
  type PredicateType,
} from "https://deno.land/x/unknownutil@v3.17.2/is.ts";

export const PLUGIN_NAME = "yank-history";
export const PLUGIN_AUGROUP = `${PLUGIN_NAME}-internal` as const;
export const PLUGIN_AUTOLOAD_NS = "yank_history";

// ===== RegType

// deno-lint-ignore no-control-regex
const REGTYPE_REGEX = /^(|[vV]|\x16[0-9]+)$/;

export type RegType = "" | "v" | "V" | `\x16${number}`;

export function isRegType(obj: unknown): obj is RegType {
  return is.String(obj) && REGTYPE_REGEX.test(obj);
}

// ===== RegInfo

export type RegInfo = {
  regname: string;
  regcontents: string[];
  regtype: RegType;
};

// ===== YankEvent

const predYankEvent = {
  inclusive: is.Boolean,
  operator: is.String,
  regcontents: is.ArrayOf(is.String),
  regname: is.String,
  regtype: isRegType,
  visual: is.Boolean,
};

export type YankEvent = PredicateType<typeof isYankEvent>;

export const isYankEvent = is.ObjectOf(predYankEvent);

// ===== YankHistoryItem

export type YankHistoryItem = {
  id: number;
  time: number;
} & RegInfo;
