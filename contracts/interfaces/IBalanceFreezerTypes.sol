// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title BalanceFreezer types interface
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev Defines the types used in the BalanceFreezer contracts.
 */
interface IBalanceFreezerTypes {
    /**
     * @dev Possible statuses of a balance freezing operation.
     *
     * The values:
     *
     * - Nonexistent = 0 ------ The operation does not exist (the default value).
     * - TransferExecuted = 1 - The frozen balance transfer operation was executed.
     * - UpdateExecuted = 2 --- The frozen balance update operation was executed.
     */
    enum OperationStatus {
        Nonexistent,
        TransferExecuted,
        UpdateExecuted
    }

    /// @dev Structure with data of a single freezing operation.
    struct Operation {
        OperationStatus status; // The status of the operation according to the {Status} enum.
        bytes32 txId;           // The off-chain identifier of the operation.
    }
}
