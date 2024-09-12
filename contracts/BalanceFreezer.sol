// SPDX-License-Identifier: MIT

pragma solidity 0.8.24;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { AccessControlExtUpgradeable } from "./base/AccessControlExtUpgradeable.sol";
import { PausableExtUpgradeable } from "./base/PausableExtUpgradeable.sol";
import { RescuableUpgradeable } from "./base/RescuableUpgradeable.sol";

import { IBalanceFreezer } from "./interfaces/IBalanceFreezer.sol";
import { IBalanceFreezerPrimary } from "./interfaces/IBalanceFreezer.sol";
import { IBalanceFreezerConfiguration } from "./interfaces/IBalanceFreezer.sol";
import { IBalanceFreezerShard } from "./interfaces/IBalanceFreezerShard.sol";
import { IBalanceFreezerShardPrimary } from "./interfaces/IBalanceFreezerShard.sol";
import { IERC20Freezable } from "./interfaces/IERC20Freezable.sol";

import { BalanceFreezerStorage } from "./BalanceFreezerStorage.sol";

/**
 * @title BalanceFreezer contract
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev The root contract that responsible for freezing operations on the underlying token contract.
 *
 * It stores data about the freezing operations using multiple linked shard contracts.
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

    /// @dev The role of freezer that is allowed to update and transfer the frozen balance of accounts.
    bytes32 public constant FREEZER_ROLE = keccak256("FREEZER_ROLE");

    /// @dev The maximum number of shards.
    uint256 public constant MAX_SHARD_COUNT = 100;

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
            revert BalanceFreezer_TokenAddressZero();
        }

        _token = token_;

        _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
        _setRoleAdmin(FREEZER_ROLE, OWNER_ROLE);
        _grantRole(OWNER_ROLE, _msgSender());
    }

    // ------------------ Functions ------------------------------- //

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
        address account, // Tools: this comment prevents Prettier from formatting into a single line.
        uint256 amount,
        bytes32 txId
    ) external whenNotPaused onlyRole(FREEZER_ROLE) {
        _checkAndRegisterOperation(txId, OperationStatus.UpdateReplacementExecuted, account, amount);
        (uint256 newBalance, uint256 oldBalance) = IERC20Freezable(_token).freeze(account, amount);
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
        (uint256 newBalance, uint256 oldBalance) = IERC20Freezable(_token).freezeIncrease(account, amount);
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
        (uint256 newBalance, uint256 oldBalance) = IERC20Freezable(_token).freezeDecrease(account, amount);
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
        (uint256 newBalance, uint256 oldBalance) = IERC20Freezable(_token).transferFrozen(from, to, amount);
        emit FrozenBalanceTransfer(from, amount, txId, to);
        emit FrozenBalanceUpdated(from, newBalance, oldBalance, txId);
    }

    /**
     * @inheritdoc IBalanceFreezerConfiguration
     *
     * @dev Requirements:
     *
     * - The caller must have the {OWNER_ROLE} role.
     * - The maximum number of shards if limited by {MAX_SHARD_COUNT}.
     */
    function addShards(address[] memory shards) external onlyRole(OWNER_ROLE) {
        if (_shards.length + shards.length > MAX_SHARD_COUNT) {
            revert BalanceFreezer_ShardCountExcess();
        }

        uint256 count = shards.length;
        for (uint256 i; i < count; i++) {
            _shards.push(IBalanceFreezerShard(shards[i]));
            emit ShardAdded(shards[i]);
        }
    }

    /**
     * @inheritdoc IBalanceFreezerConfiguration
     *
     * @dev Requirements:
     *
     * - The caller must have the {OWNER_ROLE} role.
     */
    function replaceShards(uint256 fromIndex, address[] memory shards) external onlyRole(OWNER_ROLE) {
        uint256 count = _shards.length;
        if (fromIndex >= count) {
            return;
        }
        count -= fromIndex;
        if (count < shards.length) {
            revert BalanceFreezer_ShardReplacementCountExcess();
        }
        if (count > shards.length) {
            count = shards.length;
        }
        for (uint256 i = 0; i < count; i++) {
            uint256 k = fromIndex + i;
            address oldShard = address(_shards[k]);
            address newShard = shards[i];
            _shards[k] = IBalanceFreezerShard(newShard);
            emit ShardReplaced(newShard, oldShard);
        }
    }

    /**
     * @inheritdoc IBalanceFreezerConfiguration
     *
     * @dev Requirements:
     *
     * - The caller must have the {OWNER_ROLE} role.
     */
    function configureShardAdmin(address account, bool status) external onlyRole(OWNER_ROLE) {
        if (account == address(0)) {
            revert BalanceFreezer_AccountAddressZero();
        }

        uint256 count = _shards.length;
        for (uint256 i; i < count; i++) {
            _shards[i].configureAdmin(account, status);
        }

        emit ShardAdminConfigured(account, status, count);
    }

    // ------------------ View functions -------------------------- //

    /**
     * @inheritdoc IBalanceFreezerPrimary
     */
    function getOperation(bytes32 txId) external view returns (Operation memory) {
        return _shard(txId).getOperation(txId);
    }

    /**
     * @inheritdoc IBalanceFreezerPrimary
     */
    function balanceOfFrozen(address account) public view returns (uint256) {
        return IERC20Freezable(_token).balanceOfFrozen(account);
    }

    /**
     * @inheritdoc IBalanceFreezerPrimary
     */
    function underlyingToken() external view returns (address) {
        return _token;
    }

    /**
     * @inheritdoc IBalanceFreezerConfiguration
     */
    function getShardCount() external view returns (uint256) {
        return _shards.length;
    }

    /**
     * @inheritdoc IBalanceFreezerConfiguration
     */
    function getShardByTxId(bytes32 txId) external view returns (address) {
        return address(_shard(txId));
    }

    /**
     * @inheritdoc IBalanceFreezerConfiguration
     */
    function getShardRange(uint256 index, uint256 limit) external view returns (address[] memory) {
        uint256 count = _shards.length;
        address[] memory shards;
        if (count <= index || limit == 0) {
            shards = new address[](0);
        } else {
            count -= index;
            if (count > limit) {
                count = limit;
            }
            shards = new address[](count);
            for (uint256 i = 0; i < count; i++) {
                shards[i] = address(_shards[index]);
                index++;
            }
        }
        return shards;
    }

    // ------------------ Internal functions ---------------------- //

    /**
     * @dev Checks a shard error and reverts if necessary.
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

        uint256 err = _shard(txId).registerOperation(txId, status, account, uint64(amount));

        if (err != uint256(IBalanceFreezerShardPrimary.Error.None)) {
            if (err == uint256(IBalanceFreezerShardPrimary.Error.OperationAlreadyExecuted)) {
                revert BalanceFreezer_AlreadyExecuted(txId);
            }
            revert BalanceFreezer_UnexpectedShardError(err, txId);
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
            revert BalanceFreezer_ShardAddressZero();
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
            revert BalanceFreezer_RootAddressZero();
        }
        if (newShardImplementation == address(0)) {
            revert BalanceFreezer_ShardAddressZero();
        }

        upgradeToAndCall(newRootImplementation, "");

        for (uint256 i = 0; i < _shards.length; i++) {
            _shards[i].upgradeTo(newShardImplementation);
        }
    }
}
