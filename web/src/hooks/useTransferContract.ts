import { type Address, type WalletClient } from "viem";
import { dotTransferAbi, getPublicClient, getTxFees } from "../config/evm";

export type TransferRecord = {
	cids: string;
	uploader: string;
	expiresAt: bigint;
	fileSize: bigint;
	fileName: string;
	chunkCount: bigint;
	expired: boolean;
	revoked: boolean;
	description: string;
};

export type UploaderTransfer = {
	transferId: `0x${string}`;
	slug: string;
	record: TransferRecord;
};

const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const SLUG_LENGTH = 12;
// Largest multiple of SLUG_CHARS.length (36) that fits in a byte.
// Bytes >= this value are discarded to eliminate modulo bias: 7 × 36 = 252.
const SLUG_BIAS_LIMIT = Math.floor(256 / SLUG_CHARS.length) * SLUG_CHARS.length;

/** Generate a random 12-character alphanumeric slug [a-z0-9] with no modulo bias. */
export function generateSlug(): string {
	const result: string[] = [];
	while (result.length < SLUG_LENGTH) {
		const buf = new Uint8Array(SLUG_LENGTH * 2); // generous buffer reduces loop iterations
		crypto.getRandomValues(buf);
		for (const b of buf) {
			if (result.length < SLUG_LENGTH && b < SLUG_BIAS_LIMIT) {
				result.push(SLUG_CHARS[b % SLUG_CHARS.length]);
			}
		}
	}
	return result.join("");
}

/** Encode a slug as a left-aligned bytes32 hex string (unused bytes are 0x00). */
export function slugToBytes32(slug: string): `0x${string}` {
	const bytes = new Uint8Array(32);
	for (let i = 0; i < slug.length && i < 32; i++) {
		bytes[i] = slug.charCodeAt(i);
	}
	return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

/** Decode a left-aligned bytes32 back into a slug string. */
export function bytes32ToSlug(bytes32: `0x${string}`): string {
	const hex = bytes32.slice(2);
	let slug = "";
	for (let i = 0; i < hex.length; i += 2) {
		const charCode = parseInt(hex.slice(i, i + 2), 16);
		if (charCode === 0) break;
		slug += String.fromCharCode(charCode);
	}
	return slug;
}

/**
 * Write a new transfer record to the DotTransfer contract.
 * Accepts a viem WalletClient so callers can use either an injected wallet
 * (MetaMask/SubWallet) or a dev-account client from getWalletClient().
 */
export async function createTransferRecord(
	contractAddress: string,
	slug: string,
	params: {
		cids: string;
		expiresAt: number;
		fileSize: number;
		fileName: string;
		chunkCount: number;
		description: string;
	},
	walletClient: WalletClient,
	ethRpcUrl: string,
): Promise<void> {
	const addr = contractAddress as Address;
	const publicClient = getPublicClient(ethRpcUrl);
	const fees = await getTxFees(ethRpcUrl);

	const txHash = await walletClient.writeContract({
		address: addr,
		abi: dotTransferAbi,
		functionName: "createTransfer",
		args: [
			slugToBytes32(slug),
			params.cids,
			BigInt(params.expiresAt),
			BigInt(params.fileSize),
			params.fileName,
			BigInt(params.chunkCount),
			params.description,
		],
		account: walletClient.account ?? null,
		chain: walletClient.chain ?? null,
		...fees,
	});

	await publicClient.waitForTransactionReceipt({ hash: txHash });
}

/**
 * Extend the expiry of a transfer. Only the original uploader can call this.
 * newExpiresAt must be strictly after the current expiresAt.
 */
export async function extendExpiry(
	contractAddress: string,
	slug: string,
	newExpiresAt: number,
	walletClient: WalletClient,
	ethRpcUrl: string,
): Promise<void> {
	const addr = contractAddress as Address;
	const publicClient = getPublicClient(ethRpcUrl);
	const fees = await getTxFees(ethRpcUrl);

	const txHash = await walletClient.writeContract({
		address: addr,
		abi: dotTransferAbi,
		functionName: "extendExpiry",
		args: [slugToBytes32(slug), BigInt(newExpiresAt)],
		account: walletClient.account ?? null,
		chain: walletClient.chain ?? null,
		...fees,
	});

	await publicClient.waitForTransactionReceipt({ hash: txHash });
}

/**
 * Revoke a transfer. Only the original uploader can call this.
 * Marks the transfer as permanently inaccessible in the contract.
 */
export async function revokeTransfer(
	contractAddress: string,
	slug: string,
	walletClient: WalletClient,
	ethRpcUrl: string,
): Promise<void> {
	const addr = contractAddress as Address;
	const publicClient = getPublicClient(ethRpcUrl);
	const fees = await getTxFees(ethRpcUrl);

	const txHash = await walletClient.writeContract({
		address: addr,
		abi: dotTransferAbi,
		functionName: "revokeTransfer",
		args: [slugToBytes32(slug)],
		account: walletClient.account ?? null,
		chain: walletClient.chain ?? null,
		...fees,
	});

	await publicClient.waitForTransactionReceipt({ hash: txHash });
}

/**
 * Read a transfer record from the DotTransfer contract by slug.
 */
export async function getTransferRecord(
	contractAddress: string,
	slug: string,
	ethRpcUrl: string,
): Promise<TransferRecord> {
	const publicClient = getPublicClient(ethRpcUrl);
	const result = await publicClient.readContract({
		address: contractAddress as Address,
		abi: dotTransferAbi,
		functionName: "getTransfer",
		args: [slugToBytes32(slug)],
	});

	const expiresAt = result[2] as bigint;
	return {
		cids: result[0],
		uploader: result[1],
		expiresAt,
		fileSize: result[3],
		fileName: result[4],
		chunkCount: result[5],
		// Use wall clock rather than the contract's block.timestamp boolean.
		// The chain clock can lag, causing false negatives that render negative diffs.
		expired: BigInt(Math.floor(Date.now() / 1000)) >= expiresAt,
		revoked: result[7],
		description: result[8] ?? "",
	};
}

/** Number of transfers fetched per page — balances initial load time vs. RPC call count. */
export const PAGE_SIZE = 20;

/**
 * Fetch one page of transfers for an uploader, newest-first.
 *
 * offset=0 returns the newest PAGE_SIZE transfers. Pass `transfers.length` as
 * offset for each subsequent "load more" call. Returns both the loaded
 * transfers and the on-chain total so the caller can show a progress indicator.
 */
export async function getTransfersByUploaderPage(
	contractAddress: string,
	uploaderAddress: string,
	offset: number,
	ethRpcUrl: string,
): Promise<{ transfers: UploaderTransfer[]; total: number }> {
	const publicClient = getPublicClient(ethRpcUrl);
	const addr = contractAddress as Address;

	const [transferIds, totalBig] = (await publicClient.readContract({
		address: addr,
		abi: dotTransferAbi,
		functionName: "getTransfersByUploaderPage",
		args: [uploaderAddress as Address, BigInt(offset), BigInt(PAGE_SIZE)],
	})) as [readonly `0x${string}`[], bigint];

	const transfers = await Promise.all(
		transferIds.map(async (transferId) => {
			const result = await publicClient.readContract({
				address: addr,
				abi: dotTransferAbi,
				functionName: "getTransfer",
				args: [transferId],
			});
			const expiresAt = result[2] as bigint;
			const record: TransferRecord = {
				cids: result[0],
				uploader: result[1],
				expiresAt,
				fileSize: result[3],
				fileName: result[4],
				chunkCount: result[5],
				expired: BigInt(Math.floor(Date.now() / 1000)) >= expiresAt,
				revoked: result[7],
				description: result[8] ?? "",
			};
			return { transferId, slug: bytes32ToSlug(transferId), record };
		}),
	);

	return { transfers, total: Number(totalBig) };
}

/** Check that a contract is deployed at the given address. */
export async function checkContractDeployed(
	contractAddress: string,
	ethRpcUrl: string,
): Promise<boolean> {
	try {
		const publicClient = getPublicClient(ethRpcUrl);
		const code = await publicClient.getCode({ address: contractAddress as Address });
		return Boolean(code && code !== "0x");
	} catch {
		return false;
	}
}
