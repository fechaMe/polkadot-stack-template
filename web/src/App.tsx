import { Outlet, Link, useLocation } from "react-router-dom";
import { useChainStore } from "./store/chainStore";
import { useConnectionManagement } from "./hooks/useConnection";

export default function App() {
	const location = useLocation();
	const connected = useChainStore((s) => s.connected);

	useConnectionManagement();

	const navItems = [
		{ path: "/", label: "Home" },
		{ path: "/transfer", label: "Send" },
		{ path: "/my-transfers", label: "My Files" },
	];

	return (
		<div className="min-h-screen bg-pattern relative">
			{/* Ambient gradient orbs */}
			<div
				className="gradient-orb"
				style={{ background: "#00c8ff", top: "-220px", right: "-120px" }}
			/>
			<div
				className="gradient-orb"
				style={{ background: "#7c3aed", bottom: "-220px", left: "-120px" }}
			/>

			{/* Navigation */}
			<nav className="sticky top-0 z-50 border-b border-white/[0.05] backdrop-blur-xl"
				style={{ background: "rgba(6, 11, 20, 0.82)" }}>
				<div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-6">
					<Link to="/" className="flex items-center gap-2.5 shrink-0 group">
						<div className="w-7 h-7 rounded-lg bg-gradient-to-br from-polka-400 to-polka-700 flex items-center justify-center shadow-glow transition-shadow group-hover:shadow-glow-lg">
							<svg viewBox="0 0 16 16" className="w-4 h-4" fill="none">
								<path d="M8 2 L8 14 M2 8 L14 8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
								<circle cx="8" cy="8" r="2.5" fill="white" opacity="0.9" />
							</svg>
						</div>
						<span className="text-base font-semibold text-text-primary font-display tracking-tight">
							StarDot
						</span>
					</Link>

					<div className="flex gap-0.5">
						{navItems.map((item) => (
							<Link
								key={item.path}
								to={item.path}
								className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
									location.pathname === item.path
										? "text-polka-400"
										: "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
								}`}
							>
								{location.pathname === item.path && (
									<span className="absolute inset-0 rounded-lg bg-polka-500/10 border border-polka-500/20" />
								)}
								<span className="relative">{item.label}</span>
							</Link>
						))}
					</div>

					{/* Connection indicator */}
					<div className="ml-auto flex items-center gap-2 shrink-0">
						<span
							className={`w-2 h-2 rounded-full transition-colors duration-500 ${
								connected
									? "bg-accent-green shadow-[0_0_6px_rgba(52,211,153,0.5)]"
									: "bg-text-muted"
							}`}
						/>
						<span className="text-xs text-text-tertiary hidden sm:inline">
							{connected ? "Connected" : "Offline"}
						</span>
					</div>
				</div>
			</nav>

			{/* Main content */}
			<main className="relative z-10 max-w-4xl mx-auto px-4 py-8">
				<Outlet />
			</main>
		</div>
	);
}
