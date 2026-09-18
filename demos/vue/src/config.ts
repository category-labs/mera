import { DEMO_RPC_URL } from "@category-labs/mera-demo-shared/network";

// Override via the project's .env to run against a local demo network.
const RPC_URL = import.meta.env.VITE_EVM_RPC_URL ?? DEMO_RPC_URL;

export { RPC_URL };
