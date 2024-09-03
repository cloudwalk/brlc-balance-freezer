// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IBalanceFreezerShard } from "./interfaces/IBalanceFreezerShard.sol";
import { IBalanceFreezerTypes } from "./interfaces/IBalanceFreezerTypes.sol";

/**
 * @title BalanceFreezer storage
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev Contains storage variables of the {BalanceFreezer} contract.
 */
abstract contract BalanceFreezerStorage is IBalanceFreezerTypes {
    /// @dev The address of the underlying token.
    address internal _token;

    /// @dev The array of the underlying shard contracts.
    IBalanceFreezerShard[] internal _shards;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[48] private __gap;
}