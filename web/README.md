# Web

This directory contains the React frontend for the StarDot dapp.

## Overview

The app uses:

- React + Vite + TypeScript + Tailwind CSS
- [Polkadot API (PAPI)](https://papi.how/) for pallet interaction
- [viem](https://viem.sh/) for EVM and PVM contract interaction through `eth-rpc`
- Zustand for state management

Routes:

- `/` — Home
- `/transfer` — Upload a file and create a transfer
- `/download/:id` — Download a file by transfer ID
- `/my-transfers` — View your past transfers

## Local Development

```bash
cd web
npm install
npm run dev
```

Use `npm run dev:blockchain` instead if you need to fetch fresh chain types before starting.

## PAPI Descriptors

Generated descriptors live in [`.papi/`](.papi/).

Useful commands:

```bash
cd web
npm run update-types
npm run codegen
npm run build
npm run lint
npm run fmt
```

## Deployment Data

The frontend keeps [`src/config/deployments.ts`](src/config/deployments.ts) checked in as a stub so a fresh clone still works. Contract deploy scripts update that file automatically after successful deployment.

See [`../contracts/README.md`](../contracts/README.md) for contract deployment flows.
