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
    enum OperationStatus {
        Nonexistent,    // 0
        Executed        // 1
    }

    /// @dev Structure with data of a single operation.
    struct Operation {
        OperationStatus status;      // The status of the transfer frozen operation according to the {Status} enum.
        bytes32 txId;                // The off-chain identifier of the operation.
    }
}
