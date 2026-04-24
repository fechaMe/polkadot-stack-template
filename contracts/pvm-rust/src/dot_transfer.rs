//! # DotTransfer — on-chain file transfer registry
//!
//! This is the PolkaVM (RISC-V) smart contract that backs the DotTransfer
//! dapp.  It stores file-transfer metadata on-chain so that a recipient can
//! look up a transfer ID and retrieve the IPFS CIDs needed to download the
//! file.
//!
//! ## Lifecycle
//!
//! 1. **Upload** — the uploader pins file chunks to IPFS, then calls
//!    `createTransfer` to record the CID list, file metadata, and an expiry
//!    timestamp.
//! 2. **Download** — any caller passes the transfer ID to `getTransfer` to
//!    obtain the CIDs (returned as an empty string when expired or revoked).
//! 3. **Manage** — the uploader can call `revokeTransfer` to cancel early or
//!    `extendExpiry` to push the deadline forward.
//! 4. **List** — `getTransfersByUploaderPage(uploader, offset, limit)` returns a
//!    page of transfer IDs (newest-first) plus the total stored count, used by
//!    the "My Transfers" page for incremental / paginated loading.
//!
//! ## Storage layout
//!
//! Each transfer field occupies a dedicated 32-byte EVM-style slot.  The slot
//! key for field `tag` of transfer `id` is `keccak256(id ++ tag)`.  Strings
//! are stored as a length header at the field's base key, followed by
//! consecutive 32-byte content chunks keyed by `keccak256(base ++ chunk_i)`.
//! The uploader's list of transfer IDs is stored separately, keyed by the
//! uploader's 20-byte address.

#![cfg_attr(not(feature = "abi-gen"), no_main, no_std)]

use alloc::string::String;
use pallet_revive_uapi::{HostFnImpl as api, StorageFlags};
use pvm_contract_types::Address;
use ruint::aliases::U256;

#[pvm_contract_macros::contract("DotTransfer.sol", allocator = "bump")]
mod dot_transfer {
    use super::*;

    // Field slot tags — one byte appended to the transfer ID before hashing.
    const SLOT_UPLOADER: u8 = 0;    // Address: who created the transfer
    const SLOT_EXPIRES_AT: u8 = 1;  // U256: Unix timestamp (seconds) after which CIDs are hidden
    const SLOT_FILE_SIZE: u8 = 2;   // U256: total file size in bytes
    const SLOT_CHUNK_COUNT: u8 = 3; // U256: number of IPFS chunks
    const SLOT_REVOKED: u8 = 4;     // bool: permanently cancelled by uploader
    const SLOT_CIDS: u8 = 5;        // String: comma-separated IPFS CIDs
    const SLOT_FILENAME: u8 = 6;    // String: original file name shown to recipient
    const SLOT_LIST_LEN: u8 = 7;    // u64: length of the uploader's transfer list
    const SLOT_DESCRIPTION: u8 = 8; // String: optional note from uploader to recipient

    // ── abuse / scalability limits ────────────────────────────────────────────

    /// Hard cap on the number of transfers a single uploader address may create.
    /// Once this limit is hit, further `create_transfer` calls revert with
    /// `TransferLimitReached`.  Bounds both per-account storage growth and the
    /// cost of `get_transfers_by_uploader_page` queries.
    const MAX_TRANSFERS_PER_UPLOADER: u64 = 500;

    /// Maximum byte length of the pipe-separated IPFS CID list.
    /// A CIDv1 base32 string is ~59 bytes; 4 096 bytes fits ~69 CIDs, which
    /// covers files chunked at 8 MiB each — well above the 50 MiB upload cap.
    const MAX_CIDS_LEN: usize = 4_096;

    /// Maximum byte length of the file name field.
    /// 255 bytes matches the limit imposed by most operating-system file systems.
    const MAX_FILENAME_LEN: usize = 255;

    /// Maximum byte length of the optional description field.
    const MAX_DESCRIPTION_LEN: usize = 512;

    /// Errors returned by every state-mutating entry point.
    pub enum Error {
        /// No transfer exists for the given ID.
        NotFound,
        /// A transfer with this ID was already created.
        AlreadyTaken,
        /// Caller is not the transfer's uploader.
        NotUploader,
        /// Transfer has already been revoked and cannot be modified.
        AlreadyRevoked,
        /// The supplied expiry timestamp is in the past.
        ExpiryInPast,
        /// `file_size` must be greater than zero.
        FileSizeZero,
        /// `cids` string must not be empty.
        EmptyCids,
        /// `chunk_count` must be greater than zero.
        ChunkCountZero,
        /// `new_expires_at` must be strictly greater than the current expiry.
        ExpiryNotExtended,
        /// A string input (`cids`, `file_name`, or `description`) exceeded its
        /// maximum allowed byte length.  Check `MAX_CIDS_LEN`, `MAX_FILENAME_LEN`,
        /// or `MAX_DESCRIPTION_LEN` for the respective limits.
        InputTooLong,
        /// The uploader has reached `MAX_TRANSFERS_PER_UPLOADER` and cannot
        /// create additional transfers until old ones are cleaned up.
        TransferLimitReached,
    }

    impl AsRef<[u8]> for Error {
        fn as_ref(&self) -> &[u8] {
            match self {
                Error::NotFound => b"NotFound",
                Error::AlreadyTaken => b"AlreadyTaken",
                Error::NotUploader => b"NotUploader",
                Error::AlreadyRevoked => b"AlreadyRevoked",
                Error::ExpiryInPast => b"ExpiryInPast",
                Error::FileSizeZero => b"FileSizeZero",
                Error::EmptyCids => b"EmptyCids",
                Error::ChunkCountZero => b"ChunkCountZero",
                Error::ExpiryNotExtended => b"ExpiryNotExtended",
                Error::InputTooLong => b"InputTooLong",
                Error::TransferLimitReached => b"TransferLimitReached",
            }
        }
    }

    // ── storage key helpers ───────────────────────────────────────────────────

    fn keccak256(input: &[u8]) -> [u8; 32] {
        let mut out = [0u8; 32];
        api::hash_keccak_256(input, &mut out);
        out
    }

    fn transfer_field_key(id: &[u8; 32], slot: u8) -> [u8; 32] {
        let mut input = [0u8; 33];
        input[..32].copy_from_slice(id);
        input[32] = slot;
        keccak256(&input)
    }

    fn uploader_meta_key(addr: &[u8; 20], slot: u8) -> [u8; 32] {
        let mut input = [0u8; 21];
        input[..20].copy_from_slice(addr);
        input[20] = slot;
        keccak256(&input)
    }

    fn uploader_item_key(addr: &[u8; 20], index: u64) -> [u8; 32] {
        let mut input = [0u8; 29];
        input[..20].copy_from_slice(addr);
        input[20] = SLOT_LIST_LEN;
        input[21..29].copy_from_slice(&index.to_be_bytes());
        keccak256(&input)
    }

    fn string_chunk_key(base: &[u8; 32], chunk: u32) -> [u8; 32] {
        let mut input = [0u8; 36];
        input[..32].copy_from_slice(base);
        input[32..36].copy_from_slice(&chunk.to_be_bytes());
        keccak256(&input)
    }

    // ── raw 32-byte slot r/w ─────────────────────────────────────────────────

    fn read32(key: &[u8; 32]) -> [u8; 32] {
        let mut buf = [0u8; 32];
        let mut out: &mut [u8] = &mut buf;
        api::get_storage(StorageFlags::empty(), key, &mut out).ok();
        buf
    }

    fn write32(key: &[u8; 32], val: &[u8; 32]) {
        api::set_storage(StorageFlags::empty(), key, val);
    }

    // ── typed r/w ────────────────────────────────────────────────────────────

    fn read_u256(key: &[u8; 32]) -> U256 {
        U256::from_be_bytes(read32(key))
    }

    fn write_u256(key: &[u8; 32], val: U256) {
        write32(key, &val.to_be_bytes::<32>());
    }

    fn read_addr(key: &[u8; 32]) -> Address {
        let buf = read32(key);
        let mut inner = [0u8; 20];
        inner.copy_from_slice(&buf[12..32]);
        Address(inner)
    }

    fn write_addr(key: &[u8; 32], addr: &Address) {
        let mut buf = [0u8; 32];
        buf[12..32].copy_from_slice(&addr.0);
        write32(key, &buf);
    }

    fn read_bool(key: &[u8; 32]) -> bool {
        read32(key)[31] != 0
    }

    fn write_bool(key: &[u8; 32], val: bool) {
        let mut buf = [0u8; 32];
        buf[31] = val as u8;
        write32(key, &buf);
    }

    fn read_u64(key: &[u8; 32]) -> u64 {
        let buf = read32(key);
        let mut arr = [0u8; 8];
        arr.copy_from_slice(&buf[24..32]);
        u64::from_be_bytes(arr)
    }

    fn write_u64(key: &[u8; 32], val: u64) {
        let mut buf = [0u8; 32];
        buf[24..32].copy_from_slice(&val.to_be_bytes());
        write32(key, &buf);
    }

    // Strings are stored as: base_key → length (u32 in bytes [28..32]),
    // string_chunk_key(base, i) → 32-byte chunk i of the UTF-8 bytes.

    fn clear_string(base: &[u8; 32]) {
        let len_buf = read32(base);
        let mut arr = [0u8; 4];
        arr.copy_from_slice(&len_buf[28..32]);
        let len = u32::from_be_bytes(arr) as usize;
        let zero = [0u8; 32];
        let chunks = (len + 31) / 32;
        for i in 0..chunks {
            let ck = string_chunk_key(base, i as u32);
            write32(&ck, &zero);
        }
        write32(base, &zero);
    }

    fn write_string(base: &[u8; 32], s: &str) {
        let bytes = s.as_bytes();
        let len = bytes.len() as u32;
        let mut len_buf = [0u8; 32];
        len_buf[28..32].copy_from_slice(&len.to_be_bytes());
        write32(base, &len_buf);
        let chunks = (bytes.len() + 31) / 32;
        for i in 0..chunks {
            let ck = string_chunk_key(base, i as u32);
            let start = i * 32;
            let end = core::cmp::min(start + 32, bytes.len());
            let mut chunk = [0u8; 32];
            chunk[..end - start].copy_from_slice(&bytes[start..end]);
            write32(&ck, &chunk);
        }
    }

    fn read_string(base: &[u8; 32]) -> String {
        let len_buf = read32(base);
        let mut arr = [0u8; 4];
        arr.copy_from_slice(&len_buf[28..32]);
        let len = u32::from_be_bytes(arr) as usize;
        if len == 0 {
            return String::new();
        }
        let mut result = vec![0u8; len];
        let chunks = (len + 31) / 32;
        for i in 0..chunks {
            let ck = string_chunk_key(base, i as u32);
            let chunk = read32(&ck);
            let start = i * 32;
            let end = core::cmp::min(start + 32, len);
            result[start..end].copy_from_slice(&chunk[..end - start]);
        }
        String::from_utf8(result).unwrap_or_default()
    }

    // ── host function wrappers ────────────────────────────────────────────────

    fn get_caller() -> Address {
        let mut inner = [0u8; 20];
        api::caller(&mut inner);
        Address(inner)
    }

    fn get_timestamp() -> U256 {
        let mut buf = [0u8; 32];
        api::now(&mut buf);
        // pallet_revive writes the timestamp as a SCALE-encoded LE u64 (ms).
        // Divide by 1000 to match EVM block.timestamp (seconds).
        U256::from_le_bytes(buf) / U256::from(1000u64)
    }

    fn is_zero(addr: &Address) -> bool {
        addr.0 == [0u8; 20]
    }

    // ── contract entry points ─────────────────────────────────────────────────

    #[pvm_contract_macros::constructor]
    pub fn new() -> Result<(), Error> {
        Ok(())
    }

    /// Records a new file transfer on-chain.
    ///
    /// Called by the frontend (UploadPage) after IPFS pins succeed.
    /// `transfer_id` is a caller-generated 32-byte identifier (typically a
    /// content hash of the metadata).  Reverts if the ID is already taken,
    /// the expiry is in the past, or any required field is zero/empty.
    #[pvm_contract_macros::method]
    pub fn create_transfer(
        transfer_id: [u8; 32],
        cids: String,
        expires_at: U256,
        file_size: U256,
        file_name: String,
        chunk_count: U256,
        description: String,
    ) -> Result<(), Error> {
        // Reject oversized strings before touching storage.  Without these
        // guards a single transaction could write thousands of storage slots.
        if cids.len() > MAX_CIDS_LEN { return Err(Error::InputTooLong); }
        if file_name.len() > MAX_FILENAME_LEN { return Err(Error::InputTooLong); }
        if description.len() > MAX_DESCRIPTION_LEN { return Err(Error::InputTooLong); }

        if !is_zero(&read_addr(&transfer_field_key(&transfer_id, SLOT_UPLOADER))) {
            return Err(Error::AlreadyTaken);
        }
        if expires_at < get_timestamp() {
            return Err(Error::ExpiryInPast);
        }
        if file_size == U256::ZERO {
            return Err(Error::FileSizeZero);
        }
        if cids.is_empty() {
            return Err(Error::EmptyCids);
        }
        if chunk_count == U256::ZERO {
            return Err(Error::ChunkCountZero);
        }

        let sender = get_caller();
        write_addr(&transfer_field_key(&transfer_id, SLOT_UPLOADER), &sender);
        write_u256(&transfer_field_key(&transfer_id, SLOT_EXPIRES_AT), expires_at);
        write_u256(&transfer_field_key(&transfer_id, SLOT_FILE_SIZE), file_size);
        write_u256(&transfer_field_key(&transfer_id, SLOT_CHUNK_COUNT), chunk_count);
        write_bool(&transfer_field_key(&transfer_id, SLOT_REVOKED), false);
        write_string(&transfer_field_key(&transfer_id, SLOT_CIDS), &cids);
        write_string(&transfer_field_key(&transfer_id, SLOT_FILENAME), &file_name);
        write_string(&transfer_field_key(&transfer_id, SLOT_DESCRIPTION), &description);

        let lk = uploader_meta_key(&sender.0, SLOT_LIST_LEN);
        let len = read_u64(&lk);
        // Enforce the per-uploader cap before appending to prevent unbounded
        // list growth and the associated O(n) query cost.
        if len >= MAX_TRANSFERS_PER_UPLOADER {
            return Err(Error::TransferLimitReached);
        }
        write32(&uploader_item_key(&sender.0, len), &transfer_id);
        write_u64(&lk, len + 1);

        Ok(())
    }

    /// Permanently cancels a transfer.
    ///
    /// Only the original uploader may call this.  Sets the revoked flag and
    /// zeroes out the CID data in storage so the file cannot be downloaded
    /// even through direct storage reads.  Other metadata (file name, size,
    /// uploader address) is retained for auditability.
    #[pvm_contract_macros::method]
    pub fn revoke_transfer(transfer_id: [u8; 32]) -> Result<(), Error> {
        let uploader = read_addr(&transfer_field_key(&transfer_id, SLOT_UPLOADER));
        if is_zero(&uploader) {
            return Err(Error::NotFound);
        }
        let sender = get_caller();
        if uploader != sender {
            return Err(Error::NotUploader);
        }
        let rk = transfer_field_key(&transfer_id, SLOT_REVOKED);
        if read_bool(&rk) {
            return Err(Error::AlreadyRevoked);
        }
        write_bool(&rk, true);
        clear_string(&transfer_field_key(&transfer_id, SLOT_CIDS));

        Ok(())
    }

    /// Returns all stored fields for a transfer.
    ///
    /// Used by DownloadPage (single look-up) and MyTransfersPage (batch).
    /// `cids` is returned as an empty string when the transfer is expired or
    /// revoked, hiding the download location without exposing a separate
    /// access-control check to callers.  The `expired` boolean is derived
    /// on-chain from the current block timestamp.
    #[pvm_contract_macros::method]
    pub fn get_transfer(
        transfer_id: [u8; 32],
    ) -> Result<(String, Address, U256, U256, String, U256, bool, bool, String), Error> {
        let uploader = read_addr(&transfer_field_key(&transfer_id, SLOT_UPLOADER));
        if is_zero(&uploader) {
            return Err(Error::NotFound);
        }
        let expires_at = read_u256(&transfer_field_key(&transfer_id, SLOT_EXPIRES_AT));
        let file_size = read_u256(&transfer_field_key(&transfer_id, SLOT_FILE_SIZE));
        let chunk_count = read_u256(&transfer_field_key(&transfer_id, SLOT_CHUNK_COUNT));
        let revoked = read_bool(&transfer_field_key(&transfer_id, SLOT_REVOKED));
        let expired = get_timestamp() >= expires_at;
        let cids = if revoked || expired {
            String::new()
        } else {
            read_string(&transfer_field_key(&transfer_id, SLOT_CIDS))
        };
        let file_name = read_string(&transfer_field_key(&transfer_id, SLOT_FILENAME));
        let description = read_string(&transfer_field_key(&transfer_id, SLOT_DESCRIPTION));

        Ok((cids, uploader, expires_at, file_size, file_name, chunk_count, expired, revoked, description))
    }

    /// Pushes the expiry forward to `new_expires_at`.
    ///
    /// Only the uploader may call this on a non-revoked transfer.
    /// `new_expires_at` must be strictly greater than the current expiry to
    /// prevent no-op transactions.
    #[pvm_contract_macros::method]
    pub fn extend_expiry(transfer_id: [u8; 32], new_expires_at: U256) -> Result<(), Error> {
        let uploader = read_addr(&transfer_field_key(&transfer_id, SLOT_UPLOADER));
        if is_zero(&uploader) {
            return Err(Error::NotFound);
        }
        let sender = get_caller();
        if uploader != sender {
            return Err(Error::NotUploader);
        }
        if read_bool(&transfer_field_key(&transfer_id, SLOT_REVOKED)) {
            return Err(Error::AlreadyRevoked);
        }
        let current = read_u256(&transfer_field_key(&transfer_id, SLOT_EXPIRES_AT));
        if new_expires_at <= current {
            return Err(Error::ExpiryNotExtended);
        }
        write_u256(&transfer_field_key(&transfer_id, SLOT_EXPIRES_AT), new_expires_at);

        Ok(())
    }

    /// Returns a page of transfer IDs for `uploader`, newest-first, together
    /// with the total number of transfers ever stored for that address.
    ///
    /// Pagination is offset-based:
    /// - `offset = 0` returns the newest `limit` transfers.
    /// - `offset = 20` (after receiving 20 items) returns the next batch.
    /// - Returns `([], total)` when `offset >= total` or `limit == 0`.
    ///
    /// The caller is responsible for capping `limit` to a reasonable page size
    /// (the frontend uses 20) to bound the number of storage reads per call.
    #[pvm_contract_macros::method]
    pub fn get_transfers_by_uploader_page(
        uploader: Address,
        offset: u64,
        limit: u64,
    ) -> (Vec<[u8; 32]>, u64) {
        let lk = uploader_meta_key(&uploader.0, SLOT_LIST_LEN);
        let total = read_u64(&lk);

        if offset >= total || limit == 0 {
            return (Vec::new(), total);
        }

        // Items are appended oldest-first (index 0 = oldest stored).
        // To serve newest-first: the first item in this page lives at
        // storage index (total - 1 - offset); subsequent items step backwards.
        let first_idx = total - 1 - offset;
        // available = first_idx + 1 = total - offset  (no underflow: offset < total)
        let count = limit.min(total - offset);

        let mut result = Vec::with_capacity(count as usize);
        for i in 0..count {
            result.push(read32(&uploader_item_key(&uploader.0, first_idx - i)));
        }
        (result, total)
    }
}
