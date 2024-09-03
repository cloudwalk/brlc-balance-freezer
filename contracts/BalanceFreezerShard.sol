// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { IBalanceFreezerShard } from "./interfaces/IBalanceFreezerShard.sol";

import { BalanceFreezerShardStorage } from "./BalanceFreezerShardStorage.sol";

/**
 * @title BalanceFreezerShard contract
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev The contract responsible for storing sharded operations.
 */
contract BalanceFreezerShard is BalanceFreezerShardStorage, OwnableUpgradeable, UUPSUpgradeable, IBalanceFreezerShard {
    // ------------------ Errors ---------------------------------- //

    /// @dev Throws if the caller is not the owner or admin.
    error Unauthorized();

    // ------------------ Initializers ---------------------------- //

    /**
     * @dev Initializer of the upgradable contract.
     *
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.
     *
     * @param owner_ The address of the contract owner.
     */
    function initialize(address owner_) external initializer {
        __BalanceFreezerShard_init(owner_);
    }

    /**
     * @dev Internal initializer of the upgradable contract.
     *
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.
     *
     * @param owner_ The address of the contract owner.
     */
    function __BalanceFreezerShard_init(address owner_) internal onlyInitializing {
        __Context_init_unchained();
        __Ownable_init_unchained(owner_);
        __UUPSUpgradeable_init_unchained();

        __BalanceFreezerShard_init_unchained();
    }

    // ----------------------- Modifiers -------------------------- //

    modifier onlyOwnerOrAdmin() {
        if (msg.sender != owner() && !_admins[msg.sender]) {
            revert Unauthorized();
        }
        _;
    }

    /**
     * @dev Unchained internal initializer of the upgradable contract.
     *
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.
     */
    function __BalanceFreezerShard_init_unchained() internal onlyInitializing {}

    // ----------------------- Functions -------------------------- //

    /**
     * @inheritdoc IBalanceFreezerShard
     */
    function registerOperation(bytes32 txId, OperationStatus status) external returns (Error err) {
        Operation storage operation = _operations[txId];

        if (operation.status != OperationStatus.Nonexistent) {
            return Error.OperationAlreadyExecuted;
        }

        operation.status = status;
        operation.txId = txId;

        return Error.None;
    }

    /**
     * @inheritdoc IBalanceFreezerShard
     */
    function setAdmin(address account, bool status) external onlyOwnerOrAdmin {
        _admins[account] = status;
    }

    // ------------------ View functions -------------------------- //

    /**
     * @inheritdoc IBalanceFreezerShard
     */
    function isAdmin(address account) external view returns (bool) {
        return _admins[account];
    }

    /**
     * @dev The upgrade authorization function for UUPSProxy.
     * @param newImplementation The address of the new implementation.
     */
    function _authorizeUpgrade(address newImplementation) internal view override onlyOwnerOrAdmin {
        newImplementation; // Suppresses a compiler warning about the unused variable.
    }

    // ------------------ Service functions ----------------------- //

    /**
     * @dev The version of the standard upgrade function without the second parameter for backward compatibility.
     * @custom:oz-upgrades-unsafe-allow-reachable delegatecall
     */
    function upgradeTo(address newImplementation) external {
        upgradeToAndCall(newImplementation, "");
    }
}
