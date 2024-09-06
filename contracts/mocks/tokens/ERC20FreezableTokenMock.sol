// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { IERC20Freezable } from "../../interfaces/IERC20Freezable.sol";

/**
 * @title ERC20TokenMock contract
 * @author CloudWalk Inc. (See https://www.cloudwalk.io)
 * @dev An implementation of the {ERC20Upgradeable} contract for testing purposes.
 */
contract ERC20FreezableTokenMock is ERC20, IERC20Freezable {
    uint256 public constant OLD_FROZEN_BALANCE_MOCK = uint256(type(int256).max);

    // ------------------ Events ---------------------------------- //
    /// @dev A mock event with the parameters that were passed to the `freeze()` function.
    event MockCallFreeze(
        address account, // Tools: this comment prevents Prettier from formatting into a single line.
        uint256 amount
    );

    /// @dev A mock event with the parameters that were passed to the `freezeIncrease()` function.
    event MockCallFreezeIncrease(
        address account, // Tools: this comment prevents Prettier from formatting into a single line.
        uint256 amount
    );

    /// @dev A mock event with the parameters that were passed to the `freezeIncrease()` function.
    event MockCallFreezeDecrease(
        address account, // Tools: this comment prevents Prettier from formatting into a single line.
        uint256 amount
    );

    /// @dev A mock event with the parameters that were passed to the `freezeIncrease()` function.
    event MockCallTransferFrozen(
        address from, // Tools: this comment prevents Prettier from formatting into a single line.
        address to,
        uint256 amount
    );

    // ------------------ Constructor ----------------------------- //

    /**
     * @dev The initialize function of the upgradable contract.
     * @param name_ The name of the token to set for this ERC20-comparable contract.
     * @param symbol_ The symbol of the token to set for this ERC20-comparable contract.
     */
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    // ------------------ Functions ------------------------------- //

    /**
     * @dev Calls the appropriate internal function to mint needed amount of tokens for an account.
     * @param account The address of an account to mint for.
     * @param amount The amount of tokens to mint.
     */
    function mint(address account, uint256 amount) external returns (bool) {
        _mint(account, amount);
        return true;
    }
    /**
     * @dev Simulates the "freeze()" function by emitting the appropriate mock event and returning known values.
     *
     * @param account The account to update the frozen balance for.
     * @param amount The amount of tokens to set as the new frozen balance.
     * @return newBalance The frozen balance of the account after the update.
     * @return oldBalance The frozen balance of the account before the update.
     */
    function freeze(
        address account,
        uint256 amount
    ) external returns (uint256 newBalance, uint256 oldBalance) {
        oldBalance = OLD_FROZEN_BALANCE_MOCK;
        newBalance = amount;
        emit MockCallFreeze(account, amount);
    }

    /**
     * @dev Simulates the "freezeIncrease()" function by emitting the appropriate mock event and returning known values.
     *
     * @param account The account to increase frozen balance for.
     * @param amount The amount to increase the frozen balance by.
     * @return newBalance The frozen balance of the account after the increase.
     * @return oldBalance The frozen balance of the account before the increase.
     */
    function freezeIncrease(
        address account, // Tools: this comment prevents Prettier from formatting into a single line
        uint256 amount
    ) external returns (uint256 newBalance, uint256 oldBalance) {
        oldBalance = OLD_FROZEN_BALANCE_MOCK;
        newBalance = oldBalance + amount;
        emit MockCallFreezeIncrease(account, amount);
    }

    /**
     * @dev Simulates the "freezeDecrease()" function by emitting the appropriate mock event and returning known values.
     *
     * @param account The account to decrease frozen balance for.
     * @param amount The amount to decrease the frozen balance by.
     * @return newBalance The frozen balance of the account after the decrease.
     * @return oldBalance The frozen balance of the account before the decrease.
     */
    function freezeDecrease(
        address account,
        uint256 amount
    ) external returns (uint256 newBalance, uint256 oldBalance) {
        oldBalance = OLD_FROZEN_BALANCE_MOCK;
        newBalance = oldBalance - amount;
        emit MockCallFreezeIncrease(account, amount);
    }

    /**
     * @dev Simulates the "transferFrozen()" function by emitting the appropriate mock event and returning known values.
     *
     * @param from The account tokens will be transferred from
     * @param to The account tokens will be transferred to
     * @param amount The amount of tokens to transfer
     * @return newBalance The frozen balance of the `from` account after the transfer
     * @return oldBalance The frozen balance of the `from` account before the transfer
     */
    function transferFrozen(
        address from, // Tools: this comment prevents Prettier from formatting into a single line.
        address to,
        uint256 amount
    ) external returns (uint256 newBalance, uint256 oldBalance) {
        oldBalance = OLD_FROZEN_BALANCE_MOCK;
        newBalance = oldBalance - amount;
        emit MockCallTransferFrozen(from, to, amount);
    }

    /**
     * @dev Simulates the "balanceOfFrozen()" function by emitting the const value.
     *
     * @param account The account to check the balance of.
     * @return The amount of tokens that are frozen for the account.
     */
    function balanceOfFrozen(address account) external pure returns (uint256) {
        account; // Prevents compiler warning about unused variable
        return OLD_FROZEN_BALANCE_MOCK;
    }
}