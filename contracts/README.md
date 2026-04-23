# Contracts

This directory contains two implementations of the **DotTransfer** smart contract — both target PolkaVM (RISC-V) bytecode executed by `pallet-revive` on Polkadot Asset Hub.

## Projects

| Project        | Path                     | Language        | Compiler                                | VM      |
| -------------- | ------------------------ | --------------- | --------------------------------------- | ------- |
| PVM (Solidity) | [`pvm/`](pvm/)           | Solidity 0.8.28 | `resolc` via `@parity/hardhat-polkadot` | PolkaVM |
| PVM (Rust)     | [`pvm-rust/`](pvm-rust/) | Rust (`no_std`) | `cargo-pvm-contract`                    | PolkaVM |

Both expose the same Ethereum-compatible ABI (`DotTransfer.sol` interface) so the frontend and deploy tooling work against either.

### Which One is Deployed

The **Rust PVM contract** (`pvm-rust/`) is the primary deployment. The Solidity PVM variant (`pvm/`) is kept for reference and comparison.

### How the Rust Contract Works

`pvm-rust/src/dot_transfer.rs` is a `no_std` Rust crate. The `pvm-contract-macros` proc-macro reads `DotTransfer.sol` at compile time to generate the ABI selector dispatch and type conversions. Host function calls (storage read/write, emit event, revert) go through `pallet-revive-uapi`.

`cargo build --release` produces two artifacts in the workspace `target/` directory:

| Artifact                               | Description                                         |
| -------------------------------------- | --------------------------------------------------- |
| `target/dot-transfer.release.polkavm`  | PolkaVM bytecode blob deployed on-chain             |
| `target/dot-transfer.release.abi.json` | Ethereum ABI used by the deploy script and frontend |

## Local Deployment

From the repo root, the recommended full local path is:

```bash
./scripts/deploy-paseo.sh
```

Manual path against an already-running node:

```bash
# Terminal 1 — start a local dev node
./scripts/start-dev.sh

# Terminal 2 — start the eth-rpc adapter
eth-rpc --node-rpc-url ws://127.0.0.1:9944 --rpc-port 8545 --rpc-cors all

# Terminal 3 — build and deploy the Rust PVM contract
cd contracts/pvm-rust
cargo build --release           # produces target/dot-transfer.release.polkavm
npm ci && npm run deploy:local
```

Solidity PVM variant only:

```bash
cd contracts/pvm && npm ci && npm run deploy:local
```

## TestNet Deployment (Paseo)

```bash
# Rust PVM — requires PRIVATE_KEY env var
cd contracts/pvm-rust
NETWORK=paseo PRIVATE_KEY=0x... npm run deploy:paseo

# Solidity PVM — requires Hardhat variable
cd contracts/pvm
npx hardhat vars set PRIVATE_KEY
npm run deploy:testnet
```

Both deploy scripts write the contract address to:

- `deployments.json` in the repo root
- `web/src/config/deployments.ts` for the frontend

## Common Commands

```bash
# Solidity PVM
cd contracts/pvm
npm ci
npx hardhat compile
npx hardhat test
npm run fmt

# Rust PVM (contract build — run from repo root or contracts/pvm-rust/)
cargo build --release
cargo +nightly fmt
cargo clippy
```
