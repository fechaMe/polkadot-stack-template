import { describe, it, expect, vi } from "vitest";
import { parseCids, MAX_TRANSFER_SIZE, chunkBytesWithSalt } from "../hooks/useBulletinUpload";

// useBulletin opens a WebSocket lazily; mock it so tests stay offline.
vi.mock("../hooks/useBulletin", () => ({
	checkBulletinAuthorization: vi.fn().mockResolvedValue(true),
	uploadToBulletin: vi.fn().mockResolvedValue(undefined),
}));

const MAX_CHUNK = 8 * 1024 * 1024; // 8 MiB, matches the contract constant
const SALT_SIZE = 32;

// ── parseCids ─────────────────────────────────────────────────────────────────

describe("parseCids", () => {
	it("returns empty cidList and hasSalt=false for an empty string", () => {
		const { cidList, hasSalt } = parseCids("");
		expect(cidList).toHaveLength(0);
		expect(hasSalt).toBe(false);
	});

	it("parses a single CID with no salt marker", () => {
		const { cidList, hasSalt } = parseCids("bafyreiabc123");
		expect(cidList).toEqual(["bafyreiabc123"]);
		expect(hasSalt).toBe(false);
	});

	it("parses multiple pipe-separated CIDs", () => {
		const { cidList, hasSalt } = parseCids("cid1|cid2|cid3");
		expect(cidList).toEqual(["cid1", "cid2", "cid3"]);
		expect(hasSalt).toBe(false);
	});

	it("detects a salt marker and excludes it from cidList", () => {
		const { cidList, hasSalt } = parseCids("bafyreiabc|!salt:deadbeef00");
		expect(cidList).toEqual(["bafyreiabc"]);
		expect(hasSalt).toBe(true);
	});

	it("handles multiple CIDs with a trailing salt marker", () => {
		const { cidList, hasSalt } = parseCids("cid1|cid2|cid3|!salt:00ff");
		expect(cidList).toEqual(["cid1", "cid2", "cid3"]);
		expect(hasSalt).toBe(true);
	});

	it("does not treat a non-salt '!' entry as the salt marker", () => {
		const { cidList, hasSalt } = parseCids("cid1|!notsalt:abc");
		expect(hasSalt).toBe(false);
		expect(cidList).toContain("!notsalt:abc");
	});

	it("only the exact '!salt:' prefix triggers hasSalt", () => {
		const cases = ["!SALT:abc", "!salt", "salt:abc", "!slt:abc"];
		for (const entry of cases) {
			const { hasSalt } = parseCids(`cid|${entry}`);
			expect(hasSalt).toBe(false);
		}
	});

	it("ignores empty segments produced by consecutive pipes", () => {
		// filter(Boolean) removes empty strings
		const { cidList } = parseCids("cid1||cid2");
		expect(cidList).not.toContain("");
	});
});

// ── MAX_TRANSFER_SIZE ─────────────────────────────────────────────────────────

describe("MAX_TRANSFER_SIZE", () => {
	it("equals exactly 50 MiB", () => {
		expect(MAX_TRANSFER_SIZE).toBe(50 * 1024 * 1024);
	});

	it("is larger than one max-chunk size (8 MiB)", () => {
		expect(MAX_TRANSFER_SIZE).toBeGreaterThan(MAX_CHUNK);
	});
});

// ── chunkBytesWithSalt ────────────────────────────────────────────────────────

describe("chunkBytesWithSalt — salt properties", () => {
	it("returns a salt of exactly 32 bytes", () => {
		const { salt } = chunkBytesWithSalt(new Uint8Array(100));
		expect(salt).toHaveLength(SALT_SIZE);
	});

	it("generates a different salt on every call", () => {
		const input = new Uint8Array(100);
		const { salt: s1 } = chunkBytesWithSalt(input);
		const { salt: s2 } = chunkBytesWithSalt(input);
		// Probability of collision is 2^-256; negligible for a test suite.
		expect(s1).not.toEqual(s2);
	});

	it("appends the salt to the last chunk", () => {
		const input = new Uint8Array(100);
		const { chunks, salt } = chunkBytesWithSalt(input);
		const lastChunk = chunks[chunks.length - 1];
		expect(lastChunk.slice(-SALT_SIZE)).toEqual(salt);
	});
});

describe("chunkBytesWithSalt — chunk count", () => {
	it("produces a single chunk for a small file", () => {
		const { chunks } = chunkBytesWithSalt(new Uint8Array(1024));
		expect(chunks).toHaveLength(1);
	});

	it("produces a single chunk for an empty file (salt-only)", () => {
		const { chunks } = chunkBytesWithSalt(new Uint8Array(0));
		expect(chunks).toHaveLength(1);
	});

	it("splits into 2 chunks when data fills exactly one MAX_CHUNK", () => {
		// Last natural chunk is full → salt must overflow into a new chunk
		const { chunks } = chunkBytesWithSalt(new Uint8Array(MAX_CHUNK));
		expect(chunks.length).toBeGreaterThan(1);
	});

	it("produces ceil(size / MAX_CHUNK) + 0 or 1 extra chunks", () => {
		const size = MAX_CHUNK * 2 + 500; // 2 full + 1 partial
		const { chunks } = chunkBytesWithSalt(new Uint8Array(size));
		// Partial last chunk has room for the salt → still 3 chunks
		expect(chunks.length).toBe(3);
	});
});

describe("chunkBytesWithSalt — content integrity", () => {
	it("preserves original file bytes at the start of the first chunk", () => {
		const content = new Uint8Array([10, 20, 30, 40, 50]);
		const { chunks } = chunkBytesWithSalt(content);
		expect(chunks[0].slice(0, 5)).toEqual(content);
	});

	it("total chunked bytes = original size + SALT_SIZE", () => {
		const sizes = [0, 1, 100, 1024, MAX_CHUNK - 1, MAX_CHUNK, MAX_CHUNK + 1];
		for (const size of sizes) {
			const input = new Uint8Array(size);
			const { chunks } = chunkBytesWithSalt(input);
			const total = chunks.reduce((s, c) => s + c.length, 0);
			expect(total).toBe(size + SALT_SIZE);
		}
	});

	it("no individual chunk exceeds MAX_CHUNK_SIZE", () => {
		const sizes = [0, MAX_CHUNK - 1, MAX_CHUNK, MAX_CHUNK + 1, MAX_CHUNK * 3];
		for (const size of sizes) {
			const { chunks } = chunkBytesWithSalt(new Uint8Array(size));
			for (const chunk of chunks) {
				expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK);
			}
		}
	});

	it("same input bytes produce identical content (only salt differs)", () => {
		const input = new Uint8Array([1, 2, 3, 4, 5]);
		const { chunks: c1 } = chunkBytesWithSalt(input);
		const { chunks: c2 } = chunkBytesWithSalt(input);
		// Content before the salt is identical
		const contentLen = input.length;
		expect(c1[0].slice(0, contentLen)).toEqual(c2[0].slice(0, contentLen));
	});
});

// ── parseCids + chunkBytesWithSalt integration ────────────────────────────────

describe("parseCids + chunkBytesWithSalt: salt round-trip semantics", () => {
	it("a CID string with a salt marker always has hasSalt=true", () => {
		const cidString = "bafyreicid1|bafyreicid2|!salt:abcdef1234";
		const { hasSalt, cidList } = parseCids(cidString);
		expect(hasSalt).toBe(true);
		expect(cidList).toHaveLength(2);
	});

	it("chunk count from chunkBytesWithSalt matches cidList length from parseCids", () => {
		// Small file → 1 chunk → cidString should contain 1 actual CID (+ salt marker)
		const input = new Uint8Array(512);
		const { chunks } = chunkBytesWithSalt(input);
		// Simulate what uploadFileToBulletin would produce:
		// one CID per chunk, then a !salt:hex marker
		const fakeCids = chunks.map((_, i) => `fakecid${i}`);
		const fakeSalt = "00".repeat(32);
		const cidString = [...fakeCids, `!salt:${fakeSalt}`].join("|");
		const { cidList } = parseCids(cidString);
		expect(cidList).toHaveLength(chunks.length);
	});
});
