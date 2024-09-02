// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { AccessControlExtUpgradeable } from "./base/AccessControlExtUpgradeable.sol";
import { PausableExtUpgradeable } from "./base/PausableExtUpgradeable.sol";
import { RescuableUpgradeable } from "./base/RescuableUpgradeable.sol";

import {BalanceFreezerStorage} from "./BalanceFreezerStorage.sol";
import {IBalanceFreezer} from "./interfaces/IBalanceFreezer.sol";
import {IERC20Freezable} from "./interfaces/IERC20Freezable.sol";

/**
 * @title BalanceFreezer contract
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev Entry point contract freezing operations.
 */
contract BalanceFreezer is
    BalanceFreezerStorage,
    AccessControlExtUpgradeable,
    PausableExtUpgradeable,
    RescuableUpgradeable,
    UUPSUpgradeable,
    IBalanceFreezer
{
    using SafeERC20 for IERC20;

    // ------------------ Constants ------------------------------- //

    /// @dev The role of this contract owner.
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");

    /// @dev The role of freezer that is allowed to execute operations with frozen balance.
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    // ------------------ Errors ---------------------------------- //

    /// @dev Throws if the provided token address is zero.
    error ZeroTokenAddress();

    /// @dev Throws if the provided off-chain transaction identifier is zero.
    error ZeroTxId();

    /// @dev Thrown if the operation with the provided txId is already executed.
    error AlreadyExecuted();

    /// @dev Throws if the shard contract returns an error.
    error ShardError(IBalanceFreezerShard.Error err);

    // ------------------ Initializers ---------------------------- //

    /**
     * @dev Initializer of the upgradable contract.
     *
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.
     *
     * @param token_ The address of the token to set as the underlying one.
     */
    function initialize(address token_) external initializer {
        __BalanceFreezer_init(token_);
    }

    /**
     * @dev Internal initializer of the upgradable contract.
     *
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.
     *
     * @param token_ The address of the token to set as the underlying one.
     */
    function __BalanceFreezer_init(address token_) internal onlyInitializing {
        __Context_init_unchained();
        __ERC165_init_unchained();
        __AccessControl_init_unchained();
        __AccessControlExt_init_unchained();
        __Pausable_init_unchained();
        __PausableExt_init_unchained(OWNER_ROLE);
        __Rescuable_init_unchained(OWNER_ROLE);
        __UUPSUpgradeable_init_unchained();

        __BalanceFreezer_init_init_unchained(token_);
    }

    /**
     * @dev Unchained internal initializer of the upgradable contract.
     *
     * See details https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable.
     *
     * Requirements:
     *
     * - The passed address of the underlying token must not be zero.
     *
     * @param token_ The address of the token to set as the underlying one.
     */
    function __BalanceFreezer_init_init_unchained(address token_) internal onlyInitializing {
        if (token_ == address(0)) {
            revert ZeroTokenAddress();
        }

        _token = token_;

        _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
        _setRoleAdmin(FREEZER_ROLE, OWNER_ROLE);
        _grantRole(OWNER_ROLE, _msgSender());
    }

    // ------------------ Functions ------------------------------- //

    /**
     * @dev [DEPRECATED] Freezes tokens of the specified account
     *
     * Emits a {Freeze} event
     *
     * IMPORTANT: This function is deprecated and will be removed in the future updates of the contract.
     *            Use the {freezeIncrease} and {freezeDecrease} functions instead.
     *
     * Requirements:
     *
     * - The contract must not be paused
     * - Can only be called by a freezer
     * - The account address must not be zero
     *
     * @param account The account whose tokens will be frozen
     * @param amount The amount of tokens to freeze
     */
    function freeze(address account, uint256 amount, bytes32 txId) external whenNotPaused onlyRole(FREEZER_ROLE) {
        if (txId == 0) {
            revert ZeroTxId();
        }

        IBalanceFreezerShard.Error err = _shard(txId).registerOperation(txId, OperationStatus.ChangeExecuted);
        _checkAndRevert(err);

        uint256 oldBalance = balanceOfFrozen(account);

        IERC20Freezable(_token).freeze(account, amount);

        emit FrozenBalanceChanged(account, amount, oldBalance, txId);
    }

    /**
     * @inheritdoc IERC20Freezable
     *
     * @dev The contract must not be paused
     * @dev Can only be called by a freezer
     * @dev The account address must not be zero
     * @dev The amount must not be zero
     * @dev The transaction must not be executed
     */
    function freezeIncrease(address account, uint256 amount, bytes32 txId) external whenNotPaused onlyRole(FREEZER_ROLE) {
        if (txId == 0) {
            revert ZeroTxId();
        }

        IBalanceFreezerShard.Error err = _shard(txId).registerOperation(txId, OperationStatus.ChangeExecuted);
        _checkAndRevert(err);

        uint256 oldBalance = balanceOfFrozen(account);

        IERC20Freezable(_token).freezeIncrease(account, amount);

        emit FrozenBalanceChanged(account, oldBalance + amount, oldBalance, txId);
    }

    /**
     * @inheritdoc IERC20Freezable
     *
     * @dev The contract must not be paused
     * @dev Can only be called by a freezer
     * @dev The account address must not be zero
     * @dev The amount must not be zero
     * @dev The transaction must not be executed
     */
    function freezeDecrease(address account, uint256 amount, bytes32 txId) external whenNotPaused onlyRole(FREEZER_ROLE) {
        if (txId == 0) {
            revert ZeroTxId();
        }

        IBalanceFreezerShard.Error err = _shard(txId).registerOperation(txId, OperationStatus.ChangeExecuted);
        _checkAndRevert(err);

        uint256 oldBalance = balanceOfFrozen(account);

        IERC20Freezable(_token).freezeDecrease(account, amount);

        emit FrozenBalanceChanged(account, oldBalance - amount, oldBalance, txId);
    }

    // ------------------ changeFrozen Version 1 BEGIN ---------------------------- //

    enum ChangeOperationType {
        Change,     // 0
        Replace     // 1
    }

    error IncorrectAmount();

    function changeFrozen(address account, uint64 amount, ChangeOperationType updateType, bytes32 txId) external whenNotPaused onlyRole(FREEZER_ROLE) {
        if (txId == 0) {
            revert ZeroTxId();
        }

        IBalanceFreezerShard.Error err = _shard(txId).registerOperation(txId, OperationStatus.ChangeExecuted);
        _checkAndRevert(err);

        uint256 oldBalance = balanceOfFrozen(account);

        if (updateType == ChangeOperationType.Replace) {
            if (amount < 0) {
                revert IncorrectAmount();
            }
            IERC20Freezable(_token).freeze(account, uint256(amount));
        } else {
            if (amount > 0) {
                IERC20Freezable(_token).freezeIncrease(account, uint256(amount));
            } else {
                IERC20Freezable(_token).freezeDecrease(account, uint256(-amount));
            }
        }

        emit FrozenBalanceChanged(account, oldBalance + amount, oldBalance, txId);
    }

    // ------------------ changeFrozen Version 1 END ---------------------------- //

    // ------------------ changeFrozen Version 2 BEGIN ---------------------------- //

    enum ChangeOperationType2 {
        Update,     // 0
        Increase,   // 1
        Decrease    // 2
    }

    function changeFrozen2(address account, uint256 amount, ChangeOperationType2 updateType, bytes32 txId) external whenNotPaused onlyRole(FREEZER_ROLE) {
        if (txId == 0) {
            revert ZeroTxId();
        }

        IBalanceFreezerShard.Error err = _shard(txId).registerOperation(txId, OperationStatus.ChangeExecuted);
        _checkAndRevert(err);

        uint256 oldBalance = balanceOfFrozen(account);

        if (updateType == ChangeOperationType2.Update) {
            IERC20Freezable(_token).freeze(account, amount);
        } else if (updateType == ChangeOperationType2.Increase) {
            IERC20Freezable(_token).freezeIncrease(account, amount);
        } else {
            IERC20Freezable(_token).freezeDecrease(account, amount);
        }

        uint256 newBalance = balanceOfFrozen(account);

        emit FrozenBalanceChanged(account, newBalance, oldBalance, txId);
    }

    // ------------------ changeFrozen Version 2 END ---------------------------- //

    /**
     * @inheritdoc IERC20Freezable
     *
     * @dev The contract must not be paused
     * @dev Can only be called by a freezer
     * @dev The frozen balance must be greater than the `amount`
     * @dev The transaction must not be executed
     */
    function transferFrozen(address from, address to, uint256 amount, bytes32 txId) public virtual whenNotPaused onlyRole(FREEZER_ROLE) {
        if (txId == 0) {
            revert ZeroTxId();
        }

        IBalanceFreezerShard.Error err = _shard(txId).registerOperation(txId, OperationStatus.TransferExecuted);
        _checkAndRevert(err);

        uint256 oldBalance = balanceOfFrozen(from);
        IERC20Freezable(_token).transferFrozen(from, to, amount);
        uint256 newBalance = balanceOfFrozen(from);

        emit FrozenBalanceTransfer(from, to, amount, txId);
        emit FrozenBalanceChanged(from, newBalance, oldBalance, txId);
    }

    /**
     * @dev Checks shard errors and reverts if necessary.
     */
    function _checkAndRevert(IBalanceFreezerShard.Error err) internal {
        if (err != IBalanceFreezerShard.Error.None) {
            if (err == IBalanceFreezerShard.Error.OperationAlreadyExecuted) revert AlreadyExecuted();
            revert ShardError(err);
        }
    }

    /**
     * @dev Returns the shard contract by the off-chain transaction identifier.
     * @param txId The off-chain transaction identifier of the operation.
     */
    function _shard(bytes32 txId) internal view returns (IBalanceFreezerShard) {
        uint256 i = uint256(keccak256(abi.encodePacked(txId)));
        i %= _shards.length;
        return _shards[i];
    }

    /**
     * @inheritdoc IERC20Freezable
     */
    function balanceOfFrozen(address account) public view returns (uint256) {
        return IERC20Freezable(_token).balanceOfFrozen(account);
    }

    /**
     * @inheritdoc IPixCashierRoot
     */
    function underlyingToken(address account) external view returns (address) {
        return _token;
    }
}
