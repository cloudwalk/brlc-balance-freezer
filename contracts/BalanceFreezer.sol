// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import { AccessControlExtUpgradeable } from "./base/AccessControlExtUpgradeable.sol";
import { PausableExtUpgradeable } from "./base/PausableExtUpgradeable.sol";
import { RescuableUpgradeable } from "./base/RescuableUpgradeable.sol";
import { Versionable } from "./base/Versionable.sol";
import { UUPSExtUpgradeable } from "./base/UUPSExtUpgradeable.sol";

import { IBalanceFreezer } from "./interfaces/IBalanceFreezer.sol";
import { IBalanceFreezerPrimary } from "./interfaces/IBalanceFreezer.sol";
import { IERC20Freezable } from "./interfaces/IERC20Freezable.sol";

import { BalanceFreezerStorageLayout } from "./BalanceFreezerStorageLayout.sol";

/**
 * @title BalanceFreezer contract
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev The contract that responsible for freezing operations on the underlying token contract.
 */
contract BalanceFreezer is
    BalanceFreezerStorageLayout,
    AccessControlExtUpgradeable,
    PausableExtUpgradeable,
    RescuableUpgradeable,
    UUPSExtUpgradeable,
    Versionable,
    IBalanceFreezer
{
    // ------------------ Constants ------------------------------- //

    /// @dev The role of a freezer that is allowed to update and transfer the frozen balance of accounts.
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    // ------------------ Constructor ----------------------------- //

    /**
     * @dev Constructor that prohibits the initialization of the implementation of the upgradeable contract.
     *
     * See details:
     * https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable#initializing_the_implementation_contract
     *
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor() {
        _disableInitializers();
    }

    // ------------------ Initializers ---------------------------- //

    /**
     * @dev Initializer of the upgradeable contract.
     *
     * See details: https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable
     *
     * @param token_ The address of the token to set as the underlying one.
     */
    function initialize(address token_) external initializer {
        __AccessControlExt_init_unchained();
        __PausableExt_init_unchained();
        __Rescuable_init_unchained();
        __UUPSExt_init_unchained(); // This is needed only to avoid errors during coverage assessment

        if (token_ == address(0)) {
            revert BalanceFreezer_TokenAddressZero();
        }

        _getBalanceFreezerStorage().token = token_;

        _setRoleAdmin(FREEZER_ROLE, GRANTOR_ROLE);
        _grantRole(OWNER_ROLE, _msgSender());
    }

    // ------------------ Transactional functions ----------------- //

    /**
     * @inheritdoc IBalanceFreezerPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {FREEZER_ROLE} role.
     * - The transaction identifier must not be zero.
     * - The requirements of the related token contract function must be met.
     */
    function freeze(
        address account, // Tools: prevent Prettier one-liner
        uint256 amount,
        bytes32 txId
    ) external whenNotPaused onlyRole(FREEZER_ROLE) {
        _checkAndRegisterOperation(txId, OperationStatus.UpdateReplacementExecuted, account, amount);
        address token = _getBalanceFreezerStorage().token;
        (uint256 newBalance, uint256 oldBalance) = IERC20Freezable(token).freeze(account, amount);
        emit FrozenBalanceUpdated(account, newBalance, oldBalance, txId);
    }

    /**
     * @inheritdoc IBalanceFreezerPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {FREEZER_ROLE} role.
     * - The transaction identifier must not be zero.
     * - The requirements of the related token contract function must be met.
     */
    function freezeIncrease(
        address account,
        uint256 amount,
        bytes32 txId
    ) external whenNotPaused onlyRole(FREEZER_ROLE) {
        _checkAndRegisterOperation(txId, OperationStatus.UpdateIncreaseExecuted, account, amount);
        address token = _getBalanceFreezerStorage().token;
        (uint256 newBalance, uint256 oldBalance) = IERC20Freezable(token).freezeIncrease(account, amount);
        emit FrozenBalanceUpdated(account, newBalance, oldBalance, txId);
    }

    /**
     * @inheritdoc IBalanceFreezerPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {FREEZER_ROLE} role.
     * - The transaction identifier must not be zero.
     * - The requirements of the related token contract function must be met.
     */
    function freezeDecrease(
        address account,
        uint256 amount,
        bytes32 txId
    ) external whenNotPaused onlyRole(FREEZER_ROLE) {
        _checkAndRegisterOperation(txId, OperationStatus.UpdateDecreaseExecuted, account, amount);
        address token = _getBalanceFreezerStorage().token;
        (uint256 newBalance, uint256 oldBalance) = IERC20Freezable(token).freezeDecrease(account, amount);
        emit FrozenBalanceUpdated(account, newBalance, oldBalance, txId);
    }

    /**
     * @inheritdoc IBalanceFreezerPrimary
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {FREEZER_ROLE} role.
     * - The transaction identifier must not be zero.
     * - The requirements of the related token contract function must be met.
     */
    function transferFrozen(
        address from,
        address to,
        uint256 amount,
        bytes32 txId
    ) external whenNotPaused onlyRole(FREEZER_ROLE) {
        _checkAndRegisterOperation(txId, OperationStatus.TransferExecuted, from, amount);
        address token = _getBalanceFreezerStorage().token;
        (uint256 newBalance, uint256 oldBalance) = IERC20Freezable(token).transferFrozen(from, to, amount);
        emit FrozenBalanceTransfer(from, amount, txId, to);
        emit FrozenBalanceUpdated(from, newBalance, oldBalance, txId);
    }

    // ------------------ View functions -------------------------- //

    /**
     * @inheritdoc IBalanceFreezerPrimary
     */
    function getOperation(bytes32 txId) external view returns (Operation memory) {
        return _getBalanceFreezerStorage().operations[txId];
    }

    /**
     * @inheritdoc IBalanceFreezerPrimary
     */
    function balanceOfFrozen(address account) public view returns (uint256) {
        return IERC20Freezable(_getBalanceFreezerStorage().token).balanceOfFrozen(account);
    }

    /**
     * @inheritdoc IBalanceFreezerPrimary
     */
    function underlyingToken() external view returns (address) {
        return _getBalanceFreezerStorage().token;
    }

    // ------------------ Pure functions -------------------------- //

    /**
     * @inheritdoc IBalanceFreezer
     */
    function proveBalanceFreezer() external pure {}

    // ------------------ Internal functions ---------------------- //

    /**
     * @dev Checks and registers a freezing operation.
     */
    function _checkAndRegisterOperation(
        bytes32 txId,
        OperationStatus status,
        address account,
        uint256 amount
    ) internal {
        if (txId == 0) {
            revert BalanceFreezer_TxIdZero();
        }
        if (amount > type(uint64).max) {
            revert BalanceFreezer_AmountExcess(amount);
        }

        Operation storage operation = _getBalanceFreezerStorage().operations[txId];

        if (operation.status != OperationStatus.Nonexistent) {
            revert BalanceFreezer_AlreadyExecuted(txId);
        }

        operation.status = status;
        operation.account = account;
        operation.amount = uint64(amount);
    }

    /**
     * @dev The upgrade validation function for the UUPSExtUpgradeable contract.
     * @param newImplementation The address of the new implementation.
     */
    function _validateUpgrade(address newImplementation) internal view override onlyRole(OWNER_ROLE) {
        try IBalanceFreezer(newImplementation).proveBalanceFreezer() {} catch {
            revert BalanceFreezer_ImplementationAddressInvalid();
        }
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
