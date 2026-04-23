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

	function getTransfersByUploader(address uploader) external view returns (bytes32[] memory);
}
