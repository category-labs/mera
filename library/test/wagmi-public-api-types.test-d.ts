import type { MeraOptions, mera } from "../dist/wagmi.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

type WagmiFunctionOptions = Expect<
  Equal<Parameters<typeof mera>[0], MeraOptions>
>;

// @ts-expect-error A lone options type stays standalone.
type NoSingleMemberNamespace = mera.Options;

export type { NoSingleMemberNamespace, WagmiFunctionOptions };
