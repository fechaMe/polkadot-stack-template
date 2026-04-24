import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { deployments } from "../config/deployments";
import { useChainStore } from "../store/chainStore";
import {
	getTransfersByUploaderPage,
	revokeTransfer,
	extendExpiry,
	checkContractDeployed,
	type UploaderTransfer,
} from "../hooks/useTransferContract";
import { evmDevAccounts, getWalletClient } from "../config/evm";

// ── expiry options (reused from UploadPage) ───────────────────────────────────
const EXPIRY_OPTIONS = [
	{ label: "1 hour", hours: 1 },
	{ label: "6 hours", hours: 6 },
	{ label: "24 hours", hours: 24 },
	{ label: "48 hours", hours: 48 },
	{ label: "7 days", hours: 7 * 24 },
	{ label: "14 days", hours: 14 * 24 },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: bigint): string {
	const n = Number(bytes);
	if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
	if (n >= 1024) return `${(n / 1024).toFixed(0)} KiB`;
	return `${n} B`;
}

function formatExpiry(expiresAt: bigint, expired: boolean, revoked: boolean): string {
	if (revoked) return "Revoked";
	if (expired) return "Expired";
	const nowSec = BigInt(Math.floor(Date.now() / 1000));
	const diff = Number(expiresAt - nowSec);
	const days = Math.floor(diff / 86400);
	const hours = Math.floor((diff % 86400) / 3600);
	const mins = Math.floor((diff % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}

function formatAbsDate(expiresAt: bigint): string {
	return new Date(Number(expiresAt) * 1000).toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function getFileCategory(fileName: string): string {
	const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
	if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "tiff", "avif"].includes(ext))
		return "image";
	if (["mp4", "mov", "avi", "mkv", "webm", "m4v", "ogv"].includes(ext)) return "video";
	if (["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"].includes(ext)) return "audio";
	if (ext === "pdf") return "pdf";
	if (
		[
			"js",
			"ts",
			"jsx",
			"tsx",
			"py",
			"rs",
			"go",
			"java",
			"c",
			"cpp",
			"h",
			"css",
			"html",
			"json",
			"xml",
			"yaml",
			"yml",
			"sh",
			"bash",
			"toml",
			"md",
			"rb",
			"php",
			"cs",
			"swift",
			"kt",
		].includes(ext)
	)
		return "code";
	if (["zip", "tar", "gz", "rar", "7z", "bz2", "xz", "zst"].includes(ext)) return "archive";
	if (["txt", "log", "csv", "tsv"].includes(ext)) return "text";
	return "file";
}

// ── file type icons ───────────────────────────────────────────────────────────

function FileTypeIcon({ fileName, className }: { fileName: string; className?: string }) {
	const cat = getFileCategory(fileName);
	const cls = className ?? "w-4 h-4";

	if (cat === "image")
		return (
			<svg className={cls} viewBox="0 0 20 20" fill="none">
				<rect
					x="2"
					y="3"
					width="16"
					height="14"
					rx="2"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<circle cx="7" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.25" />
				<path
					d="M2 13l4-4 3 3 3-3 4 4"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);

	if (cat === "video")
		return (
			<svg className={cls} viewBox="0 0 20 20" fill="none">
				<rect
					x="2"
					y="4"
					width="12"
					height="12"
					rx="2"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<path
					d="M14 7.5l4-2v7l-4-2V7.5z"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinejoin="round"
				/>
			</svg>
		);

	if (cat === "audio")
		return (
			<svg className={cls} viewBox="0 0 20 20" fill="none">
				<path
					d="M8 15V5l8-2v10"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
				<circle cx="6" cy="15" r="2" stroke="currentColor" strokeWidth="1.5" />
				<circle cx="14" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" />
			</svg>
		);

	if (cat === "pdf")
		return (
			<svg className={cls} viewBox="0 0 20 20" fill="none">
				<path
					d="M4 4a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<path d="M11 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				<path
					d="M7 12h6M7 14.5h4"
					stroke="currentColor"
					strokeWidth="1.25"
					strokeLinecap="round"
				/>
			</svg>
		);

	if (cat === "code")
		return (
			<svg className={cls} viewBox="0 0 20 20" fill="none">
				<path
					d="M7 7l-4 3 4 3M13 7l4 3-4 3M11 5l-2 10"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);

	if (cat === "archive")
		return (
			<svg className={cls} viewBox="0 0 20 20" fill="none">
				<rect
					x="2"
					y="6"
					width="16"
					height="11"
					rx="1.5"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<path d="M2 9h16" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
				<rect
					x="3"
					y="3"
					width="14"
					height="3"
					rx="1"
					stroke="currentColor"
					strokeWidth="1.25"
				/>
				<path
					d="M8 12.5h4"
					stroke="currentColor"
					strokeWidth="1.25"
					strokeLinecap="round"
				/>
			</svg>
		);

	if (cat === "text")
		return (
			<svg className={cls} viewBox="0 0 20 20" fill="none">
				<path
					d="M4 4a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<path d="M11 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
				<path
					d="M7 11h6M7 13.5h4"
					stroke="currentColor"
					strokeWidth="1.25"
					strokeLinecap="round"
				/>
			</svg>
		);

	// default file icon
	return (
		<svg className={cls} viewBox="0 0 20 20" fill="none">
			<path
				d="M4 4a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
				stroke="currentColor"
				strokeWidth="1.5"
			/>
			<path d="M11 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

// ── status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ expired, revoked }: { expired: boolean; revoked: boolean }) {
	if (revoked)
		return (
			<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-red/10 text-accent-red border border-accent-red/20">
				Revoked
			</span>
		);
	if (expired)
		return (
			<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/[0.05] text-text-muted border border-white/[0.06]">
				Expired
			</span>
		);
	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/20">
			Active
		</span>
	);
}

// ── url helper ────────────────────────────────────────────────────────────────

function getAppBaseUrl(): string {
	if (import.meta.env.VITE_APP_URL) {
		return (import.meta.env.VITE_APP_URL as string).replace(/\/$/, "");
	}
	const { origin, pathname } = window.location;
	if (origin.includes(".app.dot.li")) return origin.replace(".app.dot.li", ".dot.li");
	return origin + (pathname === "/" ? "" : pathname.replace(/\/$/, ""));
}

// ── sort / filter types ───────────────────────────────────────────────────────

type SortKey = "default" | "name" | "expiry" | "size";
type FilterStatus = "all" | "active" | "expired" | "revoked";

// ── main component ────────────────────────────────────────────────────────────

export default function MyTransfersPage() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const [selectedIndex, setSelectedIndex] = useState(0);

	const contractAddress = deployments.dotTransfer ?? "";
	const evmAddress = evmDevAccounts[selectedIndex].account.address;

	const [transfers, setTransfers] = useState<UploaderTransfer[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);

	// revoke state
	const [revoking, setRevoking] = useState<string | null>(null);
	const [revokeError, setRevokeError] = useState<string | null>(null);

	// extend-expiry state per slug
	const [extendOpen, setExtendOpen] = useState<string | null>(null);
	const [extendHours, setExtendHours] = useState(24);
	const [extending, setExtending] = useState<string | null>(null);
	const [extendError, setExtendError] = useState<string | null>(null);

	// sort / filter
	const [sortKey, setSortKey] = useState<SortKey>("default");
	const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
	const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

	const loadTransfers = useCallback(async () => {
		if (!contractAddress) return;
		setLoading(true);
		setLoadError(null);
		setTransfers([]);
		setTotal(0);
		try {
			const deployed = await checkContractDeployed(contractAddress, ethRpcUrl);
			if (!deployed) {
				setLoadError(`No DotTransfer contract found at ${contractAddress}.`);
				return;
			}
			const { transfers: results, total: t } = await getTransfersByUploaderPage(
				contractAddress,
				evmAddress,
				0,
				ethRpcUrl,
			);
			setTransfers(results);
			setTotal(t);
		} catch (err) {
			setLoadError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [evmAddress, contractAddress, ethRpcUrl]);

	async function loadMore() {
		setLoadingMore(true);
		try {
			const { transfers: more, total: t } = await getTransfersByUploaderPage(
				contractAddress,
				evmAddress,
				transfers.length,
				ethRpcUrl,
			);
			setTransfers((prev) => [...prev, ...more]);
			setTotal(t);
		} catch (err) {
			setLoadError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoadingMore(false);
		}
	}

	useEffect(() => {
		loadTransfers();
	}, [loadTransfers]);

	async function handleRevoke(slug: string) {
		setRevoking(slug);
		setRevokeError(null);
		try {
			const walletClient = await getWalletClient(selectedIndex, ethRpcUrl);
			await revokeTransfer(contractAddress, slug, walletClient, ethRpcUrl);
			setTransfers((prev) =>
				prev.map((t) =>
					t.slug === slug ? { ...t, record: { ...t.record, revoked: true } } : t,
				),
			);
		} catch (err) {
			setRevokeError(err instanceof Error ? err.message : String(err));
		} finally {
			setRevoking(null);
		}
	}

	async function handleExtend(slug: string, currentExpiresAt: bigint) {
		setExtending(slug);
		setExtendError(null);
		try {
			const walletClient = await getWalletClient(selectedIndex, ethRpcUrl);
			const nowSec = Math.floor(Date.now() / 1000);
			// Extend from now (not from current expiry) so expired transfers can be revived
			const newExpiresAt = nowSec + extendHours * 3600;
			const newExpiresAtBig = BigInt(newExpiresAt);
			if (newExpiresAtBig <= currentExpiresAt) {
				setExtendError("New expiry must be later than the current one.");
				return;
			}
			await extendExpiry(contractAddress, slug, newExpiresAt, walletClient, ethRpcUrl);
			setTransfers((prev) =>
				prev.map((t) =>
					t.slug === slug
						? {
								...t,
								record: {
									...t.record,
									expiresAt: newExpiresAtBig,
									expired: false,
								},
							}
						: t,
				),
			);
			setExtendOpen(null);
		} catch (err) {
			setExtendError(err instanceof Error ? err.message : String(err));
		} finally {
			setExtending(null);
		}
	}

	// ── filtered + sorted list ──────────────────────────────────────────────

	const displayedTransfers = useMemo(() => {
		let list = [...transfers];

		// filter
		if (filterStatus !== "all") {
			list = list.filter(({ record }) => {
				if (filterStatus === "active") return !record.expired && !record.revoked;
				if (filterStatus === "expired") return record.expired && !record.revoked;
				if (filterStatus === "revoked") return record.revoked;
				return true;
			});
		}

		// sort (default = insertion order already reversed by the hook)
		if (sortKey !== "default") {
			list.sort((a, b) => {
				let cmp = 0;
				if (sortKey === "name") {
					cmp = (a.record.fileName || a.slug).localeCompare(b.record.fileName || b.slug);
				} else if (sortKey === "expiry") {
					cmp =
						a.record.expiresAt < b.record.expiresAt
							? -1
							: a.record.expiresAt > b.record.expiresAt
								? 1
								: 0;
				} else if (sortKey === "size") {
					cmp =
						a.record.fileSize < b.record.fileSize
							? -1
							: a.record.fileSize > b.record.fileSize
								? 1
								: 0;
				}
				return sortDir === "asc" ? cmp : -cmp;
			});
		}

		return list;
	}, [transfers, filterStatus, sortKey, sortDir]);

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("asc");
		}
	}

	const appBase = getAppBaseUrl();

	// ── counts for filter tabs ──────────────────────────────────────────────
	const counts = useMemo(
		() => ({
			all: transfers.length,
			active: transfers.filter((t) => !t.record.expired && !t.record.revoked).length,
			expired: transfers.filter((t) => t.record.expired && !t.record.revoked).length,
			revoked: transfers.filter((t) => t.record.revoked).length,
		}),
		[transfers],
	);

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="flex items-start justify-between">
				<div className="space-y-1">
					<h1 className="page-title text-polka-400">My Files</h1>
					<p className="text-text-secondary">
						All transfers you&apos;ve uploaded, stored on Paseo Asset Hub.
					</p>
				</div>
				<Link to="/transfer" className="btn-secondary text-sm shrink-0">
					+ New Transfer
				</Link>
			</div>

			{/* Dev account selector */}
			<div className="card space-y-3">
				<div className="flex items-center justify-between">
					<div>
						<label className="label mb-0.5">Dev Account</label>
						<p className="font-mono text-xs text-text-muted">{evmAddress}</p>
					</div>
					<div className="flex items-center gap-2">
						<select
							value={selectedIndex}
							onChange={(e) => setSelectedIndex(parseInt(e.target.value))}
							className="input-field text-sm"
							disabled={loading}
						>
							{evmDevAccounts.map((acc, i) => (
								<option key={i} value={i}>
									{acc.name}
								</option>
							))}
						</select>
						<button
							onClick={loadTransfers}
							disabled={loading}
							className="btn-secondary text-xs"
						>
							{loading ? "Loading…" : "Refresh"}
						</button>
					</div>
				</div>
			</div>

			{loadError && (
				<div className="card space-y-2">
					<p className="text-sm text-accent-red">Failed to load transfers</p>
					<p className="text-xs text-text-secondary break-words">{loadError}</p>
					<button onClick={loadTransfers} className="btn-secondary text-xs">
						Retry
					</button>
				</div>
			)}

			{loading && (
				<div className="card text-center py-10">
					<div className="w-6 h-6 rounded-full border-2 border-polka-500/30 border-t-polka-500 animate-spin mx-auto mb-3" />
					<p className="text-text-secondary text-sm">Querying Paseo Asset Hub…</p>
				</div>
			)}

			{!loading && !loadError && transfers.length === 0 && (
				<div className="card text-center py-10 space-y-3">
					<p className="text-text-secondary text-sm">
						No transfers found for this address.
					</p>
					<Link to="/transfer" className="btn-secondary text-sm inline-block">
						Upload your first file
					</Link>
				</div>
			)}

			{revokeError && (
				<div className="rounded-lg bg-accent-red/10 border border-accent-red/20 px-3 py-2 text-xs text-accent-red">
					Revoke failed: {revokeError}
				</div>
			)}

			{!loading && transfers.length > 0 && (
				<>
					{/* Filter tabs + sort controls */}
					<div className="flex flex-wrap items-center justify-between gap-3">
						{/* Status filter tabs */}
						<div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
							{(["all", "active", "expired", "revoked"] as FilterStatus[]).map(
								(f) => (
									<button
										key={f}
										onClick={() => setFilterStatus(f)}
										className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
											filterStatus === f
												? "bg-polka-500/20 text-polka-400"
												: "text-text-muted hover:text-text-secondary"
										}`}
									>
										{f.charAt(0).toUpperCase() + f.slice(1)}{" "}
										<span className="opacity-60">{counts[f]}</span>
									</button>
								),
							)}
						</div>

						{/* Sort controls */}
						<div className="flex items-center gap-1.5 text-xs text-text-muted">
							<span>Sort:</span>
							{(["name", "expiry", "size"] as SortKey[]).map((k) => (
								<button
									key={k}
									onClick={() => toggleSort(k)}
									className={`px-2 py-1 rounded-md border transition-colors ${
										sortKey === k
											? "border-polka-500/30 text-polka-400 bg-polka-500/10"
											: "border-white/[0.06] text-text-muted hover:text-text-secondary"
									}`}
								>
									{k.charAt(0).toUpperCase() + k.slice(1)}
									{sortKey === k && (
										<span className="ml-1">
											{sortDir === "asc" ? "↑" : "↓"}
										</span>
									)}
								</button>
							))}
						</div>
					</div>

					{displayedTransfers.length === 0 && (
						<div className="card text-center py-8">
							<p className="text-text-muted text-sm">
								No transfers match this filter.
							</p>
						</div>
					)}

					{transfers.length > 0 && (
						<p className="text-xs text-text-muted text-right">
							{transfers.length < total
								? `Showing ${transfers.length} of ${total}`
								: `${total} transfer${total !== 1 ? "s" : ""}`}
						</p>
					)}

					<div className="space-y-2">
						{displayedTransfers.map(({ slug, record }) => {
							const isActive = !record.expired && !record.revoked;
							const canExtend = !record.revoked;
							const isBeingRevoked = revoking === slug;
							const isBeingExtended = extending === slug;
							const isExtendOpen = extendOpen === slug;
							const shareLink = `${appBase}/#/download/${slug}`;

							return (
								<div key={slug} className="card space-y-3">
									<div className="flex items-start gap-3">
										<div className="w-8 h-8 rounded-lg bg-polka-500/10 border border-polka-500/20 flex items-center justify-center shrink-0 mt-0.5 text-polka-400">
											<FileTypeIcon
												fileName={record.fileName || slug}
												className="w-4 h-4"
											/>
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2 flex-wrap">
												<p className="text-text-primary font-medium text-sm break-all">
													{record.fileName || `transfer-${slug}`}
												</p>
												<StatusBadge
													expired={record.expired}
													revoked={record.revoked}
												/>
											</div>
											<p className="text-text-muted text-xs mt-0.5">
												{formatSize(record.fileSize)} ·{" "}
												{record.chunkCount > 1n
													? `${record.chunkCount} chunks · `
													: ""}
												<span title={formatAbsDate(record.expiresAt)}>
													{formatExpiry(
														record.expiresAt,
														record.expired,
														record.revoked,
													)}
												</span>
												{isActive && " remaining"}
											</p>
											{record.description && (
												<p className="text-text-secondary text-xs mt-1 italic">
													{record.description}
												</p>
											)}
										</div>
									</div>

									<div className="flex items-center gap-2">
										<a
											href={shareLink}
											target="_blank"
											rel="noopener noreferrer"
											className="font-mono text-xs text-accent-blue hover:underline truncate flex-1"
										>
											#{slug}
										</a>
										<button
											onClick={() => navigator.clipboard.writeText(shareLink)}
											className="btn-secondary text-xs shrink-0"
										>
											Copy link
										</button>
										{canExtend && (
											<button
												onClick={() => {
													setExtendOpen(isExtendOpen ? null : slug);
													setExtendError(null);
													setExtendHours(24);
												}}
												disabled={isBeingExtended}
												className={`text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
													isExtendOpen
														? "border-polka-500/40 text-polka-400 bg-polka-500/10"
														: "border-white/[0.1] text-text-muted hover:text-text-secondary"
												}`}
											>
												Extend
											</button>
										)}
										{isActive && (
											<button
												onClick={() => handleRevoke(slug)}
												disabled={isBeingRevoked}
												className="text-xs px-3 py-1.5 rounded-lg border border-accent-red/30 text-accent-red hover:bg-accent-red/10 transition-colors disabled:opacity-40 shrink-0"
											>
												{isBeingRevoked ? "Revoking…" : "Revoke"}
											</button>
										)}
									</div>

									{/* Inline extend-expiry form */}
									{isExtendOpen && (
										<div className="rounded-lg border border-polka-500/20 bg-polka-500/[0.04] p-3 space-y-3">
											<p className="text-xs text-text-secondary font-medium">
												Extend expiry
											</p>
											<div className="flex items-center gap-2">
												<select
													value={extendHours}
													onChange={(e) =>
														setExtendHours(parseInt(e.target.value))
													}
													className="input-field text-xs flex-1"
													disabled={isBeingExtended}
												>
													{EXPIRY_OPTIONS.map((opt) => (
														<option key={opt.hours} value={opt.hours}>
															{opt.label} from now
														</option>
													))}
												</select>
												<button
													onClick={() =>
														handleExtend(slug, record.expiresAt)
													}
													disabled={isBeingExtended}
													className="btn-secondary text-xs shrink-0 disabled:opacity-40"
												>
													{isBeingExtended ? "Confirming…" : "Confirm"}
												</button>
												<button
													onClick={() => {
														setExtendOpen(null);
														setExtendError(null);
													}}
													className="text-xs text-text-muted hover:text-text-secondary"
												>
													Cancel
												</button>
											</div>
											{extendError && (
												<p className="text-xs text-accent-red">
													{extendError}
												</p>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>

					{transfers.length < total && (
						<button
							onClick={loadMore}
							disabled={loadingMore}
							className="btn-secondary w-full text-sm"
						>
							{loadingMore
								? "Loading…"
								: `Load more (${transfers.length} of ${total})`}
						</button>
					)}
				</>
			)}
		</div>
	);
}
