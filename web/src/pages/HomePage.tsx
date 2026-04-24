import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useChainStore } from "../store/chainStore";
import { useConnection } from "../hooks/useConnection";
import { getClient } from "../hooks/useChain";
import {
	LOCAL_ETH_RPC_URL,
	LOCAL_WS_URL,
	getNetworkPresetEndpoints,
	type NetworkPreset,
} from "../config/network";

export default function HomePage() {
	const { wsUrl, ethRpcUrl, setEthRpcUrl, connected, blockNumber } = useChainStore();
	const { connect } = useConnection();
	const [urlInput, setUrlInput] = useState(wsUrl);
	const [ethRpcInput, setEthRpcInput] = useState(ethRpcUrl);
	const [error, setError] = useState<string | null>(null);
	const [chainName, setChainName] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);

	useEffect(() => {
		setUrlInput(wsUrl);
	}, [wsUrl]);

	useEffect(() => {
		setEthRpcInput(ethRpcUrl);
	}, [ethRpcUrl]);

	useEffect(() => {
		if (!connected) return;
		getClient(wsUrl)
			.getChainSpecData()
			.then((data) => setChainName(data.name))
			.catch(() => {});
	}, [connected, wsUrl]);

	async function handleConnect() {
		setConnecting(true);
		setError(null);
		setChainName(null);
		try {
			const result = await connect(urlInput);
			if (result?.ok && result.chain) {
				setChainName(result.chain.name);
			}
		} catch {
			setError(`Could not connect to ${urlInput}. Is the chain running?`);
		} finally {
			setConnecting(false);
		}
	}

	function applyPreset(preset: NetworkPreset) {
		const endpoints = getNetworkPresetEndpoints(preset);
		setUrlInput(endpoints.wsUrl);
		setEthRpcInput(endpoints.ethRpcUrl);
		setEthRpcUrl(endpoints.ethRpcUrl);
	}

	return (
		<div className="space-y-10 animate-fade-in">
			{/* Hero */}
			<div className="space-y-4 pt-2">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-polka-400 to-polka-700 flex items-center justify-center shadow-glow-lg">
						<svg viewBox="0 0 16 16" className="w-5 h-5" fill="none">
							<path d="M8 2 L8 14 M2 8 L14 8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
							<circle cx="8" cy="8" r="2.5" fill="white" opacity="0.9" />
						</svg>
					</div>
					<h1 className="page-title">
						Star
						<span className="bg-gradient-to-r from-polka-300 to-polka-500 bg-clip-text text-transparent">
							Dot
						</span>
					</h1>
				</div>
				<p className="text-text-secondary text-base leading-relaxed max-w-xl">
					Decentralized file sharing on Polkadot. Upload any file to the Bulletin Chain and
					share it via a PVM smart contract link — no servers, no middlemen.
				</p>
				<Link
					to="/transfer"
					className="inline-flex items-center gap-2 btn-primary text-sm"
				>
					<svg viewBox="0 0 16 16" className="w-4 h-4" fill="none">
						<path d="M8 2v9M4 7l4-5 4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
						<path d="M2 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
					</svg>
					Send a file
				</Link>
			</div>

			{/* How it works */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				{[
					{
						icon: (
							<path d="M8 2v9M4 7l4-5 4 5M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
						),
						title: "Upload",
						desc: "Drop any file up to 5 MiB. It's salted and stored on the Paseo Bulletin Chain, addressable as an IPFS CID.",
					},
					{
						icon: (
							<>
								<rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
								<path d="M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
							</>
						),
						title: "Record",
						desc: "A PolkaVM smart contract on Paseo Asset Hub indexes the transfer — uploader, CID, expiry, and file name — via pallet-revive.",
					},
					{
						icon: (
							<>
								<circle cx="5" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
								<circle cx="11" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
								<circle cx="11" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
								<path d="M7 7l2.5-2M7 9l2.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
							</>
						),
						title: "Share",
						desc: "Copy the generated link. Recipients download directly from IPFS — the contract records the uploader's address and CID, so they can verify who sent it and that the file is intact.",
					},
				].map((step) => (
					<div key={step.title} className="card space-y-3">
						<div className="w-8 h-8 rounded-lg bg-polka-500/10 border border-polka-500/15 flex items-center justify-center">
							<svg viewBox="0 0 16 16" className="w-4 h-4 text-polka-400" fill="none">
								{step.icon}
							</svg>
						</div>
						<h3 className="font-semibold text-text-primary font-display">{step.title}</h3>
						<p className="text-sm text-text-secondary leading-relaxed">{step.desc}</p>
					</div>
				))}
			</div>

			{/* Features */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{[
					{
						title: "No servers",
						desc: "Files are stored on the Paseo Bulletin Chain via pallet-statement and retrieved directly from IPFS. The contract lives on Polkadot — nothing runs on a central host.",
					},
					{
						title: "Configurable expiry",
						desc: "Each transfer has an on-chain expiry (1 hour to 14 days). Once expired, the contract withholds the CID. Bulletin Chain data also auto-drops after ~14 days.",
					},
					{
						title: "Uploader can revoke",
						desc: "The uploader can revoke a transfer at any time. Revocation zeroes the stored CIDs on-chain, making the file unreachable even via direct IPFS lookups.",
					},
					{
						title: "Enumeration-resistant IDs",
						desc: "Transfer IDs are 12-character random alphanumeric slugs. The contract has no global listing — you need the link to find a transfer. IDs cannot be guessed or crawled.",
					},
					{
						title: "Uploader identity on-chain",
						desc: "The uploader's address is recorded immutably at creation time. Anyone with the link can verify who sent the file and that the bytes haven't changed since upload.",
					},
					{
						title: "PolkaVM smart contract",
						desc: "The transfer index is a native Rust contract compiled to RISC-V bytecode and executed by pallet-revive on Paseo Asset Hub, with full Ethereum RPC compatibility.",
					},
				].map((f) => (
					<div key={f.title} className="card space-y-2">
						<h3 className="text-sm font-semibold text-text-primary">{f.title}</h3>
						<p className="text-sm text-text-secondary leading-relaxed">{f.desc}</p>
					</div>
				))}
			</div>

			{/* Connection card */}
			<div className="card space-y-5">
				<h2 className="section-title text-sm font-medium text-text-tertiary uppercase tracking-wider">
					Network
				</h2>

				<div className="flex flex-wrap gap-2">
					<button onClick={() => applyPreset("local")} className="btn-secondary text-xs">
						Local Dev
					</button>
					<button onClick={() => applyPreset("testnet")} className="btn-secondary text-xs">
						Paseo TestNet
					</button>
				</div>

				<div>
					<label className="label">Substrate WebSocket</label>
					<div className="flex gap-2">
						<input
							type="text"
							value={urlInput}
							onChange={(e) => setUrlInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleConnect()}
							placeholder={LOCAL_WS_URL}
							className="input-field flex-1"
						/>
						<button onClick={handleConnect} disabled={connecting} className="btn-primary">
							{connecting ? "Connecting…" : "Connect"}
						</button>
					</div>
				</div>

				<div>
					<label className="label">Ethereum JSON-RPC</label>
					<input
						type="text"
						value={ethRpcInput}
						onChange={(e) => {
							setEthRpcInput(e.target.value);
							setEthRpcUrl(e.target.value);
						}}
						placeholder={LOCAL_ETH_RPC_URL}
						className="input-field w-full"
					/>
					<p className="text-xs text-text-muted mt-1.5">Used by the PVM contract calls.</p>
				</div>

				{/* Status row */}
				<div className="grid grid-cols-3 gap-4 pt-1 border-t border-white/[0.04]">
					<StatusItem label="Status">
						{error ? (
							<span className="text-accent-red text-sm">{error}</span>
						) : connected ? (
							<span className="text-accent-green flex items-center gap-1.5">
								<span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse-slow" />
								Connected
							</span>
						) : connecting ? (
							<span className="text-accent-yellow">Connecting…</span>
						) : (
							<span className="text-text-muted">Disconnected</span>
						)}
					</StatusItem>
					<StatusItem label="Chain">
						{chainName || <span className="text-text-muted">—</span>}
					</StatusItem>
					<StatusItem label="Block">
						<span className="font-mono">#{blockNumber || "—"}</span>
					</StatusItem>
				</div>
			</div>
		</div>
	);
}

function StatusItem({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
				{label}
			</h3>
			<p className="text-base font-semibold text-text-primary">{children}</p>
		</div>
	);
}
