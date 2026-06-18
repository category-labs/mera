import { expect } from "@playwright/test";

export function expectError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }

  throw new Error(`expected fn to throw with code ${code}`);
}
