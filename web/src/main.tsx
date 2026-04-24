import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import "./index.css";

const HomePage = lazy(() => import("./pages/HomePage"));
const UploadPage = lazy(() => import("./pages/UploadPage"));
const DownloadPage = lazy(() => import("./pages/DownloadPage"));
const MyTransfersPage = lazy(() => import("./pages/MyTransfersPage"));

const routeFallback = (
	<div className="card animate-pulse">
		<div className="h-4 w-32 rounded bg-white/[0.06]" />
		<div className="mt-3 h-3 w-48 rounded bg-white/[0.04]" />
	</div>
);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<HashRouter>
			<Routes>
				<Route element={<App />}>
					<Route
						index
						element={
							<Suspense fallback={routeFallback}>
								<HomePage />
							</Suspense>
						}
					/>
					<Route
						path="transfer"
						element={
							<Suspense fallback={routeFallback}>
								<UploadPage />
							</Suspense>
						}
					/>
					<Route
						path="download/:id"
						element={
							<Suspense fallback={routeFallback}>
								<DownloadPage />
							</Suspense>
						}
					/>
					<Route
						path="my-transfers"
						element={
							<Suspense fallback={routeFallback}>
								<MyTransfersPage />
							</Suspense>
						}
					/>
				</Route>
			</Routes>
		</HashRouter>
	</StrictMode>,
);
