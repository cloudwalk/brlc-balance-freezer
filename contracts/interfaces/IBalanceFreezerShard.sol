// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {IBalanceFreezerTypes} from "./IBalanceFreezerTypes.sol";

/**
 * @title BalanceFreezer shard interface
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev The interface of the contract that responsible for storing sharded transfer frozen balance operations.
 */
interface IBalanceFreezerShard is IBalanceFreezerTypes{
    /**
     * @dev Enumeration of the shard contract possible errors.
     */
    enum Error {
        TransferAlreadyExecuted
    }

    /**
     * @dev Sets the admin status of an account.
     * @param account The address of the account to configure.
     * @param status The admin status of the account.
     */
    function setAdmin(address account, bool status) external;

    /**
     * @dev Registers a transfer frozen operations.
     * @param from The address of the sender account.
     * @param amount The amount of the transfer frozen operation.
     * @param txId The off-chain identifier of the transfer frozen operation.
     * @param status The status of the transfer frozen operation.
     * @return err The error code if the operation fails, otherwise None.
     */
    function registerFrozenBalanceTransfer(
        bytes32 txId,
        TransferStatus status
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
