// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title IERC20Freezable interface
 * @author CloudWalk Inc.
 * @notice The interface of a token that supports freezing operations
 */
interface IERC20Freezable {

    /**
     * @notice Updates the frozen balance for an account
     *
     * Emits a {Freeze} event
     *
     * @param account The account to increase frozen balance for
     * @param amount The amount to increase the frozen balance by
     */
    function freeze(address account, uint256 amount) external;

    /**
     * @notice Increases the frozen balance for an account
     *
     * Emits a {Freeze} event
     *
     * @param account The account to increase frozen balance for
     * @param amount The amount to increase the frozen balance by
     */
    function freezeIncrease(address account, uint256 amount) external;

    /**
     * @notice Decreases the frozen balance for an account
     *
     * Emits a {Freeze} event
     *
     * @param account The account to decrease frozen balance for
     * @param amount The amount to decrease the frozen balance by
     */
    function freezeDecrease(address account, uint256 amount) external;

    /**
     * @notice Transfers frozen tokens on behalf of an account
     *
     * Emits a {FrozenBalanceTransfer} event
     *
     * @param from The account tokens will be transferred from
     * @param to The account tokens will be transferred to
     * @param amount The amount of tokens to transfer
     */
    function transferFrozen(address from, address to, uint256 amount) external;

    /**
     * @notice Retrieves the frozen balance of an account
     *
     * @param account The account to check the balance of
     * @return The amount of tokens that are frozen for the account
     */
    function balanceOfFrozen(address account) external view returns (uint256);
}
