// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title DotTransfer
/// @notice Temporary file sharing via Bulletin Chain IPFS.
///         The TransferID is a client-generated random bytes32 (displayed as a 7-char
///         alphanumeric slug in the URL), preventing enumeration attacks.
///         Files > 8 MiB are chunked; CIDs are pipe-separated ("|").
///         A "!salt:..." entry in the CIDs string signals that 32 random bytes were
///         appended to the last chunk before upload (making identical files produce
///         distinct CIDs). The frontend strips those bytes transparently on download.
///         Compiles to both EVM (solc) and PVM (resolc) bytecode.
contract DotTransfer {
    struct Transfer {
        string cids; // Pipe-separated IPFS CID(s), plus optional "!salt:hex" marker
        address uploader;
        uint256 expiresAt; // Unix timestamp
        uint256 fileSize; // Original file size in bytes (before salt padding)
        string fileName;
        uint256 chunkCount;
        bool revoked;
    }

    mapping(bytes32 => Transfer) private transfers;
    mapping(address => bytes32[]) private uploaderTransfers;

    event TransferCreated(
        bytes32 indexed transferId,
        address indexed uploader,
        uint256 expiresAt,
        string fileName,
        uint256 fileSize
    );

    event TransferRevoked(bytes32 indexed transferId, address indexed uploader);

    /// @notice Store a new file transfer record.
    /// @param transferId Client-generated random ID (7 ASCII chars left-aligned in bytes32).
    /// @param cids Pipe-separated IPFS CID(s), plus optional "!salt:hex" marker.
    /// @param expiresAt Unix timestamp when the transfer expires.
    /// @param fileSize Original file size in bytes.
    /// @param fileName Original file name.
    /// @param chunkCount Number of Bulletin Chain storage transactions (chunks).
    function createTransfer(
        bytes32 transferId,
        string calldata cids,
        uint256 expiresAt,
        uint256 fileSize,
        string calldata fileName,
        uint256 chunkCount
    ) external {
        require(transfers[transferId].uploader == address(0), "ID already taken");
        require(expiresAt > block.timestamp, "Expiration must be in the future");
        require(fileSize > 0, "File size must be positive");
        require(bytes(cids).length > 0, "CIDs cannot be empty");
        require(chunkCount > 0, "Chunk count must be positive");

        transfers[transferId] = Transfer({
            cids: cids,
            uploader: msg.sender,
            expiresAt: expiresAt,
            fileSize: fileSize,
            fileName: fileName,
            chunkCount: chunkCount,
            revoked: false
        });

        uploaderTransfers[msg.sender].push(transferId);

        emit TransferCreated(transferId, msg.sender, expiresAt, fileName, fileSize);
    }

    /// @notice Revoke a transfer. Only callable by the uploader. Cannot be undone.
    function revokeTransfer(bytes32 transferId) external {
        Transfer storage t = transfers[transferId];
        require(t.uploader != address(0), "Transfer not found");
        require(t.uploader == msg.sender, "Not the uploader");
        require(!t.revoked, "Already revoked");
        t.revoked = true;
        emit TransferRevoked(transferId, msg.sender);
    }

    /// @notice Look up a transfer record by its random ID.
    /// @param transferId The bytes32 random ID.
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
            bool revoked
        )
    {
        Transfer storage t = transfers[transferId];
        require(t.uploader != address(0), "Transfer not found");
        return (
            t.cids,
            t.uploader,
            t.expiresAt,
            t.fileSize,
            t.fileName,
            t.chunkCount,
            block.timestamp >= t.expiresAt,
            t.revoked
        );
    }

    /// @notice Get all transfer IDs created by a specific uploader.
    function getTransfersByUploader(address uploader) external view returns (bytes32[] memory) {
        return uploaderTransfers[uploader];
    }
}
