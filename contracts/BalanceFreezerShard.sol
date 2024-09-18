// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { IBalanceFreezerShard } from "./interfaces/IBalanceFreezerShard.sol";
import { IBalanceFreezerShardPrimary } from "./interfaces/IBalanceFreezerShard.sol";
import { IBalanceFreezerShardConfiguration } from "./interfaces/IBalanceFreezerShard.sol";

import { BalanceFreezerShardStorage } from "./BalanceFreezerShardStorage.sol";

/**
 * @title BalanceFreezerShard contract
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev The contract responsible for sharded storage of data about freezing operations.
 */
contract BalanceFreezerShard is BalanceFreezerShardStorage, ContextUpgradeable, UUPSUpgradeable, IBalanceFreezerShard {
    // ------------------ Initializers ---------------------------- //

    /**
     * @dev Initializer of the upgradable contract.
     *
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.
     *
     * @param admin_ The address of the contract admin.
     */
    function initialize(address admin_) external initializer {
        __BalanceFreezerShard_init(admin_);
    }

    /**
     * @dev Internal initializer of the upgradable contract.
     *
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.
     *
     * @param admin_ The address of the contract admin.
     */
    function __BalanceFreezerShard_init(address admin_) internal onlyInitializing {
        __Context_init_unchained();
        __UUPSUpgradeable_init_unchained();

        __BalanceFreezerShard_init_unchained(admin_);
    }

    /**
     * @dev Unchained internal initializer of the upgradable contract.
     *
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.
     *
     * @param admin_ The address of the contract admin.
     */
    function __BalanceFreezerShard_init_unchained(address admin_) internal onlyInitializing {
        _configureAdmin(admin_, true);
    }

    // ----------------------- Modifiers -------------------------- //

    modifier onlyAdmin() {
        if (!_admins[msg.sender]) {
            revert BalanceFreezerShard_Unauthorized();
        }
        _;
    }

    // ----------------------- Functions -------------------------- //

    /**
     * @inheritdoc IBalanceFreezerShardPrimary
     *
     * @dev Requirements:
     *
     * - The caller must be an admin.
     */
    function registerOperation(
        bytes32 txId,
        OperationStatus status,
        address account,
        uint64 amount
    ) external onlyAdmin returns (Error err) {
        Operation storage operation = _operations[txId];

        if (operation.status != OperationStatus.Nonexistent) {
            return Error.OperationAlreadyExecuted;
        }

        operation.status = status;
        operation.account = account;
        operation.amount = amount;

        return Error.None;
    }

    /**
     * @inheritdoc IBalanceFreezerShardConfiguration
     */
    function configureAdmin(address account, bool status) external onlyAdmin {
        _configureAdmin(account, status);
    }

    // ------------------ View functions -------------------------- //

    /**
     * @inheritdoc IBalanceFreezerShardPrimary
     */
    function getOperation(bytes32 txId) external view returns (Operation memory) {
        return _operations[txId];
    }

    /**
     * @inheritdoc IBalanceFreezerShardConfiguration
     */
    function isAdmin(address account) external view returns (bool) {
        return _admins[account];
    }

    // ------------------ Internal functions ---------------------- //

    /**
     * @dev Configures an admin internally
     */
    function _configureAdmin(address account, bool status) internal {
        if (account == address(0)) {
            revert BalanceFreezerShard_AccountAddressZero();
        }

        if (_admins[account] == status) {
            return;
        }

        _admins[account] = status;

        if (status) {
            emit ShardAdminAssigned(account);
        } else {
            emit ShardAdminRevoked(account);
        }
    }

    /**
     * @dev The upgrade authorization function for UUPSProxy.
     * @param newImplementation The address of the new implementation.
     */
    function _authorizeUpgrade(address newImplementation) internal view override onlyAdmin {
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
