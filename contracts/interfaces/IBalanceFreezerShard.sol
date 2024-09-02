// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {IBalanceFreezerTypes} from "./IBalanceFreezerTypes.sol";

/**
 * @title BalanceFreezer shard interface
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev The interface of the contract that responsible for storing sharded frozen balance operations.
 */
interface IBalanceFreezerShard is IBalanceFreezerTypes{
    /**
     * @dev Enumeration of the shard contract possible errors.
     */
    enum Error {
        None,
        ZeroTxId,
        TransferAlreadyExecuted,
        ChangeAlreadyExecuted
    }

    /**
     * @dev Sets the admin status of an account.
     * @param account The address of the account to configure.
     * @param status The admin status of the account.
     */
    function setAdmin(address account, bool status) external;

    /**
     * @dev Registers a change frozen operations.
     * @param txId The off-chain identifier of the change frozen operation.
     * @param status The status of the change frozen operation.
     * @return err The error code if the operation fails, otherwise None.
     */
    function registerFrozenBalanceChange(
        bytes32 txId,
        OperationStatus status
    ) external returns (Error err);

    /**
     * @dev Registers a transfer frozen operations.
     * @param txId The off-chain identifier of the transfer frozen operation.
     * @param status The status of the transfer frozen operation.
     * @return err The error code if the operation fails, otherwise None.
     */
    function registerFrozenBalanceTransfer(
        bytes32 txId,
        OperationStatus status
    ) external returns (Error err);

    /**
     * @dev Checks if an account is an admin.
     * @param account The address of the account to check.
     * @return isAdmin The admin status of the account.
     */
    function isAdmin(address account) external view returns (bool);

    /**
     * @dev Upgrades the implementation of the contract.
     * @param newImplementation The address of the new implementation.
     */
    function upgradeTo(address newImplementation) external;
}
