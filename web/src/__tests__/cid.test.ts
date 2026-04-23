import { describe, it, expect } from "vitest";
import { hexHashToCid, ipfsUrl } from "../utils/cid";

const KNOWN_HASH_A = `0x${"aa".repeat(32)}`; // 32 bytes of 0xaa
const KNOWN_HASH_B = `0x${"bb".repeat(32)}`; // 32 bytes of 0xbb

// ── hexHashToCid ──────────────────────────────────────────────────────────────

describe("hexHashToCid", () => {
  it("returns a non-empty string", () => {
    expect(hexHashToCid(KNOWN_HASH_A).length).toBeGreaterThan(0);
  });

  it("returns a CIDv1 string (base32 lower — multibase prefix 'b')", () => {
    // Bulletin Chain uses CIDv1 + raw codec + blake2b-256.
    // Base32 lower multibase prefix is the letter 'b'.
    expect(hexHashToCid(KNOWN_HASH_A)[0]).toBe("b");
  });

  it("is deterministic for the same input", () => {
    expect(hexHashToCid(KNOWN_HASH_A)).toBe(hexHashToCid(KNOWN_HASH_A));
  });

  it("produces different CIDs for different hash inputs", () => {
    expect(hexHashToCid(KNOWN_HASH_A)).not.toBe(hexHashToCid(KNOWN_HASH_B));
  });

  it("accepts hex with 0x prefix", () => {
    const withPrefix = `0x${"ab".repeat(32)}`;
    const withoutPrefix = "ab".repeat(32);
    expect(hexHashToCid(withPrefix)).toBe(hexHashToCid(withoutPrefix));
  });

  it("produces a CID of consistent length for any 32-byte hash", () => {
    const hashes = [KNOWN_HASH_A, KNOWN_HASH_B, `0x${"00".repeat(32)}`];
    const lengths = hashes.map((h) => hexHashToCid(h).length);
    // All CIDv1 strings over a 32-byte hash have the same encoded length.
    expect(new Set(lengths).size).toBe(1);
  });

  it("encodes the all-zeros hash without throwing", () => {
    const zeroHash = `0x${"00".repeat(32)}`;
    expect(() => hexHashToCid(zeroHash)).not.toThrow();
    expect(hexHashToCid(zeroHash)[0]).toBe("b");
  });

  it("each unique byte pattern produces a unique CID", () => {
    const hashes = Array.from({ length: 10 }, (_, i) =>
      hexHashToCid(`0x${i.toString(16).padStart(2, "0").repeat(32)}`),
    );
    const unique = new Set(hashes);
    expect(unique.size).toBe(10);
  });
});

// ── ipfsUrl ───────────────────────────────────────────────────────────────────

describe("ipfsUrl", () => {
  it("contains the CID in the URL", () => {
    const cid = "bafyreiabc123xyz";
    expect(ipfsUrl(cid)).toContain(cid);
  });

  it("uses the Paseo IPFS gateway domain", () => {
    expect(ipfsUrl("somecid")).toContain("paseo-ipfs.polkadot.io");
  });

  it("includes the /ipfs/ path segment", () => {
    expect(ipfsUrl("somecid")).toContain("/ipfs/");
  });

  it("returns a valid HTTPS URL", () => {
    const url = ipfsUrl("bafyreiabc");
    expect(url).toMatch(/^https?:\/\//);
  });

  it("appends the CID at the end of the path", () => {
    const cid = "bafy123";
    const url = ipfsUrl(cid);
    expect(url.endsWith(cid)).toBe(true);
  });

  it("produces the same URL structure for any CID", () => {
    const url1 = ipfsUrl("cid-one");
    const url2 = ipfsUrl("cid-two");
    const base1 = url1.replace("cid-one", "");
    const base2 = url2.replace("cid-two", "");
    expect(base1).toBe(base2);
  });
});

// ── hexHashToCid + ipfsUrl integration ───────────────────────────────────────

describe("hexHashToCid → ipfsUrl pipeline", () => {
  it("builds a full IPFS gateway URL from a raw hash", () => {
    const hash = `0x${"de".repeat(32)}`;
    const cid = hexHashToCid(hash);
    const url = ipfsUrl(cid);
    expect(url).toContain("paseo-ipfs.polkadot.io");
    expect(url).toContain(cid);
  });

  it("the same file content always resolves to the same gateway URL", () => {
    const hash = `0x${"ca".repeat(32)}`;
    const url1 = ipfsUrl(hexHashToCid(hash));
    const url2 = ipfsUrl(hexHashToCid(hash));
    expect(url1).toBe(url2);
  });
});
