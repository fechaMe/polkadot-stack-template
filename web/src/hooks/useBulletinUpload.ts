import { blake2b } from "blakejs";
import { type PolkadotSigner } from "polkadot-api";
import { hexHashToCid } from "../utils/cid";
import { uploadToBulletin, checkBulletinAuthorization } from "./useBulletin";

const MAX_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB — Bulletin Chain limit per tx
export const MAX_TRANSFER_SIZE = 50 * 1024 * 1024; // 50 MiB total
const SALT_SIZE = 32; // random bytes appended to last chunk to make CID unique per upload

export type BulletinUploadProgress =
	| { phase: "reading" }
	| { phase: "uploading"; chunkIndex: number; totalChunks: number }
	| { phase: "done" };

export type BulletinUploadResult = {
	cids: string; // Pipe-separated IPFS CID(s) plus a "!salt:hex" marker
	chunkCount: number;
};

function bytesToHexCid(bytes: Uint8Array): string {
	const hash = blake2b(bytes, undefined, 32);
	const hexHash = "0x" + Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
	return hexHashToCid(hexHash);
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Split bytes into ≤8 MiB chunks, appending a 32-byte random salt to the last
 * chunk so that identical files always produce distinct CIDs.
 * If the last natural chunk is exactly MAX_CHUNK_SIZE, the overflow goes into
 * a new chunk so we never exceed the per-tx limit.
 */
function chunkBytesWithSalt(bytes: Uint8Array): { chunks: Uint8Array[]; salt: Uint8Array } {
	const salt = new Uint8Array(SALT_SIZE);
	crypto.getRandomValues(salt);

	const raw: Uint8Array[] = [];
	if (bytes.length === 0) {
		// Edge: empty file — salt alone forms the single chunk
		raw.push(new Uint8Array(0));
	} else {
		for (let i = 0; i < bytes.length; i += MAX_CHUNK_SIZE) {
			raw.push(bytes.slice(i, Math.min(i + MAX_CHUNK_SIZE, bytes.length)));
		}
	}

	const last = raw[raw.length - 1];
	if (last.length + SALT_SIZE <= MAX_CHUNK_SIZE) {
		// Salt fits inside the last chunk
		const salted = new Uint8Array(last.length + SALT_SIZE);
		salted.set(last);
		salted.set(salt, last.length);
		raw[raw.length - 1] = salted;
	} else {
		// Last chunk is full — move the tail bytes into a new chunk with the salt
		const keep = last.slice(0, MAX_CHUNK_SIZE - SALT_SIZE);
		const tail = last.slice(MAX_CHUNK_SIZE - SALT_SIZE);
		const extra = new Uint8Array(tail.length + SALT_SIZE);
		extra.set(tail);
		extra.set(salt, tail.length);
		raw[raw.length - 1] = keep;
		raw.push(extra);
	}

	return { chunks: raw, salt };
}

/**
 * Check if the account is authorized for a single chunk upload on the Bulletin Chain.
 */
export async function checkTransferAuthorization(
	address: string,
	fileSize: number,
): Promise<boolean> {
	const chunkSize = Math.min(fileSize + SALT_SIZE, MAX_CHUNK_SIZE);
	return checkBulletinAuthorization(address, chunkSize);
}

/**
 * Upload a file to the Bulletin Chain.
 * Files are chunked into ≤8 MiB pieces; a 32-byte random salt is appended to
 * the last chunk so the same file uploaded twice produces different CIDs.
 * Returns pipe-separated CIDs plus a "!salt:hex" marker for the download path.
 */
export async function uploadFileToBulletin(
	file: File,
	signer: PolkadotSigner,
	onProgress?: (progress: BulletinUploadProgress) => void,
): Promise<BulletinUploadResult> {
	if (file.size > MAX_TRANSFER_SIZE) {
		throw new Error(
			`File too large (${(file.size / 1024 / 1024).toFixed(1)} MiB). Maximum is 50 MiB.`,
		);
	}

	onProgress?.({ phase: "reading" });
	const buffer = await file.arrayBuffer();
	const bytes = new Uint8Array(buffer);

	const { chunks, salt } = chunkBytesWithSalt(bytes);
	const cids: string[] = [];

	for (let i = 0; i < chunks.length; i++) {
		onProgress?.({ phase: "uploading", chunkIndex: i, totalChunks: chunks.length });
		const chunk = chunks[i];
		cids.push(bytesToHexCid(chunk));
		await uploadToBulletin(chunk, signer);
	}

	onProgress?.({ phase: "done" });

	// Append the salt marker so the download path knows to strip SALT_SIZE bytes
	const cidString = [...cids, `!salt:${bytesToHex(salt)}`].join("|");
	return { cids: cidString, chunkCount: chunks.length };
}

/**
 * Parse the CIDs string: separate actual IPFS CIDs from the "!salt:hex" marker.
 */
export function parseCids(cidsString: string): { cidList: string[]; hasSalt: boolean } {
	const parts = cidsString.split("|").filter(Boolean);
	const cidList = parts.filter((p) => !p.startsWith("!salt:"));
	const hasSalt = parts.some((p) => p.startsWith("!salt:"));
	return { cidList, hasSalt };
}

/**
 * Fetch all chunks from the IPFS gateway and reassemble the original file bytes.
 * Strips the trailing salt bytes if the "!salt:..." marker is present in the CIDs string.
 */
export async function fetchTransferFromIpfs(
	cidsString: string,
	onProgress?: (fetched: number, total: number) => void,
): Promise<ArrayBuffer> {
	const { cidList, hasSalt } = parseCids(cidsString);

	const buffers: ArrayBuffer[] = [];
	for (let i = 0; i < cidList.length; i++) {
		onProgress?.(i, cidList.length);
		const url = `https://paseo-ipfs.polkadot.io/ipfs/${cidList[i]}`;
		const res = await fetch(url);
		if (!res.ok) {
			throw new Error(
				`IPFS fetch failed for chunk ${i + 1}/${cidList.length}: HTTP ${res.status}`,
			);
		}
		buffers.push(await res.arrayBuffer());
	}

	onProgress?.(cidList.length, cidList.length);

	// Concatenate all chunks
	const totalSize = buffers.reduce((sum, b) => sum + b.byteLength, 0);
	const combined = new Uint8Array(totalSize);
	let offset = 0;
	for (const buf of buffers) {
		combined.set(new Uint8Array(buf), offset);
		offset += buf.byteLength;
	}

	// Strip the trailing salt bytes from the last chunk
	const stripBytes = hasSalt ? SALT_SIZE : 0;
	return combined.buffer.slice(0, combined.byteLength - stripBytes);
}
