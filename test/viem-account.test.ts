import { hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import {
  parseTransaction,
  recoverAddress,
  recoverMessageAddress,
  recoverTransactionAddress,
  recoverTypedDataAddress,
  serializeTransaction,
  type TransactionSerialized,
} from "viem";
import { recoverAuthorizationAddress } from "viem/utils";
import { createSecp256k1SigningSession } from "../dist/index.js";
import { toViemAccount } from "../dist/viem.js";

const PRIVATE_KEY_ONE = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000001",
);
const ADDRESS_ONE = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
const RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function createAccount() {
  const session = createSecp256k1SigningSession({
    consumePrivateKey: new Uint8Array(PRIVATE_KEY_ONE),
  });
  return { session, account: toViemAccount(session) };
}

test("exposes the session key as a local account", () => {
  const { session, account } = createAccount();

  expect(account.address).toBe(ADDRESS_ONE);
  expect(account.type).toBe("local");
  expect(account.source).toBe("mera");
  // 65-byte uncompressed public key: "0x04" + 128 hex chars.
  expect(account.publicKey).toHaveLength(132);
  expect(account.publicKey.startsWith("0x04")).toBe(true);
  // Optional on LocalAccount; the adapter implements both.
  expect(typeof account.sign).toBe("function");
  expect(typeof account.signAuthorization).toBe("function");

  session.lock();
});

test("signMessage produces an EIP-191 signature that recovers the address", async () => {
  const { account } = createAccount();
  const message = "hello from mera";

  const signature = await account.signMessage({ message });

  expect(await recoverMessageAddress({ message, signature })).toBe(ADDRESS_ONE);
});

test("signTransaction signs an EIP-1559 transaction the sender recovers from", async () => {
  const { account } = createAccount();
  const transaction = {
    chainId: 1,
    type: "eip1559",
    nonce: 0,
    gas: 21000n,
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    to: RECIPIENT,
    value: 1_000_000n,
  } as const;

  // The account's signTransaction is typed to return plain hex.
  const serializedTransaction = (await account.signTransaction(
    transaction,
  )) as TransactionSerialized;

  const parsed = parseTransaction(serializedTransaction);
  expect(parsed.to?.toLowerCase()).toBe(RECIPIENT.toLowerCase());
  expect(parsed.value).toBe(transaction.value);
  expect(parsed.chainId).toBe(transaction.chainId);
  expect(await recoverTransactionAddress({ serializedTransaction })).toBe(
    ADDRESS_ONE,
  );
});

test("signTransaction signs a legacy transaction via the EIP-155 `v` path", async () => {
  const { account } = createAccount();

  const serializedTransaction = (await account.signTransaction({
    chainId: 1,
    nonce: 0,
    gas: 21000n,
    gasPrice: 30_000_000_000n,
    to: RECIPIENT,
    value: 1_000_000n,
  })) as TransactionSerialized;

  expect(parseTransaction(serializedTransaction).type).toBe("legacy");
  expect(await recoverTransactionAddress({ serializedTransaction })).toBe(
    ADDRESS_ONE,
  );
});

test("signTransaction honors a custom serializer", async () => {
  const { account } = createAccount();
  let calls = 0;
  const serializer: typeof serializeTransaction = (transaction, signature) => {
    calls += 1;
    return serializeTransaction(transaction, signature);
  };

  const serializedTransaction = (await account.signTransaction(
    {
      chainId: 1,
      type: "eip1559",
      nonce: 0,
      gas: 21000n,
      maxFeePerGas: 30_000_000_000n,
      to: RECIPIENT,
      value: 1_000_000n,
    },
    { serializer },
  )) as TransactionSerialized;

  // Once for the signed digest, once for the final serialization.
  expect(calls).toBe(2);
  expect(await recoverTransactionAddress({ serializedTransaction })).toBe(
    ADDRESS_ONE,
  );
});

test("signTypedData produces an EIP-712 signature that recovers the address", async () => {
  const { account } = createAccount();
  const typedData = {
    domain: { name: "Mera", version: "1", chainId: 1 },
    types: { Message: [{ name: "contents", type: "string" }] },
    primaryType: "Message",
    message: { contents: "hello" },
  } as const;

  const signature = await account.signTypedData(typedData);

  expect(await recoverTypedDataAddress({ ...typedData, signature })).toBe(
    ADDRESS_ONE,
  );
});

test("sign produces a raw-hash signature that recovers the address", async () => {
  const { account } = createAccount();
  if (!account.sign) throw new Error("account.sign is not implemented");
  const hash = `0x${"11".repeat(32)}` as const;

  const signature = await account.sign({ hash });

  expect(await recoverAddress({ hash, signature })).toBe(ADDRESS_ONE);
});

test("signAuthorization signs an EIP-7702 authorization", async () => {
  const { account } = createAccount();
  if (!account.signAuthorization) {
    throw new Error("account.signAuthorization is not implemented");
  }

  const authorization = await account.signAuthorization({
    address: RECIPIENT,
    chainId: 1,
    nonce: 0,
  });

  expect(authorization).toMatchObject({
    address: RECIPIENT,
    chainId: 1,
    nonce: 0,
  });
  expect(await recoverAuthorizationAddress({ authorization })).toBe(
    ADDRESS_ONE,
  );
});

test("signing rejects with SESSION_LOCKED after the session is locked", async () => {
  const { session, account } = createAccount();
  session.lock();

  await expect(account.signMessage({ message: "x" })).rejects.toMatchObject({
    code: "SESSION_LOCKED",
  });
});

test("sign rejects with INPUT_INVALID when the hash is not 32 bytes", async () => {
  const { account } = createAccount();
  if (!account.sign) throw new Error("account.sign is not implemented");

  await expect(account.sign({ hash: "0x1234" })).rejects.toMatchObject({
    code: "INPUT_INVALID",
  });
});
