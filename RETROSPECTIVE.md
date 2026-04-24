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

The `dot_transfer.rs` contract (477 lines, `no_std`) ended up being the most technically satisfying piece of the project. Using `pallet-revive-uapi` to implement EVM-style keccak256 storage slots in Rust, on top of RISC-V bytecode, felt like working close to the metal in the best way.

The storage design mirrors Solidity's mapping layout manually: every field has a slot tag, every key is `keccak256(id || tag)`, strings are chunked into 32-byte segments and written sequentially. This isn't magic — you have to derive it yourself and get it right — and doing it without `std` forces precision that Solidity abstracts away.

The hardest part was string storage. There's no `String` in `no_std`, so I built `write_string` / `read_string` / `clear_string` using raw byte slices and chunk indices. On `revoke_transfer`, I zero out all CID chunks to prevent direct storage reads from bypassing the access gate. That felt like the right security posture: the contract revokes at the data layer, not just the view layer.

The ABI generation via `pvm-contract-macros` reading a `DotTransfer.sol` interface file is elegant. Write the interface once in Solidity for the proc-macro, deploy pure Rust bytecode. It worked exactly as advertised.

### 2. Bridging Two Chains in One UX Flow

The upload flow touches two chains: the **Bulletin Chain** (for file chunks via `TransactionStorage.store()`) and **Paseo Asset Hub** (for the contract record via `pallet-revive`). Both happen sequentially under a single user action, with real-time step feedback in the UI.

Getting PAPI and viem to coexist cleanly — PAPI for Substrate-native Bulletin calls, viem for EVM-compatible contract calls through the eth-rpc proxy — took iteration, but the result is a frontend that talks to genuinely different chain subsystems without the user ever seeing the seam.

### 3. Fee Estimation for pallet-revive

EIP-1559 fee handling in pallet-revive is a silent footgun: the transaction priority in the Substrate tx pool is derived from the EIP-1559 `maxPriorityFeePerGas` tip. If you submit with a zero tip (as some gas estimators default to when basefee is low), your transaction silently sits at the bottom of the pool priority queue.

I caught this empirically and implemented a `getTxFees()` helper that fetches the current gas price and returns `maxFeePerGas = gasPrice * 2`, `maxPriorityFeePerGas = gasPrice`. It's a small wrapper, but it's the difference between transactions confirming and mysteriously stalling.

### 4. Timestamp Semantics Across the Stack

`pallet-revive` returns timestamps as SCALE-encoded little-endian `u64` in milliseconds. EVM `block.timestamp` is seconds. The contract receives the raw SCALE bytes from `api::now()` and divides by 1000 before storing the expiry value, keeping the on-chain representation compatible with what the frontend expects from viem.

On the frontend side, expiry checks use `Math.floor(Date.now() / 1000)` (wall clock) rather than waiting for a block.timestamp read from the chain, because chain clock lag can cause false-negative expired states. These are the kinds of cross-ecosystem mismatches that aren't documented anywhere — you find them by breaking things.

---

## What Didn't Work

### 1. No Offline Test Harness for PVM Contracts

The biggest gap is testing. There is no offline test harness for PolkaVM contracts. Testing requires deploying to a live local node, which means spinning up the full chain stack before every test run. This made iteration slow and test coverage thin.

Substrate pallets have `TestExternalities` for sandboxed unit tests. EVM contracts have Hardhat's in-process `ethers` runner. PolkaVM contracts have nothing equivalent. I worked around it by testing manually against a local devnet and writing the contract defensively, but the absence of something like a `pallet-revive-test` crate is a real productivity drag.

### 3. Storage Is Not Reclaimed on Revoke

Revoking a transfer clears the CID strings from storage (so direct slot reads can't bypass the gate) but the file chunks on the Bulletin Chain persist indefinitely. There's no deletion primitive in `TransactionStorage`, and the Bulletin Chain has no garbage collection. Files live forever even after a user revokes them.

This is partly a protocol limitation, but it should be documented up front as a known trade-off rather than discovered after deployment.
