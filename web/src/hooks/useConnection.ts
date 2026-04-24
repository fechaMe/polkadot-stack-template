import { useCallback, useEffect, useRef } from "react";
import { getClient, disconnectClient } from "./useChain";
import { useChainStore } from "../store/chainStore";

let connectId = 0;

export function useConnection() {
	const setWsUrl = useChainStore((state) => state.setWsUrl);
	const setConnected = useChainStore((state) => state.setConnected);
	const setBlockNumber = useChainStore((state) => state.setBlockNumber);

	const connect = useCallback(
		async (url: string) => {
			const id = ++connectId;
			setWsUrl(url);
			setConnected(false);
			setBlockNumber(0);

			disconnectClient();

			try {
				const client = getClient(url);
				const chain = await Promise.race([
					client.getChainSpecData(),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error("Connection timed out")), 10000),
					),
				]);

				if (connectId !== id) return { ok: false, chain: null };

				setConnected(true);
				return { ok: true, chain };
			} catch (e) {
				if (connectId !== id) return { ok: false, chain: null };
				setConnected(false);
				setBlockNumber(0);
				throw e;
			}
		},
		[setBlockNumber, setConnected, setWsUrl],
	);

	return { connect };
}

export function useConnectionManagement() {
	const wsUrl = useChainStore((state) => state.wsUrl);
	const connected = useChainStore((state) => state.connected);
	const setBlockNumber = useChainStore((state) => state.setBlockNumber);
	const { connect } = useConnection();
	const initialWsUrlRef = useRef(wsUrl);

	useEffect(() => {
		connect(initialWsUrlRef.current).catch(() => {});

		return () => {
			connectId += 1;
			disconnectClient();
		};
	}, [connect]);

	useEffect(() => {
		if (!connected) {
			return;
		}

		const client = getClient(wsUrl);
		const subscription = client.finalizedBlock$.subscribe((block) => {
			setBlockNumber(block.number);
		});

		return () => {
			subscription.unsubscribe();
		};
	}, [connected, setBlockNumber, wsUrl]);
}
