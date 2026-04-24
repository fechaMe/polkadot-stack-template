import { describe, it, expect } from "vitest";
import { generateSlug, slugToBytes32, bytes32ToSlug } from "../hooks/useTransferContract";

// ── generateSlug ─────────────────────────────────────────────────────────────

describe("generateSlug", () => {
	it("produces a 7-character string", () => {
		expect(generateSlug()).toHaveLength(7);
	});

	it("uses only lowercase alphanumeric characters [a-z0-9]", () => {
		for (let i = 0; i < 20; i++) {
			expect(generateSlug()).toMatch(/^[a-z0-9]{7}$/);
		}
	});

	it("produces unique values across repeated calls", () => {
		const slugs = new Set(Array.from({ length: 100 }, () => generateSlug()));
		// With 62^7 ≈ 3.5 trillion possibilities, all 100 should be unique.
		expect(slugs.size).toBe(100);
	});

	it("does not produce empty strings", () => {
		for (let i = 0; i < 20; i++) {
			expect(generateSlug().length).toBeGreaterThan(0);
		}
	});
});

// ── slugToBytes32 ─────────────────────────────────────────────────────────────

describe("slugToBytes32", () => {
	it("returns a 0x-prefixed 64-hex-char string (32 bytes)", () => {
		expect(slugToBytes32("abcdefg")).toMatch(/^0x[0-9a-f]{64}$/);
	});

	it("left-aligns ASCII chars starting at byte 0", () => {
		const result = slugToBytes32("abc");
		// 'a'=0x61, 'b'=0x62, 'c'=0x63
		expect(result.slice(2, 8)).toBe("616263");
	});

	it("zero-pads all bytes after the slug", () => {
		const result = slugToBytes32("abc");
		// 3 bytes used → remaining 29 bytes (58 hex chars) must be zero
		expect(result.slice(8)).toBe("0".repeat(58));
	});

	it("encodes a full 7-character slug correctly", () => {
		const slug = "abcdefg";
		const result = slugToBytes32(slug);
		const expected = slug
			.split("")
			.map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
			.join("");
		expect(result.slice(2, 16)).toBe(expected);
		// remaining 25 bytes are zero
		expect(result.slice(16)).toBe("0".repeat(50));
	});

	it("encodes a single character", () => {
		const result = slugToBytes32("z");
		expect(result.slice(2, 4)).toBe("7a"); // 'z' = 0x7a
		// 1 byte used → remaining 31 bytes = 62 hex zeros
		expect(result.slice(4)).toBe("0".repeat(62));
	});

	it("encodes digits correctly", () => {
		const result = slugToBytes32("0123456");
		// '0'=0x30, '1'=0x31, ...
		expect(result.slice(2, 16)).toBe("30313233343536");
	});
});

// ── bytes32ToSlug ─────────────────────────────────────────────────────────────

describe("bytes32ToSlug", () => {
	it("decodes 'abc' from a left-aligned bytes32", () => {
		// 'a'=0x61, 'b'=0x62, 'c'=0x63, then 29 zero bytes
		const hex = `0x616263${"00".repeat(29)}` as `0x${string}`;
		expect(bytes32ToSlug(hex)).toBe("abc");
	});

	it("stops at the first null byte", () => {
		// 'a', null, 'c', zeros → only 'a' is returned
		const hex = `0x6100${"00".repeat(30)}` as `0x${string}`;
		expect(bytes32ToSlug(hex)).toBe("a");
	});

	it("returns an empty string for an all-zero bytes32", () => {
		const hex = `0x${"00".repeat(32)}` as `0x${string}`;
		expect(bytes32ToSlug(hex)).toBe("");
	});

	it("returns all 7 slug chars when bytes 7-31 are zero", () => {
		const slug = "stardot";
		const hex = slugToBytes32(slug);
		expect(bytes32ToSlug(hex)).toBe(slug);
	});
});

// ── slugToBytes32 / bytes32ToSlug roundtrip ───────────────────────────────────

describe("slugToBytes32 / bytes32ToSlug roundtrip", () => {
	const cases = ["a", "abc", "abcdefg", "1234567", "a1b2c3d", "zzzzzzz", "0000000"];

	for (const slug of cases) {
		it(`roundtrips "${slug}"`, () => {
			expect(bytes32ToSlug(slugToBytes32(slug))).toBe(slug);
		});
	}

	it("roundtrips a randomly generated slug", () => {
		const slug = generateSlug();
		expect(bytes32ToSlug(slugToBytes32(slug))).toBe(slug);
	});

	it("roundtrips 50 random slugs", () => {
		for (let i = 0; i < 50; i++) {
			const slug = generateSlug();
			expect(bytes32ToSlug(slugToBytes32(slug))).toBe(slug);
		}
	});
});

// ── bytes32ToSlug contract: only reads slug-safe chars ───────────────────────

describe("bytes32ToSlug character handling", () => {
	it("decodes digits '0'-'9' correctly", () => {
		const hex = `0x${"30".repeat(7)}${"00".repeat(25)}` as `0x${string}`;
		expect(bytes32ToSlug(hex)).toBe("0000000");
	});

	it("decodes the full charset boundary: 'z' (0x7a)", () => {
		const hex = `0x7a${"00".repeat(31)}` as `0x${string}`;
		expect(bytes32ToSlug(hex)).toBe("z");
	});
});
