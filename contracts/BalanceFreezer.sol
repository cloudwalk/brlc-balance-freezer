// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { AccessControlExtUpgradeable } from "./base/AccessControlExtUpgradeable.sol";
import { PausableExtUpgradeable } from "./base/PausableExtUpgradeable.sol";
import { RescuableUpgradeable } from "./base/RescuableUpgradeable.sol";

import { IBalanceFreezer } from "./interfaces/IBalanceFreezer.sol";
import { IBalanceFreezerShard } from "./interfaces/IBalanceFreezerShard.sol";
import { IERC20Freezable } from "./interfaces/IERC20Freezable.sol";

import { BalanceFreezerStorage } from "./BalanceFreezerStorage.sol";

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
    // ------------------ Constants ------------------------------- //

    /// @dev The role of this contract owner.
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");

    /// @dev The role of freezer that is allowed to change and transfer the frozen balance of accounts.
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    // ------------------ Errors ---------------------------------- //

    /// @dev Throws if the provided root address is zero.
    error ZeroRootAddress();

    /// @dev Throws if the provided shard address is zero.
    error ZeroShardAddress();

    /// @dev Thrown if the provided token address is zero.
    error ZeroTokenAddress();

    /// @dev Thrown if the provided off-chain transaction identifier is zero.
    error ZeroTxId();

    /// @dev Thrown if the operation with the provided `txId` is already executed.
    error AlreadyExecuted();

    /// @dev Throws if a shard contract returns an error.
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
     * @dev [DEPRECATED] Freezes tokens of the specified account.
     *
     * Emits a {FrozenBalanceChanged} event.
     *
     * IMPORTANT: This function is deprecated and will be removed in the future updates of the contract.
     *            Use the {freezeIncrease} and {freezeDecrease} functions instead.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {FREEZER_ROLE} role.
     * - The transaction ID must not be zero.
     * - The requirements of the related token contract function must be met.
     *
     * @param account The account whose tokens will be frozen.
     * @param amount The amount of tokens to freeze.
     */
    function freeze(
        address account, // Tools: this comment prevents Prettier from formatting into a single line.
        uint256 amount,
        bytes32 txId
    ) external whenNotPaused onlyRole(FREEZER_ROLE) {
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
     * @inheritdoc IBalanceFreezer
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {FREEZER_ROLE} role.
     * - The transaction ID must not be zero.
     * - The requirements of the related token contract function must be met.
     */
    function freezeIncrease(
        address account,
        uint256 amount,
        bytes32 txId
    ) external whenNotPaused onlyRole(FREEZER_ROLE) {
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
     * @inheritdoc IBalanceFreezer
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {FREEZER_ROLE} role.
     * - The transaction ID must not be zero.
     * - The requirements of the related token contract function must be met.
     */
    function freezeDecrease(
        address account,
        uint256 amount,
        bytes32 txId
    ) external whenNotPaused onlyRole(FREEZER_ROLE) {
        if (txId == 0) {
            revert ZeroTxId();
        }

        IBalanceFreezerShard.Error err = _shard(txId).registerOperation(txId, OperationStatus.ChangeExecuted);
        _checkAndRevert(err);

        uint256 oldBalance = balanceOfFrozen(account);

        IERC20Freezable(_token).freezeDecrease(account, amount);

        emit FrozenBalanceChanged(account, oldBalance - amount, oldBalance, txId);
    }

    /**
     * @inheritdoc IBalanceFreezer
     *
     * @dev Requirements:
     *
     * - The contract must not be paused.
     * - The caller must have the {FREEZER_ROLE} role.
     * - The transaction ID must not be zero.
     * - The requirements of the related token contract function must be met.
     */
    function transferFrozen(
        address from,
        address to,
        uint256 amount,
        bytes32 txId
    ) public virtual whenNotPaused onlyRole(FREEZER_ROLE) {
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
     * @inheritdoc IBalanceFreezer
     */
    function balanceOfFrozen(address account) public view returns (uint256) {
        return IERC20Freezable(_token).balanceOfFrozen(account);
    }

    /**
     * @inheritdoc IBalanceFreezer
     */
    function underlyingToken() external view returns (address) {
        return _token;
    }

    /**
     * @dev The upgrade authorization function for UUPSProxy.
     * @param newImplementation The address of the new implementation.
     */
    function _authorizeUpgrade(address newImplementation) internal view override onlyRole(OWNER_ROLE) {
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

    /**
     * @dev Upgrades the range of the underlying shard contracts to the a implementation.
     * @param newImplementation The address of the new shard implementation.
     */
    function upgradeShardsTo(address newImplementation) external onlyRole(OWNER_ROLE) {
        if (newImplementation == address(0)) {
            revert ZeroShardAddress();
        }

        for (uint256 i = 0; i < _shards.length; i++) {
            _shards[i].upgradeTo(newImplementation);
        }
    }

    /**
     * @dev Upgrades the root and shard contracts to the new implementations.
     * @param newRootImplementation The address of the new root implementation.
     * @param newShardImplementation The address of the new shard implementation.
     */
    function upgradeRootAndShardsTo(address newRootImplementation, address newShardImplementation) external {
        if (newRootImplementation == address(0)) {
            revert ZeroRootAddress();
        }
        if (newShardImplementation == address(0)) {
            revert ZeroShardAddress();
        }

        upgradeToAndCall(newRootImplementation, "");

        for (uint256 i = 0; i < _shards.length; i++) {
            _shards[i].upgradeTo(newShardImplementation);
        }
    }
}
