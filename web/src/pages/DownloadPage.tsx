import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { deployments } from "../config/deployments";
import { useChainStore } from "../store/chainStore";
import { getTransferRecord, checkContractDeployed, type TransferRecord } from "../hooks/useTransferContract";
import { fetchTransferFromIpfs, parseCids } from "../hooks/useBulletinUpload";

const CONTRACT_STORAGE_KEY = "dot-transfer-contract-address";
const IPFS_BASE = "https://paseo-ipfs.polkadot.io/ipfs";

function formatSize(bytes: bigint): string {
	const n = Number(bytes);
	if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
	if (n >= 1024) return `${(n / 1024).toFixed(0)} KiB`;
	return `${n} B`;
}

function formatTimeLeft(expiresAt: bigint): string {
	const nowSec = BigInt(Math.floor(Date.now() / 1000));
	if (expiresAt <= nowSec) return "Expired";
	const diff = Number(expiresAt - nowSec);
	const days = Math.floor(diff / 86400);
	const hours = Math.floor((diff % 86400) / 3600);
	const mins = Math.floor((diff % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h remaining`;
	if (hours > 0) return `${hours}h ${mins}m remaining`;
	return `${mins}m remaining`;
}

function shortAddress(addr: string): string {
	return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}



export default function DownloadPage() {
	const { id } = useParams<{ id: string }>();
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);

	const [contractAddress, setContractAddress] = useState("");
	const [transfer, setTransfer] = useState<TransferRecord | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const [dlState, setDlState] = useState<
		| { type: "idle" }
		| { type: "fetching"; fetched: number; total: number }
		| { type: "done"; blobUrl: string; fileName: string }
		| { type: "cors_fallback"; cidList: string[] }
		| { type: "error"; message: string }
	>({ type: "idle" });

	useEffect(() => {
		const stored = localStorage.getItem(`${CONTRACT_STORAGE_KEY}:${ethRpcUrl}`);
		setContractAddress(stored || deployments.dotTransfer || "");
	}, [ethRpcUrl]);

	useEffect(() => {
		if (contractAddress && id) loadTransfer();
	}, [contractAddress, id, ethRpcUrl]); // eslint-disable-line react-hooks/exhaustive-deps

	async function loadTransfer() {
		if (!contractAddress || !id) return;
		setLoading(true);
		setLoadError(null);
		setTransfer(null);
		try {
			const deployed = await checkContractDeployed(contractAddress, ethRpcUrl);
			if (!deployed) {
				setLoadError(`No DotTransfer contract found at ${contractAddress}.`);
				return;
			}
			const record = await getTransferRecord(contractAddress, id, ethRpcUrl);
			setTransfer(record);
		} catch (err) {
			setLoadError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}

	async function handleDownload() {
		if (!transfer) return;
		const { cidList } = parseCids(transfer.cids);
		setDlState({ type: "fetching", fetched: 0, total: cidList.length });

		try {
			const buffer = await fetchTransferFromIpfs(transfer.cids, (fetched, total) => {
				setDlState({ type: "fetching", fetched, total });
			});
			const fileName = transfer.fileName || `transfer-${id}`;
			const blob = new Blob([buffer], { type: "application/octet-stream" });
			const blobUrl = URL.createObjectURL(blob);
			setDlState({ type: "done", blobUrl, fileName });
			// Open in new tab — download attribute is blocked in sandboxed frames
			window.open(blobUrl, "_blank");
		} catch (err) {
			// CORS or gateway error — offer direct IPFS links as fallback
			const msg = err instanceof Error ? err.message : String(err);
			const isCors =
				msg.toLowerCase().includes("cors") ||
				msg.toLowerCase().includes("failed to fetch") ||
				msg.toLowerCase().includes("networkerror");

			if (isCors || cidList.length === 1) {
				// For single-chunk files the browser can open the URL directly
				if (cidList.length === 1) {
					window.open(`${IPFS_BASE}/${cidList[0]}`, "_blank");
					setDlState({ type: "idle" });
				} else {
					setDlState({ type: "cors_fallback", cidList });
				}
			} else {
				setDlState({ type: "error", message: msg });
			}
		}
	}

	const isExpired = transfer?.expired ?? false;
	const isRevoked = transfer?.revoked ?? false;
	const isUnavailable = isExpired || isRevoked;

	return (
		<div className="space-y-6 animate-fade-in max-w-lg mx-auto">
			<div className="space-y-1">
				<h1 className="page-title text-polka-400">StarDot</h1>
				<p className="text-text-secondary text-sm">
					Transfer <span className="font-mono text-text-primary">{id}</span> · Paseo Asset Hub + Bulletin Chain IPFS
				</p>
			</div>

			{/* Contract address override */}
			<details className="card">
				<summary className="cursor-pointer text-sm text-text-muted select-none">
					Contract address
				</summary>
				<div className="mt-3 flex gap-2">
					<input
						type="text"
						value={contractAddress}
						onChange={(e) => {
							const addr = e.target.value;
							setContractAddress(addr);
							if (addr) localStorage.setItem(`${CONTRACT_STORAGE_KEY}:${ethRpcUrl}`, addr);
						}}
						placeholder="0x…"
						className="input-field w-full text-xs"
					/>
					<button onClick={loadTransfer} className="btn-secondary text-xs whitespace-nowrap">
						Load
					</button>
				</div>
			</details>

			{loading && (
				<div className="card text-center py-8">
					<div className="w-6 h-6 rounded-full border-2 border-polka-500/30 border-t-polka-500 animate-spin mx-auto mb-3" />
					<p className="text-text-secondary text-sm">Querying Paseo Asset Hub…</p>
				</div>
			)}

			{loadError && !loading && (
				<div className="card space-y-3">
					<p className="text-sm font-medium text-accent-red">Could not load transfer</p>
					<p className="text-xs text-text-secondary break-words">{loadError}</p>
					<button onClick={loadTransfer} className="btn-secondary text-xs">Retry</button>
				</div>
			)}

			{transfer && !loading && (
				<div className="card space-y-5">
					{isRevoked && (
						<div className="rounded-lg bg-accent-red/10 border border-accent-red/20 px-3 py-2 text-sm text-accent-red">
							This transfer has been revoked by the uploader.
						</div>
					)}
					{!isRevoked && isExpired && (
						<div className="rounded-lg bg-accent-red/10 border border-accent-red/20 px-3 py-2 text-sm text-accent-red">
							This transfer has expired. The file may no longer be on the Bulletin Chain.
						</div>
					)}

					{/* File info */}
					<div className="flex items-start gap-3">
						<div className="w-10 h-10 rounded-lg bg-polka-500/10 border border-polka-500/20 flex items-center justify-center shrink-0">
							<svg className="w-5 h-5 text-polka-400" viewBox="0 0 20 20" fill="none">
								<path d="M4 4a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="1.5" />
								<path d="M11 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
							</svg>
						</div>
						<div className="min-w-0">
							<p className="text-text-primary font-medium break-all">
								{transfer.fileName || `transfer-${id}`}
							</p>
							<p className="text-text-muted text-sm">{formatSize(transfer.fileSize)}</p>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-2 text-xs">
						<div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5">
							<p className="text-text-muted mb-0.5">Uploaded by</p>
							<p className="text-text-secondary font-mono">{shortAddress(transfer.uploader)}</p>
						</div>
						<div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5">
							<p className="text-text-muted mb-0.5">Expires</p>
							<p className={isUnavailable ? "text-accent-red" : "text-text-secondary"}>
								{isRevoked ? "Revoked" : formatTimeLeft(transfer.expiresAt)}
							</p>
						</div>
					</div>

					{/* CID(s) */}
					<div>
						<p className="label mb-1">
							IPFS CID{transfer.chunkCount > 1n ? "s" : ""}
						</p>
						{parseCids(transfer.cids).cidList.map((cid, i) => (
							<div key={i} className="flex items-center gap-2 mb-1">
								{transfer.chunkCount > 1n && (
									<span className="text-text-muted text-xs w-4 shrink-0">{i + 1}.</span>
								)}
								<a
									href={`${IPFS_BASE}/${cid}`}
									target="_blank"
									rel="noopener noreferrer"
									className="font-mono text-xs text-accent-blue hover:underline break-all"
								>
									{cid}
								</a>
							</div>
						))}
					</div>

					{/* Download controls */}
					{dlState.type === "idle" && (
						<button
							onClick={handleDownload}
							disabled={isUnavailable}
							className="btn-accent w-full"
							style={
								!isUnavailable
									? { background: "linear-gradient(135deg, #00c8ff 0%, #0098c4 100%)", color: "#060b14", fontWeight: 600 }
									: { opacity: 0.4 }
							}
						>
							{isRevoked ? "Transfer revoked" : isExpired ? "Transfer expired" : "Download file"}
						</button>
					)}

					{dlState.type === "fetching" && (
						<div className="space-y-2">
							<div className="flex items-center gap-2 text-sm text-text-secondary">
								<div className="w-4 h-4 rounded-full border-2 border-polka-500/30 border-t-polka-500 animate-spin shrink-0" />
								Fetching chunk {dlState.fetched + 1} of {dlState.total} from IPFS…
							</div>
							{dlState.total > 1 && (
								<div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
									<div
										className="h-full bg-polka-500 transition-all duration-300"
										style={{ width: `${(dlState.fetched / dlState.total) * 100}%` }}
									/>
								</div>
							)}
						</div>
					)}

					{dlState.type === "done" && (
						<div className="space-y-4">
							<div className="flex items-center gap-2 text-sm text-accent-green">
								<svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" fill="none">
									<path d="M2 8l4 4 8-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
								Download ready!
							</div>
							<p className="text-xs text-text-secondary">
								If the download didn't start automatically, click the button below:
							</p>
							<a
								href={dlState.blobUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="btn-accent w-full block text-center"
								style={{ background: "linear-gradient(135deg, #00c8ff 0%, #0098c4 100%)", color: "#060b14", fontWeight: 600 }}
							>
								Save {dlState.fileName}
							</a>
						</div>
					)}

					{dlState.type === "cors_fallback" && (
						<div className="space-y-3">
							<p className="text-sm text-accent-yellow">
								Direct fetch blocked by CORS — open each chunk manually:
							</p>
							{dlState.cidList.map((cid, i) => (
								<a
									key={i}
									href={`${IPFS_BASE}/${cid}`}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2 text-xs text-accent-blue hover:underline"
								>
									<svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill="none">
										<path d="M8 1v10M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
									Chunk {i + 1} — {cid.slice(0, 20)}…
								</a>
							))}
						</div>
					)}

					{dlState.type === "error" && (
						<div className="space-y-2">
							<p className="text-sm text-accent-red">Download failed</p>
							<p className="text-xs text-text-secondary break-words">{dlState.message}</p>
							<button
								onClick={() => setDlState({ type: "idle" })}
								className="btn-secondary text-xs"
							>
								Try again
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
