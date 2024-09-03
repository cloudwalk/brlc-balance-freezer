// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title IERC20Freezable interface
 * @author CloudWalk Inc.
 * @dev The interface of a token that supports freezing operations.
 */
interface IERC20Freezable {
    /**
     * @dev Updates the frozen balance for an account.
     *
     * @param account The account to increase frozen balance for.
     * @param amount The amount to increase the frozen balance by.
     */
    function freeze(address account, uint256 amount) external;

    /**
     * @dev Increases the frozen balance for an account.
     *
     * @param account The account to increase frozen balance for.
     * @param amount The amount to increase the frozen balance by.
     */
    function freezeIncrease(address account, uint256 amount) external;

    /**
     * @dev Decreases the frozen balance for an account.
     *
     * @param account The account to decrease frozen balance for.
     * @param amount The amount to decrease the frozen balance by.
     */
    function freezeDecrease(address account, uint256 amount) external;

    /**
     * @dev Transfers frozen tokens on behalf of an account.
     *
     * @param from The account tokens will be transferred from.
     * @param to The account tokens will be transferred to.
     * @param amount The amount of tokens to transfer.
     */
    function transferFrozen(address from, address to, uint256 amount) external;

    /**
     * @dev Retrieves the frozen balance of an account.
     *
     * @param account The account to check the balance of.
     * @return The amount of tokens that are frozen for the account.
     */
    function balanceOfFrozen(address account) external view returns (uint256);
}
