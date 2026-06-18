/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ETHEREUM_MAINNET_RPC_URL?: string;
  readonly VITE_ETHEREUM_TESTNET_RPC_URL?: string;
  readonly VITE_SOLANA_MAINNET_RPC_URL?: string;
  readonly VITE_SOLANA_TESTNET_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
