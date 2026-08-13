import type { ToViemAccountOptions, toViemAccount } from "../dist/viem.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

type ViemFunctionOptions = Expect<
  Equal<NonNullable<Parameters<typeof toViemAccount>[1]>, ToViemAccountOptions>
>;

// @ts-expect-error A lone options type stays standalone.
type NoSingleMemberNamespace = toViemAccount.Options;

export type { NoSingleMemberNamespace, ViemFunctionOptions };
