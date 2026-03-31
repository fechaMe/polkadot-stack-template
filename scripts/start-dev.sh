#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Polkadot Stack Template - Local Development ==="
echo ""

# Build the runtime
echo "[1/3] Building runtime..."
cargo build -p stack-template-runtime --release

# Create the chain spec using the newly built WASM
echo "[2/3] Generating chain spec..."
chain-spec-builder \
    -c "$ROOT_DIR/blockchain/chain_spec.json" \
    create -t development \
    --relay-chain paseo \
    --para-id 1000 \
    --runtime "$ROOT_DIR/target/release/wbuild/stack-template-runtime/stack_template_runtime.compact.compressed.wasm" \
    named-preset development

echo "  Chain spec written to blockchain/chain_spec.json"

# Start the node and eth-rpc adapter
echo "[3/3] Starting omni-node + eth-rpc adapter..."
echo "  Substrate RPC: ws://127.0.0.1:9944"
echo "  Ethereum RPC:  http://127.0.0.1:8545"
echo ""

# Start omni-node in background
polkadot-omni-node --chain "$ROOT_DIR/blockchain/chain_spec.json" --dev &
NODE_PID=$!

# Wait for node
for i in $(seq 1 30); do
    if curl -s -o /dev/null http://127.0.0.1:9944 2>/dev/null; then break; fi
    sleep 1
done

# Start eth-rpc adapter (bridges Ethereum JSON-RPC to Substrate RPC)
eth-rpc --dev &
ETH_RPC_PID=$!

cleanup() {
    echo ""
    echo "Shutting down..."
    kill $ETH_RPC_PID 2>/dev/null
    kill $NODE_PID 2>/dev/null
    wait $ETH_RPC_PID 2>/dev/null
    wait $NODE_PID 2>/dev/null
}
trap cleanup EXIT INT TERM

echo ""
echo "=== Dev environment running ==="
echo "  Substrate RPC: ws://127.0.0.1:9944"
echo "  Ethereum RPC:  http://127.0.0.1:8545"
echo ""
echo "Press Ctrl+C to stop."
wait $NODE_PID
