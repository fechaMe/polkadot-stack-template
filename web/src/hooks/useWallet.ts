import { useState, useEffect, useCallback } from "react";
import { createWalletClient, custom, defineChain, type WalletClient } from "viem";

// Minimal EIP-1193 provider shape for TypeScript — MetaMask and most wallets match this.
interface EIP1193Provider {
	request(args: { method: string; params?: unknown[] }): Promise<unknown>;
	on(event: string, handler: (...args: unknown[]) => void): void;
	removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
	interface Window {
		ethereum?: EIP1193Provider;
	}
}

export type WalletState =
	| { connected: false; address: null }
	| { connected: true; address: string };

export type WalletHook = {
	address: string | null;
	connected: boolean;
	connecting: boolean;
	error: string | null;
	hasInjected: boolean;
	connect: () => Promise<void>;
	disconnect: () => void;
	getWalletClient: (ethRpcUrl: string) => Promise<WalletClient>;
};

export function useWallet(): WalletHook {
	const [address, setAddress] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const hasInjected = typeof window !== "undefined" && Boolean(window.ethereum);

	useEffect(() => {
		if (!window.ethereum) return;

		// Auto-reconnect if already authorized (no popup)
		window.ethereum
			.request({ method: "eth_accounts" })
			.then((accounts) => {
				const list = accounts as string[];
				if (list.length > 0) setAddress(list[0]);
			})
			.catch(() => {});

		const handleAccountsChanged = (accounts: unknown) => {
			const list = accounts as string[];
			setAddress(list.length > 0 ? list[0] : null);
		};
		window.ethereum.on("accountsChanged", handleAccountsChanged);
		return () => window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
	}, []);

	const connect = useCallback(async () => {
		if (!window.ethereum) {
			setError("No wallet extension detected. Install MetaMask or SubWallet.");
			return;
		}
		setConnecting(true);
		setError(null);
		try {
			const accounts = (await window.ethereum.request({
				method: "eth_requestAccounts",
			})) as string[];
			if (accounts.length > 0) setAddress(accounts[0]);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Connection rejected");
		} finally {
			setConnecting(false);
		}
	}, []);

	const disconnect = useCallback(() => setAddress(null), []);

	const getWalletClient = useCallback(
		async (ethRpcUrl: string): Promise<WalletClient> => {
			if (!address || !window.ethereum) throw new Error("Wallet not connected");
			const chainIdHex = (await window.ethereum.request({
				method: "eth_chainId",
			})) as string;
			const chainId = parseInt(chainIdHex, 16);
			const chain = defineChain({
				id: chainId,
				name: "Paseo Asset Hub",
				nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 10 },
				rpcUrls: { default: { http: [ethRpcUrl] } },
			});
			return createWalletClient({
				account: address as `0x${string}`,
				chain,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				transport: custom(window.ethereum as any),
			});
		},
		[address],
	);

	return {
		address,
		connected: address !== null,
		connecting,
		error,
		hasInjected,
		connect,
		disconnect,
		getWalletClient,
	};
}
