// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface DotTransfer {
	event TransferCreated(
		bytes32 indexed transferId,
		address indexed uploader,
		uint256 expiresAt,
		string fileName,
		uint256 fileSize
	);
	event TransferRevoked(bytes32 indexed transferId, address indexed uploader);
	event TransferExpiryExtended(
		bytes32 indexed transferId,
		address indexed uploader,
		uint256 newExpiresAt
	);

	error NotFound();
	error AlreadyTaken();
	error NotUploader();
	error AlreadyRevoked();
	error ExpiryInPast();
	error FileSizeZero();
	error EmptyCids();
	error ChunkCountZero();
	error ExpiryNotExtended();
	/// A string input (cids, fileName, or description) exceeded its maximum byte length.
	error InputTooLong();
	/// The uploader has reached the per-account transfer cap and cannot create more.
	error TransferLimitReached();

	function createTransfer(
		bytes32 transferId,
		string calldata cids,
		uint256 expiresAt,
		uint256 fileSize,
		string calldata fileName,
		uint256 chunkCount,
		string calldata description
	) external;

	function revokeTransfer(bytes32 transferId) external;

	function extendExpiry(bytes32 transferId, uint256 newExpiresAt) external;

	function getTransfer(
		bytes32 transferId
	)
		external
		view
		returns (
			string memory cids,
			address uploader,
			uint256 expiresAt,
			uint256 fileSize,
			string memory fileName,
			uint256 chunkCount,
			bool expired,
			bool revoked,
			string memory description
		);

	/// Returns a page of transfer IDs (newest-first) and the total stored count for `uploader`.
	/// Use offset=0 for the first page; pass the number of already-received items as offset
	/// for subsequent pages.  Returns ([], total) when offset >= total.
	function getTransfersByUploaderPage(
		address uploader,
		uint64 offset,
		uint64 limit
	) external view returns (bytes32[] memory ids, uint64 total);
}
