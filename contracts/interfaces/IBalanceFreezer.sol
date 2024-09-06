// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IBalanceFreezerTypes } from "./IBalanceFreezerTypes.sol";

/**
 * @title IBalanceFreezer interface
 * @author CloudWalk Inc.
 * @dev The interface of the contract responsible for freezing operations on the underlying token contract.
 */
interface IBalanceFreezer is IBalanceFreezerTypes {
    /**
     * @dev Emitted when the frozen balance of a specific account has been updated.
     *
     * The balance update can happen due to a related update operation or because of a transfer operation.
     *
     * @param account The account whose frozen balance has been updated.
     * @param newFrozenBalance The updated frozen balance of the account.
     * @param oldFrozenBalance The previous frozen balance of the account.
     * @param txId The off-chain identifier of the transaction that caused the frozen balance update.
     */
    event FrozenBalanceUpdated(
        address indexed account,
        uint256 newFrozenBalance,
        uint256 oldFrozenBalance,
        bytes32 indexed txId
    );

    /**
     * @dev Emitted when a frozen tokens transfer operation have been executed.
     *
     * This event is accompanied by a corresponding event {FrozenBalanceUpdated},
     * since the transfer reduces the frozen balance of the source account.
     *
     * @param from The account from which the frozen tokens have been transferred.
     * @param to The account to which the frozen tokens have been transferred.
     * @param amount The amount of the transferred frozen tokens.
     * @param txId The off-chain identifier of the transaction that caused the transfer.
     */
    event FrozenBalanceTransfer(
        address indexed from, // Tools: this comment prevents Prettier from formatting into a single line.
        uint256 amount,
        bytes32 indexed txId,
        address indexed to
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

    /// @dev Emitted when a new shard contract is added to the contract.
    event ShardAdded(address shard);

    /// @dev Emitted when an existing shard contract is replaced with a new one.
    event ShardReplaced(address newShard, address oldShard);

    /**
     * @dev Updates the frozen balance of an account.
     *
     * Emits a {FrozenBalanceUpdated} event.
     *
     * @param account The account to update the frozen balance for.
     * @param amount The amount of tokens to set as the new frozen balance.
     * @param txId The off-chain identifier of the balance frozen updating operation.
     */
    function freeze(
        address account, // Tools: this comment prevents Prettier from formatting into a single line.
        uint256 amount,
        bytes32 txId
    ) external;

    /**
     * @dev Increases the frozen balance of an account.
     *
     * Emits a {FrozenBalanceUpdated} event.
     *
     * @param account The account to increase frozen balance for.
     * @param amount The amount to increase the frozen balance by.
     * @param txId The off-chain identifier of the balance frozen updating operation.
     */
    function freezeIncrease(
        address account, // Tools: this comment prevents Prettier from formatting into a single line.
        uint256 amount,
        bytes32 txId
    ) external;

    /**
     * @dev Decreases the frozen balance of an account.
     *
     * Emits a {FrozenBalanceUpdated} event.
     *
     * @param account The account to decrease frozen balance for.
     * @param amount The amount to decrease the frozen balance by.
     * @param txId The off-chain identifier of the balance frozen updating operation.
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
     * @param txId The off-chain identifier of the transfer operation.
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
     * @dev Returns the data of a single freezing operation.
     * @param txId The off-chain transaction identifier of the operation.
     * @return operation The data of the freezing operation in the form of a structure.
     */
    function getOperation(bytes32 txId) external view returns (Operation memory operation);

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

    /**
     * @dev Returns the number of shard contracts that is added to the root contract.
     */
    function getShardCounter() external view returns (uint256);

    /**
     * @dev Returns the shard contract address by the off-chain transaction identifier.
     * @param txId The off-chain transaction identifier of the operation.
     */
    function getShardByTxId(bytes32 txId) external view returns (address);

    /**
     * @dev Returns the shard contract addresses by the start index in the internal array.
     * @param index The start index of the shard contract in the internal array.
     * @param limit The maximum number of returned shard contractss.
     */
    function getShardRange(uint256 index, uint256 limit) external view returns (address[] memory);
}
