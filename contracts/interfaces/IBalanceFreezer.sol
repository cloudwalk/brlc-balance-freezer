// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title IBalanceFreezer interface
 * @author CloudWalk Inc.
 * @dev The interface of the contract that responsible for freezing operations.
 */
interface IBalanceFreezer {
    /**
     * @dev Emitted when the frozen balance of a specific account has been changed.
     *
     * @param account The account whose tokens have been frozen or unfrozen.
     * @param newFrozenBalance The updated frozen balance of the account.
     * @param oldFrozenBalance The previous frozen balance of the account.
     * @param txId The off-chain ID of the transaction that caused the frozen balance change.
     */
    event FrozenBalanceChanged(
        address indexed account,
        uint256 newFrozenBalance,
        uint256 oldFrozenBalance,
        bytes32 indexed txId
    );

    /**
     * @dev Emitted when frozen tokens have been transferred between accounts.
     *
     * This event is accompanied by a corresponding event {FrozenBalanceChanged},
     * since the transfer reduces the frozen balance of the source account.
     *
     * @param from The account from which the frozen tokens have been transferred.
     * @param to The account to which the frozen tokens have been transferred.
     * @param amount The amount of the transferred frozen tokens.
     * @param txId The off-chain ID of the transaction that caused the transfer.
     */
    event FrozenBalanceTransfer(
        address indexed from, // Tools: this comment prevents Prettier from formatting into a single line.
        address indexed to,
        uint256 amount,
        bytes32 indexed txId
    );

    /**
     * @dev Emitted when a shard admin status of an account is configured on all underlying shard contracts.
     * @param account The address of the account to configure.
     * @param status The new admin status of the account.
     * @param shardCounter The number of shard contracts on which the admin is configured.
     */
    event ShardAdminConfigured(
        address indexed account,
        bool status,
        uint256 shardCounter
    );

    /// @dev Emitted when a new shard is added to the contract.
    event ShardAdded(address shard);

    /// @dev Emitted when an existing shard is replaced with a new one.
    event ShardReplaced(address newShard, address oldShard);

    /**
     * @dev Increases the frozen balance for an account.
     *
     * Emits a {FrozenBalanceChanged} event.
     *
     * @param account The account to increase frozen balance for.
     * @param amount The amount to increase the frozen balance by.
     * @param txId The transaction ID of the balance frozen change.
     */
    function freezeIncrease(
        address account, // Tools: this comment prevents Prettier from formatting into a single line.
        uint256 amount,
        bytes32 txId
    ) external;

    /**
     * @dev Decreases the frozen balance for an account.
     *
     * Emits a {FrozenBalanceChanged} event.
     *
     * @param account The account to decrease frozen balance for.
     * @param amount The amount to decrease the frozen balance by.
     * @param txId The transaction ID of the balance frozen change.
     */
    function freezeDecrease(
        address account, // Tools: this comment prevents Prettier from formatting into a single line.
        uint256 amount,
        bytes32 txId
    ) external;

    /**
     * @dev Transfers frozen tokens on behalf of an account.
     *
     * Emits a {FrozenBalanceTransfer} event.
     *
     * @param from The account tokens will be transferred from.
     * @param to The account tokens will be transferred to.
     * @param amount The amount of tokens to transfer.
     * @param txId The transaction ID of the transfer.
     */
    function transferFrozen(
        address from, // Tools: this comment prevents Prettier from formatting into a single line.
        address to,
        uint256 amount,
        bytes32 txId
    ) external;

    /**
     * @dev Sets the shards that are allowed to process operations.
     * @param shards The array of shard addresses to add.
     */
    function addShards(address[] memory shards) external;

    /**
     * @dev Replaces the existing shards with a new set of shards.
     * @param fromIndex The index in the internal array to start replacing from.
     * @param shards The array of shard addresses to replace with.
     */
    function replaceShards(uint256 fromIndex, address[] memory shards) external;

    /**
     * @dev Configures the admin status for an account on all underlying shard contracts.
     * @param account The address of the account to configure.
     * @param status The new admin status of the account.
     */
    function configureShardAdmin(address account, bool status) external;

    /**
     * @dev Retrieves the frozen balance of an account.
     *
     * @param account The account to check the balance of.
     * @return The amount of tokens that are frozen for the account.
     */
    function balanceOfFrozen(address account) external view returns (uint256);

    /**
     * @dev Returns the address of the underlying token.
     */
    function underlyingToken() external view returns (address);
}
