// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IBalanceFreezerTypes } from "./IBalanceFreezerTypes.sol";

/**
 * @title BalanceFreezer shard interface
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev The interface of the contract that responsible for storing sharded frozen balance operations.
 */
interface IBalanceFreezerShard is IBalanceFreezerTypes {
    /**
     * @dev Enumeration of the shard contract possible errors.
     */
    enum Error {
        None,
        OperationAlreadyExecuted
    }

    /**
     * @dev Emitted when an account is assigned the admin role.
     * @param admin The address of the assigned admin.
     */
    event ShardAdminAssigned(address indexed admin);

    /**
     * @dev Emitted when the admin role is revoked from an account.
     * @param admin The address of the revoked admin.
     */
    event ShardAdminRevoked(address indexed admin);

    /**
     * @dev Configure the admin status of an account.
     * @param account The address of the account to configure.
     * @param status The admin status of the account.
     */
    function configureAdmin(address account, bool status) external;

    /**
     * @dev Registers an operation.
     * @param txId The off-chain identifier of the operation.
     * @param status The status of the operation.
     * @return err The error code if the operation fails, otherwise None.
     */
    function registerOperation(bytes32 txId, OperationStatus status) external returns (Error err);

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
