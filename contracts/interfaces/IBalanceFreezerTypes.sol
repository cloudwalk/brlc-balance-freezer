// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title BalanceFreezer types interface
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev Defines the types used in the BalanceFreezer contracts.
 */
interface IBalanceFreezerTypes {
    /**
     * @dev Possible statuses of a transfer frozen operation as an enum.
     *
     * The possible values:
     * - Nonexistent ----- The operation does not exist (the default value).
     * - Executed -------- The operation was executed.
     */
    enum TransferFrozenStatus {
        Nonexistent,    // 0
        Executed        // 1
    }

    /// @dev Structure with data of a single operation.
    struct TransferFrozenOperation {
        TransferFrozenStatus status;  // The status of the transfer frozen operation according to the {TransferFrozenStatus} enum.
        address from;                 // The sender of tokens.
        uint64 amount;                // The amount of tokens.
    }
}
