// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title IBalanceFreezer interface
 * @author CloudWalk Inc.
 * @notice The interface of the contract that responsible for freezing operations
 */
interface IBalanceFreezer {

    /**
     * @notice Emitted when token freezing has been performed for a specific account
     *
     * @param account The account for which token freezing has been performed
     * @param newFrozenBalance The updated frozen balance of the account
     * @param oldFrozenBalance The previous frozen balance of the account
     * @param txId The transaction ID of the balance freeze
     */
    event FrozenBalanceChanged(address indexed account, uint256 newFrozenBalance, uint256 oldFrozenBalance, bytes32 indexed txId);

    /**
     * @notice Emitted when frozen tokens have been transferred between accounts
     *
     * @param from The account from which frozen tokens have been transferred
     * @param to The account which frozen tokens have been transferred to
     * @param amount The amount of frozen tokens transferred
     * @param txId The transaction ID of the transfer
     */
    event FrozenBalanceTransfer(address indexed from, address indexed to, uint256 amount, bytes32 indexed txId);

    /**
     * @notice Increases the frozen balance for an account
     *
     * Emits a {FrozenBalanceChanged} event
     *
     * @param account The account to increase frozen balance for
     * @param amount The amount to increase the frozen balance by
     * @param txId The transaction ID of the balance frozen change
     */
    function freezeIncrease(address account, uint256 amount, bytes32 txId) external;

    /**
     * @notice Decreases the frozen balance for an account
     *
     * Emits a {FrozenBalanceChanged} event
     *
     * @param account The account to decrease frozen balance for
     * @param amount The amount to decrease the frozen balance by
     * @param txId The transaction ID of the balance frozen change
     */
    function freezeDecrease(address account, uint256 amount, bytes32 txId) external;

    /**
     * @notice Transfers frozen tokens on behalf of an account
     *
     * Emits a {FrozenBalanceTransfer} event
     *
     * @param from The account tokens will be transferred from
     * @param to The account tokens will be transferred to
     * @param amount The amount of tokens to transfer
     * @param txId The transaction ID of the transfer
     */
    function transferFrozen(address from, address to, uint256 amount, bytes32 txId) external;

    /**
     * @notice Retrieves the frozen balance of an account
     *
     * @param account The account to check the balance of
     * @return The amount of tokens that are frozen for the account
     */
    function balanceOfFrozen(address account) external view returns (uint256);

    /**
     * @dev Returns the address of the underlying token.
     */
    function underlyingToken(address account) external view returns (uint256);
}
