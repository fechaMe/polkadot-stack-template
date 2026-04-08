import { useEffect, useCallback, useRef } from "react";
import { getClient, disconnectClient } from "./useChain";
import { useChainStore } from "../store/chainStore";
import { stack_template } from "@polkadot-api/descriptors";

export function useConnection() {
	const { wsUrl, connected, setConnected, setBlockNumber, setPallets } = useChainStore();
	const connectIdRef = useRef(0);

	const connect = useCallback(
		async (url: string) => {
			const id = ++connectIdRef.current;
			setConnected(false);
			setPallets({ templatePallet: null, revive: null });

			disconnectClient();

			try {
				const client = getClient(url);
				const chain = await Promise.race([
					client.getChainSpecData(),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error("Connection timed out")), 10000),
					),
				]);

				if (connectIdRef.current !== id) return { ok: false, chain: null };

				setConnected(true);

				// Detect available pallets
				const detected = { templatePallet: false, revive: false };

				try {
					const api = client.getTypedApi(stack_template);
					await api.query.TemplatePallet.Claims.getEntries();
					detected.templatePallet = true;
				} catch {
					detected.templatePallet = false;
				}

				try {
					const api = client.getTypedApi(stack_template);
					await api.constants.Revive.DepositPerByte();
					detected.revive = true;
				} catch {
					detected.revive = false;
				}

				if (connectIdRef.current !== id) return { ok: false, chain: null };
				setPallets(detected);
				return { ok: true, chain };
			} catch (e) {
				if (connectIdRef.current !== id) return { ok: false, chain: null };
				setPallets({ templatePallet: false, revive: false });
				throw e;
			}
		},
		[setConnected, setPallets],
	);

	// Auto-connect on mount
	useEffect(() => {
		if (!connected) {
			connect(wsUrl).catch(() => {});
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Subscribe to blocks when connected
	useEffect(() => {
		if (!connected) return;
		const client = getClient(wsUrl);
		const subscription = client.finalizedBlock$.subscribe((block) => {
			setBlockNumber(block.number);
		});
		return () => subscription.unsubscribe();
	}, [connected, wsUrl, setBlockNumber]);

	return { connect };
}
