# Contracts

This directory contains the **DotTransfer** smart contract — a `no_std` Rust contract compiled to PolkaVM (RISC-V) bytecode and executed by `pallet-revive` on Polkadot Asset Hub.

## Projects

| Project    | Path                     | Language        | Compiler              | VM      |
| ---------- | ------------------------ | --------------- | --------------------- | ------- |
| PVM (Rust) | [`pvm-rust/`](pvm-rust/) | Rust (`no_std`) | `cargo-pvm-contract`  | PolkaVM |

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

## Dependency Crates

### `pallet-revive-uapi`

The contract-side syscall bindings. Provides typed Rust wrappers for every host function that `pallet-revive` exposes to running contracts:

| Host function | What it does | Used in |
|---|---|---|
| `api::get_storage(flags, key, out)` | Read a 32-byte storage slot | every `read32` call |
| `api::set_storage(flags, key, val)` | Write a 32-byte storage slot | every `write32` call |
| `api::hash_keccak_256(input, out)` | Hash arbitrary bytes to 32 bytes | key derivation |
| `api::caller(out)` | Caller's 20-byte Ethereum address | `get_caller()` |
| `api::now(out)` | Current block timestamp | `get_timestamp()` |
| `api::deposit_event(topics, data)` | Emit an EVM-compatible log | available, not yet wired |

The relationship to `pallet-revive`: `pallet-revive` is the kernel (implements the syscalls inside the runtime); `pallet-revive-uapi` is the libc (typed wrappers a contract calls). Contract authors depend on `pallet-revive-uapi`; runtime engineers wire in `pallet-revive`.

### `pvm-contract-macros`

A proc-macro crate from [`cargo-pvm-contract`](https://github.com/paritytech/cargo-pvm-contract). It reads `DotTransfer.sol` **at compile time** and generates:

- The ABI selector dispatch table (matches the 4-byte function selector from the call input to the correct Rust function)
- Type conversions between ABI-encoded bytes and Rust types (`String`, `U256`, `Address`, `Vec<[u8;32]>`, etc.)

Attributes used in the contract:

```rust
#[pvm_contract_macros::contract("DotTransfer.sol", allocator = "bump")]
mod dot_transfer { ... }

#[pvm_contract_macros::constructor]
pub fn new() -> Result<(), Error> { ... }

#[pvm_contract_macros::method]
pub fn create_transfer(...) -> Result<(), Error> { ... }
```

`DotTransfer.sol` is **never deployed**. It is only parsed by the proc-macro as the source of truth for function signatures and ABI types. This is how the contract achieves Ethereum ABI compatibility without writing a single line of Solidity logic.

### `pvm-contract-types`

Primitive types shared between the proc-macro and the contract: `Address` (a `[u8; 20]` newtype), `Bytes`, and related helpers. Compiled with `features = ["alloc"]` for `no_std` use.

### `pvm-bump-allocator`

A minimal bump allocator for `no_std` environments. Specified via `allocator = "bump"` in the `#[contract]` attribute. In `no_std`, there is no global allocator by default — this crate provides one backed by a fixed memory region. A bump allocator is sufficient for contracts because allocations happen per-call and the frame is discarded when the call returns.

### `ruint`

A `no_std`-compatible 256-bit unsigned integer library. Used for `U256` — the Ethereum-native integer type for token amounts, timestamps, and file sizes. All storage reads/writes of `U256` values use big-endian encoding to match EVM conventions.

### `polkavm-derive`

Low-level PolkaVM linker integration. Used implicitly by the build pipeline; contract authors do not call it directly.

### `cargo-pvm-contract-builder` (build dependency)

Invoked from `build.rs` during `cargo build --release`. It post-processes the RISC-V ELF produced by the compiler into a `.polkavm` blob and emits the ABI JSON. This is why the build produces artifacts in `target/` rather than in the crate's own directory.

---

## The `no_std` Environment

The contract is a `no_std` binary crate. The top of `dot_transfer.rs` controls this via a conditional attribute:

```rust
#![cfg_attr(not(feature = "abi-gen"), no_main, no_std)]
```

When building the actual contract (`cargo build --release`), `abi-gen` is **not** set, so `no_main` and `no_std` are active — the binary has no Rust standard library and no `main` entry point (PolkaVM calls the exported selector dispatch instead).

When the proc-macro generates the ABI JSON, it enables the `abi-gen` feature to compile in `std` mode so it can run normal Rust tooling. The same source file serves both purposes.

**What `no_std` means in practice:**

- No heap allocator by default → `pvm-bump-allocator` fills this gap
- No `std::collections`, `std::io`, `std::fs`, etc.
- `alloc` crate is available (provides `String`, `Vec`, `vec!`)
- All imports from `core::` instead of `std::` for primitives
- Panics use `abort` (no stack unwinding): `panic = "abort"` in the release profile

**Release profile** (`Cargo.toml`):

```toml
[profile.release]
opt-level = "z"          # optimise for size (minimises bytecode)
lto = true               # link-time optimisation across crates
codegen-units = 1        # required for LTO
panic = "abort"          # no unwinding in no_std
overflow-checks = false  # inputs validated at entry point; checked ops add code size
```

`overflow-checks = false` is intentional and safe because all inputs are validated before any arithmetic is performed.

---

## Solidity ABI Interface (`DotTransfer.sol`)

`DotTransfer.sol` is a Solidity `interface` — it declares function signatures, errors, and events but contains no implementation. Its sole purpose is to drive the proc-macro.

**Why Solidity syntax?** The ABI encoding format used by Ethereum tooling (viem, ethers.js, Hardhat, Foundry) is defined in terms of Solidity types. Using a `.sol` interface as the source of truth lets the proc-macro generate correct ABI JSON without a custom type description format, and lets the same file be consumed by standard Solidity tooling if needed.

**Events declared but not yet emitted:**

```solidity
event TransferCreated(bytes32 indexed transferId, address indexed uploader, ...);
event TransferRevoked(bytes32 indexed transferId, address indexed uploader);
event TransferExpiryExtended(bytes32 indexed transferId, address indexed uploader, uint256 newExpiresAt);
```

These appear in the generated ABI JSON (so `eth_getLogs` subscriptions work correctly), but the Rust contract does not yet call `api::deposit_event`. Adding event emission is straightforward — `pallet-revive-uapi` exposes `deposit_event(topics: &[[u8;32]], data: &[u8])` and the riscv64 backend implements it. The topics convention follows EVM: `topics[0] = keccak256("EventName(type,type,...)")`, indexed fields at `topics[1..n]`, non-indexed fields ABI-encoded into `data`.

---

## Storage Layout

PolkaVM contracts via `pallet-revive` use the same flat `bytes32 → bytes32` key-value storage model as the EVM. Every piece of persistent data lives in this map.

### Transfer fields

Each field of a transfer record occupies its own 32-byte slot. The slot key is:

```
key = keccak256(transfer_id ++ slot_tag)
```

where `slot_tag` is a single byte identifying the field:

| Tag | Field | Type |
|-----|-------|------|
| `0` | `SLOT_UPLOADER` | `Address` (20 bytes, right-aligned in 32) |
| `1` | `SLOT_EXPIRES_AT` | `U256` (Unix seconds, big-endian) |
| `2` | `SLOT_FILE_SIZE` | `U256` |
| `3` | `SLOT_CHUNK_COUNT` | `U256` |
| `4` | `SLOT_REVOKED` | `bool` (LSB of slot) |
| `5` | `SLOT_CIDS` | `String` (chunked, see below) |
| `6` | `SLOT_FILENAME` | `String` |
| `7` | `SLOT_LIST_LEN` | `u64` (uploader list length) |
| `8` | `SLOT_DESCRIPTION` | `String` |

This mirrors how Solidity lays out mapping values — each `(id, field)` pair hashes to a distinct slot with negligible collision probability.

### String storage

Strings longer than 32 bytes (CIDs can reach 4,096 bytes) use a multi-slot layout:

```
base_key             → bytes [28..32] hold the string length as a u32
keccak256(base ++ 0) → first 32 bytes of the string
keccak256(base ++ 1) → next 32 bytes
...
keccak256(base ++ n) → last chunk (zero-padded)
```

Reading: fetch the length from `base_key`, then read `ceil(len/32)` chunk slots.

**Why store the length?** Storage returns `[0u8; 32]` for unset slots. Without an explicit length header, trailing null bytes at the end of a string are indistinguishable from unwritten slots.

### `clear_string` on revoke

```rust
fn clear_string(base: &[u8; 32]) {
    // read length, zero every chunk slot, then zero the length header
}
```

When a transfer is revoked, `clear_string` zeroes the CID chunks individually rather than just setting a flag. Setting `revoked = true` alone would be insufficient: the CID bytes would still be readable via `eth_getStorageAt` on the node. Zeroing the slots removes them from the state trie, making direct storage reads return nothing useful.

### Uploader list

Each uploader's transfer IDs are stored as an append-only array:

```
keccak256(addr ++ SLOT_LIST_LEN)           → u64 count of stored transfers
keccak256(addr ++ SLOT_LIST_LEN ++ i_be)   → bytes32 transfer ID at index i
```

Appending is O(1). Pagination reads are O(limit), never O(total).

---

## Pagination: Newest-First from Oldest-First Storage

Transfers are appended chronologically (index 0 = oldest). `getTransfersByUploaderPage` serves them newest-first without a separate reverse index by computing:

```
first_idx = total - 1 - offset   // storage index of the newest item in this page
count     = min(limit, total - offset)

for i in 0..count:
    result.push(storage[first_idx - i])
```

Example — 5 transfers stored, requesting page 2 (offset=2, limit=2):

```
first_idx = 5 - 1 - 2 = 2
reads: storage[2], storage[1]  → the 3rd and 2nd newest transfers
```

---

## Sharp Edges

### Timestamp encoding

`api::now()` writes the current block timestamp as a **SCALE-encoded little-endian `u64` in milliseconds** into a 32-byte buffer. EVM convention is Unix **seconds** as a **big-endian `uint256`**. Both conversions are required:

```rust
fn get_timestamp() -> U256 {
    let mut buf = [0u8; 32];
    api::now(&mut buf);
    U256::from_le_bytes(buf) / U256::from(1000u64)
}
```

Getting either the endianness or the unit wrong causes every expiry comparison to fail silently — the contract will compile and deploy fine but accept or reject all transfers incorrectly.

### EIP-1559 priority tip → Substrate tx priority

`pallet-revive` maps `maxPriorityFeePerGas` (the EIP-1559 tip) to Substrate transaction priority. A zero tip means lowest priority in the tx pool — under any congestion a zero-tip transaction may sit indefinitely. The frontend sets:

```typescript
maxFeePerGas: gasPrice * 2n,
maxPriorityFeePerGas: gasPrice,  // non-zero tip ensures normal priority
```

This is not documented in `pallet-revive` or `eth-rpc` — it is discovered empirically.

### Transfer ID encoding

The transfer ID is a 12-character alphanumeric slug generated client-side and encoded as a **left-aligned `bytes32`**: ASCII bytes at positions `[0..12]`, zeros at `[12..32]`. `bytes32` (not `uint256`) is the correct Solidity type because the value is an opaque identifier with no arithmetic semantics. The frontend uses rejection sampling to eliminate modulo bias when generating the slug:

```typescript
const SLUG_BIAS_LIMIT = Math.floor(256 / 36) * 36; // 252 = 7 × 36
// Discard bytes >= 252; 252 mod 36 == 0 → uniform distribution
```

---

## Local Deployment

```bash
# Terminal 1 — start a local dev node
./scripts/start-dev.sh

# Terminal 2 — start the eth-rpc adapter
eth-rpc --node-rpc-url ws://127.0.0.1:9944 --rpc-port 8545 --rpc-cors all

# Terminal 3 — build and deploy
cd contracts/pvm-rust
cargo build --release           # → target/dot-transfer.release.polkavm
npm ci && npm run deploy:local
```

Build artifacts:

| Artifact | Description |
|---|---|
| `target/dot-transfer.release.polkavm` | PolkaVM bytecode blob deployed on-chain |
| `target/dot-transfer.release.abi.json` | Ethereum ABI consumed by deploy script and frontend |

## TestNet Deployment (Paseo Asset Hub)

```bash
cd contracts/pvm-rust
NETWORK=paseo PRIVATE_KEY=0x... npm run deploy:paseo
```

Both deploy scripts write the contract address to `deployments.json` (repo root) and `web/src/config/deployments.ts`.

## Common Commands

```bash
# Build the contract (from repo root or contracts/pvm-rust/)
cargo build --release

# Format and lint
cargo +nightly fmt
cargo clippy
```
