import { AssertError, isArray, isLike, isString } from "./deps.ts";

export const PLUGIN_NAME = "yank-history";
export const PLUGIN_AUGROUP = `${PLUGIN_NAME}-internal` as const;
export const PLUGIN_AUTOLOAD_NS = "yank_history";

// ===== RegType

// deno-lint-ignore no-control-regex
const REGTYPE_REGEX = /^(|[vV]|\x16[0-9]+)$/;

export type RegType = "" | "v" | "V" | `\x16${number}`;

export function isRegType(obj: unknown): obj is RegType {
  return typeof obj === "string" && REGTYPE_REGEX.test(obj);
}

// ===== RegInfo

export type RegInfo = {
  regname: string;
  regcontents: string[];
  regtype: RegType;
};

// ===== YankEvent

const YankEventRef = {
  inclusive: true,
  operator: "y",
  regcontents: [] as string[],
  regname: "a",
  regtype: "v" as RegType,
  visual: true,
};

export type YankEvent = typeof YankEventRef;

export function isYankEvent(obj: unknown): obj is YankEvent {
  return isLike(YankEventRef, obj) &&
    isArray(obj.regcontents, isString) &&
    isRegType(obj.regtype);
}

export function assertYankEvent(obj: unknown): asserts obj is YankEvent {
  if (!isYankEvent(obj)) {
    throw new AssertError("The value must be YankEvent");
  }
}

// ===== YankHistoryItem

export type YankHistoryItem = {
  id: number;
  time: number;
} & RegInfo;
