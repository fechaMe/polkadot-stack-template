# Project Retrospective

**Project:** StarDot — Decentralized file-sharing on the Polkadot stack
**Branch:** `pvm-rust`
**Author:** Yash Agarwal (fechaMe)

---

## What This Project Is

StarDot is a production-deployed decentralized file-sharing system built on top of the Polkadot ecosystem. Files are chunked and stored on the **Polkadot Bulletin Chain** (a permissioned IPFS-like statement storage layer). Metadata — uploader, expiry, CID list, filename — is stored in a **PolkaVM smart contract** running on **Paseo Asset Hub** via `pallet-revive`. Users share files through a 12-character slug; no account or wallet is required to download.

---

## What Worked

### 1. Writing a Real PolkaVM Contract in Rust

The `dot_transfer.rs` rust contract implementation was the most challenging piece of the project. The hardest part was string storage. There's no `String` in `no_std`, so I built `write_string` / `read_string` / `clear_string` using raw byte slices and chunk indices. On `revoke_transfer`, I zero out all CID chunks to prevent direct storage reads from bypassing the access gate so the contract revokes at the data layer, not just the view layer.

### 2. Bridging Two Chains in One UX Flow

The upload flow touches two chains: the **Bulletin Chain** (for file chunks via `TransactionStorage.store()`) and **Paseo Asset Hub** (for the contract record via `pallet-revive`). Both happen sequentially under a single user action.

Getting PAPI and viem to coexist cleanly — PAPI for Substrate-native Bulletin calls, viem for EVM-compatible contract calls through the eth-rpc proxy — took iteration, but the result is a frontend that talks to genuinely different chain subsystems without the user ever seeing the seam.

### 3. Fee Estimation for pallet-revive

EIP-1559 fee handling in pallet-revive: the transaction priority in the Substrate tx pool is derived from the EIP-1559 `maxPriorityFeePerGas` tip.

I caught this empirically and implemented a `getTxFees()` helper that fetches the current gas price and returns `maxFeePerGas = gasPrice * 2`, `maxPriorityFeePerGas = gasPrice`.

### 4. Timestamp Semantics Across the Stack

`pallet-revive` returns timestamps as SCALE-encoded little-endian `u64` in milliseconds. EVM `block.timestamp` is seconds. The contract receives the raw SCALE bytes from `api::now()` and divides by 1000 before storing the expiry value, keeping the on-chain representation compatible with what the frontend expects from viem.

On the frontend side, expiry checks use `Math.floor(Date.now() / 1000)` (wall clock) rather than waiting for a block.timestamp read from the chain, because chain clock lag can cause false-negative expired states.

---

## What Didn't Work

### 1. No Offline Test Harness for PVM Contracts

The biggest gap in the smart contract is testing. There is no offline test harness for PolkaVM contracts. Testing required deploying to a live local node, which means spinning up the full chain stack before every test run. This made iteration slow.

### 2. Storage Is Not Reclaimed on Revoke

Revoking a transfer clears the CID strings from storage (so direct slot reads can't bypass the gate) but the file chunks on the Bulletin Chain persist indefinitely. There's no deletion primitive in `TransactionStorage`, and the Bulletin Chain has no garbage collection. Files live forever even after a user revokes them.
