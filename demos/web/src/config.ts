import { DEMO_RPC_URL } from "@category-labs/mera-demo-shared/network";

// Override via demos/web/.env to run against a local network.
const RPC_URL = import.meta.env.VITE_EVM_RPC_URL ?? DEMO_RPC_URL;

export { RPC_URL };
