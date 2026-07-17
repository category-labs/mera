import { expect } from "@playwright/test";

function expectError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }

  throw new Error(`expected fn to throw with code ${code}`);
}

// Replaces a globalThis property for the duration of fn, then restores the
// original property descriptor (or deletes the property if it did not exist).
async function withStubbedGlobal<T>(
  name: string,
  value: unknown,
  fn: () => T | Promise<T>,
): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });

  try {
    return await fn();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, name, original);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  }
}

export { expectError, withStubbedGlobal };
