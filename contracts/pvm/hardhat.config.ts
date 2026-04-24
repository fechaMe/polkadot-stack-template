import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-viem";
import "@parity/hardhat-polkadot";
import { vars } from "hardhat/config";
import { defineChain } from "viem";

const paseoAssetHub = defineChain({
	id: 420420417,
	name: "Paseo Asset Hub",
	nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 10 },
	rpcUrls: {
		default: { http: ["https://eth-rpc-testnet.polkadot.io/"] },
	},
});

const config = {
	solidity: "0.8.28",
	resolc: {
		version: "1.0.0",
	},
	networks: {
		local: {
			// Local node Ethereum RPC endpoint (via eth-rpc adapter)
			url: process.env.ETH_RPC_HTTP || "http://127.0.0.1:8545",
			accounts: [
				// Alice dev account private key
				"0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133",
			],
		},
		polkadotTestnet: {
			url: "https://services.polkadothub-rpc.com/testnet",
			polkadot: true,
			accounts: [process.env.PRIVATE_KEY ?? vars.get("PRIVATE_KEY", "")].filter(Boolean),
		},
	},
	viem: {
		chains: [paseoAssetHub],
	},
};

export default config as HardhatUserConfig;
