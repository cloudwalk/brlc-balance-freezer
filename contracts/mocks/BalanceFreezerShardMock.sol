// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IBalanceFreezerTypes } from "../interfaces/IBalanceFreezerTypes.sol";

/**
 * @title BalanceFreezerShardMock contract
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev An implementation of a mock balance freezer shard contract for testing purposes.
 */
contract BalanceFreezerShardMock is IBalanceFreezerTypes {
    uint8 public constant REGISTER_OPERATION_UNEXPECTED_ERROR = 0xFF;

    /**
     * @dev Simulates the "registerOperation()" function of the real contract but always returns unexpected error
     *
     * @param txId The off-chain identifier of the operation.
     * @param status The status of the operation according to the {OperationStatus} enum.
     * @param account The address of the account whose frozen balance is updated or transferred from.
     * @param amount The amount parameter of the related operation.
     * @return err The error code if the operation fails, otherwise zero.
     */
    function registerOperation(
        bytes32 txId,
        OperationStatus status,
        address account,
        uint64 amount
    ) external pure returns (uint256 err) {
        txId; // Silence the compilation warning about unused variable
        status; // Silence the compilation warning about unused variable
        account; // Silence the compilation warning about unused variable
        amount; // Silence the compilation warning about unused variable
        err = REGISTER_OPERATION_UNEXPECTED_ERROR;
    }
}
