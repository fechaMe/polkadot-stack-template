# Polkadot Stack Template

A developer starter template demonstrating the full Polkadot technology stack through a **Proof of Existence** system — the same concept implemented as a Substrate pallet, a Solidity EVM contract, and a Solidity PVM contract. Drop a file, claim its hash on-chain, and optionally upload it to IPFS via the Bulletin Chain.

## What's Inside

### Substrate Pallet

A FRAME pallet implementing proof of existence with `create_claim` and `revoke_claim` dispatchables.

- **Source**: [`blockchain/pallets/template/`](blockchain/pallets/template/)
- **Features**: Per-hash storage, events, errors, benchmarks, weights, mock runtime, 11 unit tests
- **Interact via**: PAPI (frontend), subxt (CLI), or Polkadot.js Apps

### Parachain Runtime

A Cumulus-based parachain runtime built on **polkadot-sdk stable2512** with smart contract support.

- **Source**: [`blockchain/runtime/`](blockchain/runtime/)
- **Pallets included**: System, Balances, Aura, Session, Sudo, XCM, pallet-revive, TemplatePallet
- **pallet-revive**: Enables both EVM and PVM smart contract execution with Ethereum RPC compatibility
- **Runs locally** via `polkadot-omni-node --dev`

### Solidity Smart Contracts

The same `ProofOfExistence.sol` compiled two ways:

| | EVM (solc) | PVM (resolc) |
|---|---|---|
| **Source** | `contracts/evm/contracts/ProofOfExistence.sol` | Same file |
| **Toolchain** | [`contracts/evm/`](contracts/evm/) - Hardhat + solc + viem | [`contracts/pvm/`](contracts/pvm/) - Hardhat + @parity/resolc + viem |
| **VM Backend** | REVM (Ethereum-compatible) | PolkaVM (RISC-V) |
| **Deploy** | `npm run deploy:local` | `npm run deploy:local` |

Both target **Polkadot Hub TestNet** (Chain ID: `420420417`) or your local dev node.

### Frontend

A React + Vite + TypeScript + Tailwind CSS frontend.

- **Source**: [`web/`](web/)
- **Pallet interaction**: [Polkadot API (PAPI)](https://papi.how/) with sr25519 dev accounts (Alice, Bob, Charlie)
- **Contract interaction**: [viem](https://viem.sh/) through the eth-rpc proxy with Ethereum dev accounts
- **Bulletin Chain**: Optional IPFS upload via the Polkadot Bulletin Chain with clickable IPFS links
- **Pages**: Home (connection + pallet detection), Pallet PoE, EVM PoE, PVM PoE, Accounts
- **State management**: Zustand

### CLI

A Rust CLI tool using [subxt](https://github.com/parity-tech/subxt) and [alloy](https://alloy.rs) for chain interaction.

- **Source**: [`cli/`](cli/)
- **Pallet commands**: `pallet create-claim`, `revoke-claim`, `get-claim`, `list-claims`
- **Contract commands**: `contract create-claim`, `revoke-claim`, `get-claim`, `info`
- **Chain commands**: `chain info`, `chain blocks`

### Deployment

- [`scripts/start-dev.sh`](scripts/start-dev.sh) - Build runtime, start local node
- [`scripts/start-dev-with-contracts.sh`](scripts/start-dev-with-contracts.sh) - All of the above + compile and deploy both contracts
- [`scripts/deploy-paseo.sh`](scripts/deploy-paseo.sh) - Deploy contracts to Polkadot TestNet
- [`scripts/deploy-frontend.sh`](scripts/deploy-frontend.sh) - Deploy frontend to IPFS
- [`.github/workflows/deploy-frontend.yml`](.github/workflows/deploy-frontend.yml) - CI deploy to IPFS + DotNS
- [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml) - CI deploy to GitHub Pages
- [`blockchain/Dockerfile`](blockchain/Dockerfile) - Docker image using polkadot-omni-node
- [`blockchain/zombienet.toml`](blockchain/zombienet.toml) - Zombienet config for multi-node testing

## Quick Start

### Prerequisites

- **Rust** (stable, installed via [rustup](https://rustup.rs/))
- **Node.js** v22.5+ and npm v10.9.0+
- **polkadot-omni-node** v1.21.3 ([download](https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3))
- **eth-rpc** v0.12.0 ([download](https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3)) - Ethereum JSON-RPC adapter
- **chain-spec-builder** (`cargo install staging-chain-spec-builder`)

See [INSTALL.md](INSTALL.md) for detailed setup instructions.

### Run locally

```bash
# Start the local dev chain (node + eth-rpc adapter)
./scripts/start-dev.sh
# Substrate RPC: ws://127.0.0.1:9944
# Ethereum RPC:  http://127.0.0.1:8545

# In another terminal, start the frontend
cd web && npm install && npm run dev

# Or use the CLI
cargo run -p stack-cli -- chain info
cargo run -p stack-cli -- pallet create-claim 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
cargo run -p stack-cli -- pallet list-claims
```

### Deploy contracts

```bash
# Compile and deploy to local node
cd contracts/evm && npm install && npm run deploy:local
cd contracts/pvm && npm install && npm run deploy:local

# Deploy to Polkadot TestNet
npx hardhat vars set PRIVATE_KEY  # in each contract dir
npm run deploy:testnet
```

### Run tests

```bash
# Pallet unit tests
cargo test -p pallet-template

# All tests including benchmarks
SKIP_PALLET_REVIVE_FIXTURES=1 cargo test --workspace --features runtime-benchmarks

# Solidity tests (local Hardhat network)
cd contracts/evm && npx hardhat test
cd contracts/pvm && npx hardhat test
```

## Project Structure

```
polkadot-stack-template/
|-- blockchain/
|   |-- runtime/              Parachain runtime (polkadot-sdk stable2512)
|   |-- pallets/template/     Proof of existence pallet with tests + benchmarks
|   |-- Dockerfile            Docker image for deployment
|   |-- docker-compose.yml    Docker Compose configuration
|   `-- zombienet.toml        Multi-node test network config
|-- contracts/
|   |-- evm/                  Hardhat project (solc -> EVM) with ProofOfExistence.sol
|   `-- pvm/                  Hardhat project (resolc -> PVM) with ProofOfExistence.sol
|-- web/                      React + PAPI + viem frontend
|-- cli/                      subxt + alloy Rust CLI
|-- scripts/                  Dev and deployment scripts
|-- Cargo.toml                Rust workspace
`-- rust-toolchain.toml       Pinned Rust version
```

## Documentation

- [TOOLS.md](TOOLS.md) - All Polkadot stack components used in this template
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide (GitHub Pages, DotNS, contracts, runtime)
- [INSTALL.md](INSTALL.md) - Detailed setup instructions

## Key Versions

| Component | Version |
|---|---|
| polkadot-sdk | stable2512-3 (umbrella crate v2512.3.3) |
| polkadot-omni-node | v1.21.3 (from stable2512-3 release) |
| eth-rpc | v0.12.0 (Ethereum JSON-RPC adapter) |
| pallet-revive | v0.12.2 (EVM + PVM smart contracts) |
| Solidity | v0.8.28 |
| resolc | v1.0.0 |
| PAPI | v1.23.3 |
| React | v18.3 |
| viem | v2.x |
| alloy | v1.8 |
| Hardhat | v2.27+ |

## Resources

- [Polkadot Smart Contract Docs](https://docs.polkadot.com/smart-contracts/overview/)
- [Polkadot SDK Documentation](https://paritytech.github.io/polkadot-sdk/master/)
- [PAPI Documentation](https://papi.how/)
- [Polkadot Faucet](https://faucet.polkadot.io/) (TestNet tokens)
- [Blockscout Explorer](https://blockscout-testnet.polkadot.io/) (Polkadot TestNet)
- [Bulletin Chain Authorization](https://paritytech.github.io/polkadot-bulletin-chain/)

## License

[MIT](LICENSE)
