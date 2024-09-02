// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title IBalanceFreezer interface
 * @author CloudWalk Inc.
 * @notice The interface of a token that supports freezing operations
 */
interface IBalanceFreezer {

    /**
     * @notice Emitted when frozen tokens have been transferred from an account
     *
     * @param account The account from which frozen tokens have been transferred
     * @param amount The amount of frozen tokens transferred
     * @param txId The transaction ID of the transfer
     */
    event FrozenBalanceTransfer(address indexed account, uint256 amount, bytes32 txId);

    /**
     * @notice Emitted when token freezing has been performed for a specific account
     *
     * @param account The account for which token freezing has been performed
     * @param newFrozenBalance The updated frozen balance of the account
     * @param oldFrozenBalance The previous frozen balance of the account
     */
    event BalanceFrozen(address indexed account, uint256 newFrozenBalance, uint256 oldFrozenBalance);

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
}
