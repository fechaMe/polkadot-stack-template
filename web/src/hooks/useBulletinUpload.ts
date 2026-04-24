import { blake2b } from "blakejs";
import { type PolkadotSigner } from "polkadot-api";
import { hexHashToCid } from "../utils/cid";
import { uploadToBulletin, checkBulletinAuthorization } from "./useBulletin";

const MAX_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB — Bulletin Chain per-tx limit (kept for chunkBytesWithSalt tests)
export const MAX_TRANSFER_SIZE = 5 * 1024 * 1024; // 5 MiB user-facing limit
const SALT_SIZE = 32; // random bytes appended to make each upload's CID unique

export type BulletinUploadProgress =
	| { phase: "reading" }
	| { phase: "uploading" }
	| { phase: "done" };

export type BulletinUploadResult = {
	cids: string; // "ipfs-cid|!salt:hex"
	chunkCount: number;
};

function bytesToHexCid(bytes: Uint8Array): string {
	const hash = blake2b(bytes, undefined, 32);
	const hexHash =
		"0x" +
		Array.from(hash)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	return hexHashToCid(hexHash);
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Split bytes into ≤8 MiB chunks, appending a 32-byte random salt to the last
 * chunk so that identical files always produce distinct CIDs.
 *
 * Exported for unit testing only — uploadFileToBulletin uses the simpler
 * single-upload path directly. With MAX_TRANSFER_SIZE at 5 MiB this always
 * produces exactly one chunk.
 */
export function chunkBytesWithSalt(bytes: Uint8Array): { chunks: Uint8Array[]; salt: Uint8Array } {
	const salt = new Uint8Array(SALT_SIZE);
	crypto.getRandomValues(salt);

	const raw: Uint8Array[] = [];
	if (bytes.length === 0) {
		raw.push(new Uint8Array(0));
	} else {
		for (let i = 0; i < bytes.length; i += MAX_CHUNK_SIZE) {
			raw.push(bytes.slice(i, Math.min(i + MAX_CHUNK_SIZE, bytes.length)));
		}
	}

	const last = raw[raw.length - 1];
	if (last.length + SALT_SIZE <= MAX_CHUNK_SIZE) {
		const salted = new Uint8Array(last.length + SALT_SIZE);
		salted.set(last);
		salted.set(salt, last.length);
		raw[raw.length - 1] = salted;
	} else {
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
 * Check if the account is authorized to upload on the Bulletin Chain.
 */
export async function checkTransferAuthorization(
	address: string,
	fileSize: number,
): Promise<boolean> {
	return checkBulletinAuthorization(address, fileSize + SALT_SIZE);
}

/**
 * Upload a file to the Bulletin Chain via pallet-statement (TransactionStorage).
 * A 32-byte random salt is appended so the same file uploaded twice produces
 * different CIDs. Files must be ≤5 MiB.
 */
export async function uploadFileToBulletin(
	file: File,
	signer: PolkadotSigner,
	onProgress?: (progress: BulletinUploadProgress) => void,
): Promise<BulletinUploadResult> {
	if (file.size > MAX_TRANSFER_SIZE) {
		throw new Error(
			`File too large (${(file.size / 1024 / 1024).toFixed(1)} MiB). Maximum is 5 MiB.`,
		);
	}

	onProgress?.({ phase: "reading" });
	const buffer = await file.arrayBuffer();
	const bytes = new Uint8Array(buffer);

	// Append a random 32-byte salt so repeated uploads of the same file
	// produce distinct CIDs on the Bulletin Chain.
	const salt = new Uint8Array(SALT_SIZE);
	crypto.getRandomValues(salt);
	const salted = new Uint8Array(bytes.length + SALT_SIZE);
	salted.set(bytes);
	salted.set(salt, bytes.length);

	const cid = bytesToHexCid(salted);

	onProgress?.({ phase: "uploading" });
	await uploadToBulletin(salted, signer);

	onProgress?.({ phase: "done" });

	return {
		cids: `${cid}|!salt:${bytesToHex(salt)}`,
		chunkCount: 1,
	};
}

/**
 * Parse the CIDs string: separate actual IPFS CIDs from the "!salt:hex" marker.
 * Compatible with both single-CID (current) and multi-CID (legacy) formats.
 */
export function parseCids(cidsString: string): { cidList: string[]; hasSalt: boolean } {
	const parts = cidsString.split("|").filter(Boolean);
	const cidList = parts.filter((p) => !p.startsWith("!salt:"));
	const hasSalt = parts.some((p) => p.startsWith("!salt:"));
	return { cidList, hasSalt };
}

/**
 * Fetch the file bytes from the IPFS gateway and strip the trailing salt bytes.
 * Handles both single-CID (current) and multi-CID (legacy) formats.
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
			throw new Error(`IPFS fetch failed: HTTP ${res.status}`);
		}
		buffers.push(await res.arrayBuffer());
	}

	onProgress?.(cidList.length, cidList.length);

	const totalSize = buffers.reduce((sum, b) => sum + b.byteLength, 0);
	const combined = new Uint8Array(totalSize);
	let offset = 0;
	for (const buf of buffers) {
		combined.set(new Uint8Array(buf), offset);
		offset += buf.byteLength;
	}

	const stripBytes = hasSalt ? SALT_SIZE : 0;
	return combined.buffer.slice(0, combined.byteLength - stripBytes);
}
