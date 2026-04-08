# Scripts

This directory contains convenience scripts for the main local development, testing, and deployment flows in this repo.

All scripts resolve the repo root automatically, so you can run them from the repo root with:

```bash
./scripts/<script-name>.sh
```

## Script Guide

| Script | What it does | When to use it |
| --- | --- | --- |
| `start-dev.sh` | Builds the runtime, generates `blockchain/chain_spec.json` for a local relay chain, and starts a local `polkadot-omni-node` with Statement Store enabled. | Use this when you only need the local parachain RPC and runtime, without Ethereum RPC, contract deployment, or the frontend. |
| `start-dev-with-contracts.sh` | Builds the runtime, generates the local-relay-chain spec, compiles both contract projects, starts the local node plus `eth-rpc`, and deploys the EVM and PVM Proof of Existence contracts to the local chain. | Use this when you want a local chain that is ready for contract testing from the CLI or frontend, but you do not need the frontend started for you. |
| `start-frontend.sh` | Installs frontend dependencies, refreshes PAPI descriptors if a local node is running on `ws://127.0.0.1:9944`, and starts the Vite dev server. | Use this when the chain is already running and you only want to work on the web app. |
| `start-all.sh` | Runs the full local stack: runtime build, local-relay-chain spec generation, contract compilation, local node startup, `eth-rpc`, local contract deployment, and frontend startup. | Use this when you want the fastest one-command setup for full-stack local development. |
| `start-local.sh` | Starts the Zombienet-based local network defined by `blockchain/zombienet.toml`. | Use this when you need a more realistic relay-chain + parachain environment instead of the lightweight single-node local setup. |
| `deploy-paseo.sh` | Installs dependencies, compiles, and deploys the EVM and PVM contracts to the Polkadot testnet configuration used by the Hardhat projects. | Use this when you are deploying contract examples to testnet rather than running them locally. Make sure the required `PRIVATE_KEY` values are configured first. |
| `deploy-frontend.sh` | Builds the frontend and uploads `web/dist` to IPFS using the `w3` CLI, then prints the CID and suggested DotNS follow-up steps. | Use this when you want to publish the frontend as a static deployment. |
| `test-statement-store-smoke.sh` | Builds the runtime, starts a temporary local-relay-chain node with Statement Store enabled, verifies the store is initially empty, submits a signed statement through the CLI, and checks that `statement-dump` returns it. | Use this when you want an end-to-end sanity check of the Statement Store integration, especially before merging Statement Store changes. |

## Notes

- `start-dev.sh`, `start-dev-with-contracts.sh`, `start-all.sh`, and `test-statement-store-smoke.sh` depend on local Rust and node tooling such as `cargo`, `chain-spec-builder`, and `polkadot-omni-node`.
- `start-dev-with-contracts.sh` and `start-all.sh` also require `eth-rpc`.
- `start-local.sh` requires `zombienet`.
- `deploy-frontend.sh` requires the `w3` CLI from Web3.Storage.
- `deploy-paseo.sh` expects the contract deployment credentials to already be configured in the contract projects.
