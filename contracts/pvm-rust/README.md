# Contracts

This directory contains the **DotTransfer** smart contract — a `no_std` Rust contract compiled to PolkaVM (RISC-V) bytecode and executed by `pallet-revive` on Paseo Asset Hub.

The contract exposes a standard Ethereum ABI (`DotTransfer.sol` interface) so the frontend and deploy tooling work with viem exactly as they would against an EVM contract.

---

## Architecture Overview

```
dot_transfer.rs  (no_std Rust)
      │
      │  cargo build --release
      ▼
  RISC-V ELF
      │
      │  cargo-pvm-contract relinks
      ▼
  dot-transfer.release.polkavm   ← deployed on-chain
  dot-transfer.release.abi.json  ← consumed by frontend and deploy scripts
```

The frontend calls the contract via standard Ethereum JSON-RPC:

```
viem (browser) → eth-rpc proxy → pallet-revive (Substrate) → PolkaVM execution
```

`eth-rpc` translates `eth_call` / `eth_sendTransaction` into Substrate extrinsics targeting `pallet-revive`. viem never knows it isn't talking to an EVM chain.

---

**Why Solidity syntax?** The ABI encoding format used by Ethereum tooling (viem, ethers.js, Hardhat, Foundry) is defined in terms of Solidity types. Using a `.sol` interface as the source of truth lets the proc-macro generate correct ABI JSON without a custom type description format, and lets the same file be consumed by standard Solidity tooling if needed.

**Events declared but not emitted:**

```solidity
event TransferCreated(bytes32 indexed transferId, address indexed uploader, ...);
event TransferRevoked(bytes32 indexed transferId, address indexed uploader);
event TransferExpiryExtended(bytes32 indexed transferId, address indexed uploader, uint256 newExpiresAt);
```

---

## Storage Layout

PolkaVM contracts via `pallet-revive` use the same flat `bytes32 → bytes32` key-value storage model as the EVM. Every piece of persistent data lives in this map.

### Transfer fields

Each field of a transfer record occupies its own 32-byte slot. The slot key is:

```
key = keccak256(transfer_id ++ slot_tag)
```

where `slot_tag` is a single byte identifying the field:

| Tag | Field              | Type                                      |
| --- | ------------------ | ----------------------------------------- |
| `0` | `SLOT_UPLOADER`    | `Address` (20 bytes, right-aligned in 32) |
| `1` | `SLOT_EXPIRES_AT`  | `U256` (Unix seconds, big-endian)         |
| `2` | `SLOT_FILE_SIZE`   | `U256`                                    |
| `3` | `SLOT_CHUNK_COUNT` | `U256`                                    |
| `4` | `SLOT_REVOKED`     | `bool` (LSB of slot)                      |
| `5` | `SLOT_CIDS`        | `String` (chunked)                        |
| `6` | `SLOT_FILENAME`    | `String`                                  |
| `7` | `SLOT_LIST_LEN`    | `u64` (uploader list length)              |
| `8` | `SLOT_DESCRIPTION` | `String`                                  |

This mirrors how Solidity lays out mapping values — each `(id, field)` pair hashes to a distinct slot with negligible collision probability.

## TestNet Deployment (Paseo Asset Hub)

```bash
cd contracts/pvm-rust
PRIVATE_KEY=0x... npm run deploy:paseo
```

The deploy script writes the contract address to `deployments.json` (repo root) and `web/src/config/deployments.ts`.

---

## Local Deployment

```bash
cd contracts/pvm-rust
cargo build --release           # → target/dot-transfer.release.polkavm
npm ci && npm run deploy:local
```

Build artifacts:

| Artifact                               | Description                                         |
| -------------------------------------- | --------------------------------------------------- |
| `target/dot-transfer.release.polkavm`  | PolkaVM bytecode blob deployed on-chain             |
| `target/dot-transfer.release.abi.json` | Ethereum ABI consumed by deploy script and frontend |

## Common Commands

```bash
# Build the contract (from repo root or contracts/pvm-rust/)
cargo build --release

# Format and lint
cargo fmt
cargo clippy
```
