// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IBalanceFreezerTypes } from "./interfaces/IBalanceFreezerTypes.sol";

/**
 * @title BalanceFreezerStorageLayout contract
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev Defines the storage layout for the balance freezer smart contract.
 */
abstract contract BalanceFreezerStorageLayout is IBalanceFreezerTypes {
    // ------------------ Storage layout -------------------------- //

    /**
     * @dev The storage location of the balance freezer contract according to ERC-7201.
     *
     * The value is the same as:
     * `keccak256(abi.encode(uint256(keccak256("cloudwalk.storage.BalanceFreezer")) - 1)) & ~bytes32(uint256(0xff))`
     */
    bytes32 private constant BALANCE_FREEZER_STORAGE_LOCATION =
        0xd9a03146aba6d5edeab2b492389c32a15d88d10c3d7d05290a1bec9319dab500;

    /**
     * @dev Defines the contract storage structure.
     *
     * Fields:
     *
     * - token ------- The address of the underlying token.
     * - operations -- The mapping of an operation structure for a given off-chain transaction identifier.
     * @custom:storage-location erc7201:cloudwalk.storage.BalanceFreezer
     */
    struct BalanceFreezerStorage {
        // Slot 1
        address token;
        // uint96 __reserved1; // Reserved until the end of the storage slot

        // Slot 2
        mapping(bytes32 => Operation) operations;
        // No reserve until the end of the storage slot
    }

    // ------------------ Internal functions ---------------------- //

    /// @dev Returns the storage of the balance freezer contract in the form of a struct.
    function _getBalanceFreezerStorage() internal pure returns (BalanceFreezerStorage storage $) {
        assembly {
            $.slot := BALANCE_FREEZER_STORAGE_LOCATION
        }
    }
}
