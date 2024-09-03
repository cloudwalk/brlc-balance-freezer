// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IBalanceFreezerTypes } from "./interfaces/IBalanceFreezerTypes.sol";

/**
 * @title BalanceFreezerShard storage
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev Contains storage variables of the {BalanceFreezerShard} contract.
 */
abstract contract BalanceFreezerShardStorage is IBalanceFreezerTypes {
    /// @dev The mapping of an account to its admin status (True if admin, False otherwise).
    mapping(address => bool) internal _admins;

    /// @dev The mapping of an operation structure for a given off-chain transaction identifier.
    mapping(bytes32 => Operation) internal _operations;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[48] private __gap;
}
