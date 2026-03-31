# Installation Guide

This document covers all prerequisites and setup steps needed to build and run the Polkadot Stack Template.

## Prerequisites

### Rust

Install Rust via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

The project pins Rust stable via `rust-toolchain.toml`. The WASM compilation target is installed automatically.

### Node.js

Required for the Solidity contracts (Hardhat) and the frontend (Vite + React).

- **Node.js**: v22.5 or later (required for PVM/resolc compatibility)
- **npm**: v10.9.0 or later

Install via [nvm](https://github.com/nvm-sh/nvm) (recommended) or [nodejs.org](https://nodejs.org/).

```bash
nvm install 22
nvm use 22
```

### Polkadot Omni Node

The local dev chain runs on `polkadot-omni-node`. **You must use the version matching the SDK release (stable2512-3).**

Download the prebuilt binary for your platform from:

https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3

**macOS (Apple Silicon):**
```bash
curl -L https://github.com/paritytech/polkadot-sdk/releases/download/polkadot-stable2512-3/polkadot-omni-node-aarch64-apple-darwin -o polkadot-omni-node
chmod +x polkadot-omni-node
sudo mv polkadot-omni-node /usr/local/bin/
```

**Linux (x86_64):**
```bash
curl -L https://github.com/paritytech/polkadot-sdk/releases/download/polkadot-stable2512-3/polkadot-omni-node -o polkadot-omni-node
chmod +x polkadot-omni-node
sudo mv polkadot-omni-node /usr/local/bin/
```

### Ethereum RPC Adapter (eth-rpc)

Bridges Ethereum JSON-RPC (port 8545) to the Substrate node, enabling Hardhat/ethers.js/MetaMask to interact with pallet-revive contracts.

Download from the same release:

**macOS (Apple Silicon):**
```bash
curl -L https://github.com/paritytech/polkadot-sdk/releases/download/polkadot-stable2512-3/eth-rpc-aarch64-apple-darwin -o eth-rpc
chmod +x eth-rpc
sudo mv eth-rpc /usr/local/bin/
```

**Linux (x86_64):**
```bash
curl -L https://github.com/paritytech/polkadot-sdk/releases/download/polkadot-stable2512-3/eth-rpc -o eth-rpc
chmod +x eth-rpc
sudo mv eth-rpc /usr/local/bin/
```

Verify:
```bash
eth-rpc --version
# Should output: pallet-revive-eth-rpc 0.12.0
```

Verify the version:
```bash
polkadot-omni-node --version
# Should output: polkadot-omni-node 1.21.3-...
```

> **Warning**: Using an older omni-node version (e.g., v1.18.5 from stable2503) will crash with "Missing required set_validation_data inherent" errors.

### Chain Spec Builder

Used to generate the chain specification from the runtime WASM.

```bash
cargo install staging-chain-spec-builder
```

### Solidity Tooling (for smart contracts)

The EVM contracts use standard Hardhat. The PVM contracts use the Parity Hardhat plugin with `resolc`.

Dependencies are installed automatically via `npm install` in each contract directory. No global installs required.

## Building

### Build the Runtime

```bash
cargo build -p stack-template-runtime --release
```

This compiles the parachain runtime to both native and WASM. The WASM blob is output to:
```
target/release/wbuild/stack-template-runtime/stack_template_runtime.compact.compressed.wasm
```

### Build the Pallet (check only)

```bash
cargo check -p pallet-template
```

### Run Pallet Tests

```bash
cargo test -p pallet-template
```

With benchmarks:
```bash
SKIP_PALLET_REVIVE_FIXTURES=1 cargo test --workspace --features runtime-benchmarks
```

> The `SKIP_PALLET_REVIVE_FIXTURES` env var is needed because pallet-revive's test fixture compilation requires a nightly Rust toolchain.

### Compile Solidity Contracts

**EVM (solc):**
```bash
cd contracts/evm
npm install
npx hardhat compile
```

**PVM (resolc):**
```bash
cd contracts/pvm
npm install
npx hardhat compile
```

### Install Frontend Dependencies

```bash
cd web
npm install
```

## Running Locally

### Quick Start

```bash
./scripts/start-dev.sh
```

This builds the runtime, generates a chain spec, and starts the omni-node in dev mode. The node produces blocks at ~3 second intervals with the Alice dev account as the authority.

- **Substrate RPC**: `ws://127.0.0.1:9944`

### With Contract Deployment

```bash
./scripts/start-dev-with-contracts.sh
```

Same as above, plus compiles and deploys the Counter contract to both EVM and PVM backends.

### Frontend

With the node running:
```bash
cd web
npm install
npm run dev
```

Opens at `http://localhost:5173`.

### CLI

```bash
cargo run -p stack-cli -- chain info --url ws://127.0.0.1:9944
cargo run -p stack-cli -- pallet get alice
cargo run -p stack-cli -- pallet set 42
cargo run -p stack-cli -- pallet increment
```

> Note: The CLI is excluded from the main workspace to avoid dependency conflicts. Build it separately with `cd cli && cargo build`.

## Deploying to Polkadot TestNet

Target: **Polkadot Hub TestNet** (Chain ID: `420420417`)

RPC endpoint: `https://services.polkadothub-rpc.com/testnet`

Get testnet tokens: https://faucet.polkadot.io/

### Set your private key

```bash
cd contracts/evm && npx hardhat vars set PRIVATE_KEY
cd contracts/pvm && npx hardhat vars set PRIVATE_KEY
```

### Deploy

```bash
# EVM
cd contracts/evm
npx hardhat ignition deploy ./ignition/modules/Counter.js --network polkadotTestnet

# PVM
cd contracts/pvm
npx hardhat ignition deploy ./ignition/modules/Counter.js --network polkadotTestnet
```

### Verify on Blockscout

```bash
cd contracts/evm
npx hardhat verify --network polkadotTestnet DEPLOYED_CONTRACT_ADDRESS
```

## Troubleshooting

### "Missing required set_validation_data inherent"

Your `polkadot-omni-node` version doesn't match the runtime. Download the correct version from the [stable2512-3 release](https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3).

### "Failed to retrieve the parachain id"

The chain spec is missing or empty. Regenerate it:
```bash
chain-spec-builder \
    -c blockchain/chain_spec.json \
    create -t development \
    --relay-chain paseo --para-id 1000 \
    --runtime target/release/wbuild/stack-template-runtime/stack_template_runtime.compact.compressed.wasm \
    named-preset development
```

### WASM build fails with arrayvec/serde_core errors

Make sure you're using the `polkadot-sdk` umbrella crate (not individual crate dependencies). The umbrella crate handles feature gating for `wasm32v1-none` correctly.

### pallet-revive-proc-macro compilation error

The `[patch.crates-io]` section in `Cargo.toml` pins `pallet-revive-proc-macro` to v0.7.1 from the polkadot-sdk stable2512-3 tag. If you regenerate `Cargo.lock`, this patch is applied automatically.

### TypeScript moduleResolution error in Hardhat

Each contract directory has a `tsconfig.json` that avoids the TypeScript 7.0 deprecation. Make sure you're using the `tsconfig.json` in the contract directory, not a global one.
