import { ethers, network, upgrades } from "hardhat";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { checkContractUupsUpgrading, connect, getAddress, proveTx } from "../test-utils/eth";

const ADDRESS_ZERO = ethers.ZeroAddress;

enum OperationStatus {
  Nonexistent = 0,
  TransferExecuted = 1,
  UpdateIncreaseExecuted = 2,
  UpdateDecreaseExecuted = 3,
  UpdateReplacementExecuted = 4
}

interface Operation {
  status: OperationStatus;
  account: string;
  amount: bigint;

  // Indexing signature to ensure that fields are iterated over in a key-value style
  [key: string]: number | string | bigint;
}

interface TestOperation extends Operation {
  txId: string;
}

const defaultOperation: Operation = {
  status: OperationStatus.Nonexistent,
  account: ADDRESS_ZERO,
  amount: 0n
};

interface Fixture {
  freezerRoot: Contract;
  freezerShards: Contract[];
  tokenMock: Contract;
}

function checkEquality<T extends Record<string, unknown>>(actualObject: T, expectedObject: T, index?: number) {
  const indexString = !index ? "" : ` with index: ${index}`;
  Object.keys(expectedObject).forEach(property => {
    const value = actualObject[property];
    if (typeof value === "undefined" || typeof value === "function" || typeof value === "object") {
      throw Error(`Property "${property}" is not found in the actual object` + indexString);
    }
    expect(value).to.eq(
      expectedObject[property],
      `Mismatch in the "${property}" property between the actual object and expected one` + indexString
    );
  });
}

async function getImplementationAddresses(contracts: Contract[]): Promise<string[]> {
  const implementationAddressPromises: Promise<string>[] = [];
  for (const contract of contracts) {
    const shardAddress = getAddress(contract);
    implementationAddressPromises.push(upgrades.erc1967.getImplementationAddress(shardAddress));
  }
  return await Promise.all(implementationAddressPromises);
}

function defineShardIndexByTxId(txId: string, shardCount: number): number {
  return Number(BigInt(ethers.keccak256(txId)) % BigInt(shardCount));
}

async function setUpFixture<T>(func: () => Promise<T>): Promise<T> {
  if (network.name === "hardhat") {
    return loadFixture(func);
  } else {
    return func();
  }
}

describe("Contracts 'BalanceFreezer' and `BalanceFreezerShard`", async () => {
  const TX_ID_ARRAY: string[] = [
    ethers.encodeBytes32String("MOCK TX_ID 1"),
    ethers.encodeBytes32String("MOCK TX_ID 2"),
    ethers.encodeBytes32String("MOCK TX_ID 3"),
    ethers.encodeBytes32String("MOCK TX_ID 4"),
    ethers.encodeBytes32String("MOCK TX_ID 5")
  ];
  const TX_ID_ZERO = ethers.ZeroHash;
  const TOKEN_AMOUNT = 12345678;
  const TOKEN_AMOUNTS: number[] = [
    TOKEN_AMOUNT,
    TOKEN_AMOUNT * 2,
    TOKEN_AMOUNT * 3,
    TOKEN_AMOUNT * 4,
    TOKEN_AMOUNT * 5
  ];
  const MAX_SHARD_COUNTER = 100;

  // Errors of the lib contracts
  const REVERT_ERROR_IF_CONTRACT_INITIALIZATION_IS_INVALID = "InvalidInitialization";
  const REVERT_ERROR_IF_CONTRACT_IS_PAUSED = "EnforcedPause";
  const REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT = "AccessControlUnauthorizedAccount";

  // Errors of the contracts under test
  const REVERT_ERROR_IF_ACCOUNT_ADDRESS_IS_ZERO = "BalanceFreezer_AccountAddressZero";
  const REVERT_ERROR_IF_ACCOUNT_ADDRESS_IS_ZERO_ON_SHARD = "BalanceFreezerShard_AccountAddressZero";
  const REVERT_ERROR_IF_AMOUNT_EXCESS = "BalanceFreezer_AmountExcess";
  const REVERT_ERROR_IF_OPERATION_ALREADY_EXECUTED = "BalanceFreezer_AlreadyExecuted";
  const REVERT_ERROR_IF_ROOT_ADDRESS_IS_ZERO = "BalanceFreezer_RootAddressZero";
  const REVERT_ERROR_IF_SHARD_ADDRESS_IS_ZERO = "BalanceFreezer_ShardAddressZero";
  const REVERT_ERROR_IF_SHARD_COUNTER_EXCESS = "BalanceFreezer_ShardCounterExcess";
  const REVERT_ERROR_IF_SHARD_REPLACEMENT_COUNTER_EXCESS = "BalanceFreezer_ShardReplacementCounterExcess";
  const REVERT_ERROR_IF_TOKEN_ADDRESS_IS_ZERO = "BalanceFreezer_TokenAddressZero";
  const REVERT_ERROR_IF_TX_ID_IS_ZERO = "BalanceFreezer_TxIdZero";
  const REVERT_ERROR_IF_UNAUTHORIZED_ON_SHARD = "BalanceFreezerShard_Unauthorized";

  // Events of the contracts under test
  const EVENT_NAME_FROZEN_BALANCE_TRANSFER = "FrozenBalanceTransfer";
  const EVENT_NAME_FROZEN_BALANCE_UPDATED = "FrozenBalanceUpdated";
  const EVENT_NAME_MOCK_CALL_FREEZE = "MockCallFreeze";
  const EVENT_NAME_MOCK_CALL_FREEZE_INCREASE = "MockCallFreezeIncrease";
  const EVENT_NAME_MOCK_CALL_FREEZE_DECREASE = "MockCallFreezeDecrease";
  const EVENT_NAME_MOCK_CALL_TRANSFER_FROZEN = "MockCallTransferFrozen";
  const EVENT_NAME_SHARD_ADDED = "ShardAdded";
  const EVENT_NAME_SHARD_ADMIN_ASSIGNED = "ShardAdminAssigned";
  const EVENT_NAME_SHARD_ADMIN_CONFIGURED = "ShardAdminConfigured";
  const EVENT_NAME_SHARD_ADMIN_REVOKED = "ShardAdminRevoked";
  const EVENT_NAME_SHARD_REPLACED = "ShardReplaced";

  let freezerRootFactory: ContractFactory;
  let freezerShardFactory: ContractFactory;
  let tokenMockFactory: ContractFactory;
  let deployer: HardhatEthersSigner;
  let shardAdmin: HardhatEthersSigner;
  let freezer: HardhatEthersSigner;
  let receiver: HardhatEthersSigner;
  let user: HardhatEthersSigner;
  let users: HardhatEthersSigner[];

  const ownerRole: string = ethers.id("OWNER_ROLE");
  const pauserRole: string = ethers.id("PAUSER_ROLE");
  const rescuerRole: string = ethers.id("RESCUER_ROLE");
  const freezerRole: string = ethers.id("FREEZER_ROLE");

  before(async () => {
    let moreUsers: HardhatEthersSigner[];
    [deployer, shardAdmin, freezer, receiver, user, ...moreUsers] = await ethers.getSigners();
    users = [user, ...moreUsers];

    // Contract factories with the explicitly specified deployer account
    freezerRootFactory = await ethers.getContractFactory("BalanceFreezer");
    freezerRootFactory = freezerRootFactory.connect(deployer);
    freezerShardFactory = await ethers.getContractFactory("BalanceFreezerShard");
    freezerShardFactory = freezerShardFactory.connect(deployer);
    tokenMockFactory = await ethers.getContractFactory("ERC20FreezableTokenMock");
    tokenMockFactory = tokenMockFactory.connect(deployer);
  });

  async function deployTokenMock(): Promise<Contract> {
    const name = "ERC20 Test";
    const symbol = "TEST";

    let tokenMock: Contract = await tokenMockFactory.deploy(name, symbol) as Contract;
    await tokenMock.waitForDeployment();
    tokenMock = connect(tokenMock, deployer); // Explicitly specifying the initial account

    return tokenMock;
  }

  async function deployContracts(): Promise<Fixture> {
    const tokenMock = await deployTokenMock();
    let freezerRoot: Contract = await upgrades.deployProxy(freezerRootFactory, [getAddress(tokenMock)]);
    await freezerRoot.waitForDeployment();
    freezerRoot = connect(freezerRoot, deployer); // Explicitly specifying the initial account

    const freezerShards: Contract[] = [];
    const freezerShardCount = 3;
    for (let i = 0; i < freezerShardCount; ++i) {
      let freezerShard: Contract = await upgrades.deployProxy(freezerShardFactory, [getAddress(freezerRoot)]);
      await freezerShard.waitForDeployment();
      freezerShard = connect(freezerShard, deployer); // Explicitly specifying the initial account
      freezerShards.push(freezerShard);
    }

    return {
      freezerRoot,
      freezerShards,
      tokenMock
    };
  }

  async function deployAndConfigureContracts(): Promise<Fixture> {
    const fixture = await deployContracts();
    const { freezerRoot, freezerShards } = fixture;

    await proveTx(freezerRoot.grantRole(freezerRole, freezer.address));

    const freezerShardAddresses: string[] = freezerShards.map(shard => getAddress(shard));
    await proveTx(freezerRoot.addShards(freezerShardAddresses));

    return fixture;
  }

  function defineTestOperations(num: number = 1): TestOperation[] {
    const operations: TestOperation[] = [];
    const maxNum = Math.min(TX_ID_ARRAY.length, TOKEN_AMOUNTS.length, users.length);
    if (num > maxNum) {
      throw new Error(`The requested number of test operation structures is greater than ${maxNum}`);
    }
    for (let i = 0; i < num; ++i) {
      operations.push({
        txId: TX_ID_ARRAY[i],
        account: users[i].address,
        amount: BigInt(TOKEN_AMOUNTS[i]),
        status: OperationStatus.Nonexistent
      });
    }
    return operations;
  }

  async function pauseContract(contract: Contract) {
    await proveTx(contract.grantRole(pauserRole, deployer.address));
    await proveTx(contract.pause());
  }

  async function checkOperationStructureOnBlockchain(
    freezerRoot: Contract,
    operation: TestOperation
  ) {
    const actualOperation: Record<string, unknown> = await freezerRoot.getOperation(operation.txId);
    const expectedOperation: Operation = {
      status: operation.status,
      account: operation.account,
      amount: operation.amount
    };
    checkEquality(actualOperation, expectedOperation);
  }

  async function executeUpgradeShardsTo(
    freezerRoot: Contract,
    freezerShards: Contract[],
    targetShardImplementationAddress: string
  ) {
    const oldImplementationAddresses: string[] = await getImplementationAddresses(freezerShards);
    oldImplementationAddresses.forEach((_, i) => {
      expect(oldImplementationAddresses[i]).to.not.eq(
        targetShardImplementationAddress,
        `oldImplementationAddresses[${i}] is wrong`
      );
    });

    await proveTx(freezerRoot.upgradeShardsTo(targetShardImplementationAddress));

    const newImplementationAddresses: string[] = await getImplementationAddresses(freezerShards);
    newImplementationAddresses.forEach((_, i) => {
      expect(newImplementationAddresses[i]).to.eq(
        targetShardImplementationAddress,
        `newImplementationAddresses[${i}] is wrong`
      );
    });
  }

  describe("Function 'initialize()'", async () => {
    it("Configures the root contract as expected", async () => {
      const { freezerRoot, freezerShards, tokenMock } = await setUpFixture(deployContracts);

      // The underlying token contract address
      expect(await freezerRoot.underlyingToken()).to.equal(getAddress(tokenMock));

      // Role hashes
      expect(await freezerRoot.OWNER_ROLE()).to.equal(ownerRole);
      expect(await freezerRoot.PAUSER_ROLE()).to.equal(pauserRole);
      expect(await freezerRoot.RESCUER_ROLE()).to.equal(rescuerRole);
      expect(await freezerRoot.FREEZER_ROLE()).to.equal(freezerRole);

      // The role admins
      expect(await freezerRoot.getRoleAdmin(ownerRole)).to.equal(ownerRole);
      expect(await freezerRoot.getRoleAdmin(pauserRole)).to.equal(ownerRole);
      expect(await freezerRoot.getRoleAdmin(rescuerRole)).to.equal(ownerRole);
      expect(await freezerRoot.getRoleAdmin(freezerRole)).to.equal(ownerRole);

      // The deployer should have the owner role, but not the other roles
      expect(await freezerRoot.hasRole(ownerRole, deployer.address)).to.equal(true);
      expect(await freezerRoot.hasRole(pauserRole, deployer.address)).to.equal(false);
      expect(await freezerRoot.hasRole(rescuerRole, deployer.address)).to.equal(false);
      expect(await freezerRoot.hasRole(freezerRole, deployer.address)).to.equal(false);

      // The initial contract state is unpaused
      expect(await freezerRoot.paused()).to.equal(false);

      // Shard contracts has the correct admin
      const freezerRootAddress = getAddress(freezerRoot);
      for (const freezerShard of freezerShards) {
        expect(await freezerShard.isAdmin(freezerRootAddress)).to.equal(true);
      }

      // Other parameters and constants
      expect(await freezerRoot.MAX_SHARD_COUNTER()).to.equal(MAX_SHARD_COUNTER);
      expect(await freezerRoot.getShardCounter()).to.equal(0);
    });

    it("Configures the shard contract as expected", async () => {
      const { freezerRoot, freezerShards } = await setUpFixture(deployContracts);

      // Initial admin
      for (const freezerShard of freezerShards) {
        expect(await freezerShard.isAdmin(getAddress(freezerRoot))).to.equal(true);
      }
    });

    it("Is reverted if it is called a second time for the root contract", async () => {
      const { freezerRoot, tokenMock } = await setUpFixture(deployContracts);
      await expect(
        freezerRoot.initialize(getAddress(tokenMock))
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_CONTRACT_INITIALIZATION_IS_INVALID);
    });

    it("Is reverted if it is called a second time for the shard contract", async () => {
      const { freezerRoot, freezerShards: [freezerShard] } = await setUpFixture(deployContracts);
      await expect(
        freezerShard.initialize(getAddress(freezerRoot))
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_CONTRACT_INITIALIZATION_IS_INVALID);
    });

    it("Is reverted if the passed token address is zero for the root contract", async () => {
      const anotherFreezerRoot: Contract = await upgrades.deployProxy(freezerRootFactory, [], {
        initializer: false
      });

      await expect(
        anotherFreezerRoot.initialize(ADDRESS_ZERO)
      ).to.be.revertedWithCustomError(freezerRootFactory, REVERT_ERROR_IF_TOKEN_ADDRESS_IS_ZERO);
    });

    it("Is reverted if the passed admin address is zero for the shard contract", async () => {
      const anotherFreezerShard: Contract = await upgrades.deployProxy(freezerShardFactory, [], {
        initializer: false
      });

      await expect(
        anotherFreezerShard.initialize(ADDRESS_ZERO)
      ).to.be.revertedWithCustomError(freezerShardFactory, REVERT_ERROR_IF_ACCOUNT_ADDRESS_IS_ZERO_ON_SHARD);
    });
  });

  describe("Function 'upgradeToAndCall()'", async () => {
    it("Executes as expected for the root contract", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      await checkContractUupsUpgrading(freezerRoot, freezerRootFactory);
    });

    it("Executes as expected for the shard contract", async () => {
      const anotherFreezerShard: Contract =
        (await upgrades.deployProxy(freezerShardFactory, [shardAdmin.address])).connect(shardAdmin) as Contract;
      await checkContractUupsUpgrading(anotherFreezerShard, freezerShardFactory);
    });

    it("Is reverted if the caller is not the owner on the root contract", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);

      await expect(connect(freezerRoot, user).upgradeToAndCall(user.address, "0x"))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT)
        .withArgs(user.address, ownerRole);
    });

    it("Is reverted if the caller is not an admin on the shard contract", async () => {
      const anotherFreezerShard: Contract = await upgrades.deployProxy(freezerShardFactory, [shardAdmin.address]);

      await expect(connect(anotherFreezerShard, deployer).upgradeToAndCall(user.address, "0x"))
        .to.be.revertedWithCustomError(anotherFreezerShard, REVERT_ERROR_IF_UNAUTHORIZED_ON_SHARD);
    });
  });

  describe("Function 'upgradeTo()'", async () => {
    it("Executes as expected for the root contract", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      await checkContractUupsUpgrading(freezerRoot, freezerRootFactory, "upgradeTo(address)");
    });

    it("Executes as expected for the shard contract", async () => {
      const anotherFreezerShard: Contract =
        (await upgrades.deployProxy(freezerShardFactory, [shardAdmin.address])).connect(shardAdmin) as Contract;
      await checkContractUupsUpgrading(anotherFreezerShard, freezerShardFactory, "upgradeTo(address)");
    });

    it("Is reverted for the root contract if the caller does not have the owner role", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);

      await expect(connect(freezerRoot, user).upgradeTo(user.address))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT)
        .withArgs(user.address, ownerRole);
    });

    it("Is reverted for the shard contract if the caller is not an admin", async () => {
      const anotherFreezerShard: Contract = await upgrades.deployProxy(freezerShardFactory, [shardAdmin.address]);

      await expect(connect(anotherFreezerShard, deployer).upgradeTo(user.address))
        .to.be.revertedWithCustomError(anotherFreezerShard, REVERT_ERROR_IF_UNAUTHORIZED_ON_SHARD);
    });
  });

  describe("Function 'addShards()'", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      const shardAddresses = users.map(user => user.address);

      // Add a single shard
      const tx1 = freezerRoot.addShards([shardAddresses[0]]);
      await expect(tx1).to.emit(freezerRoot, EVENT_NAME_SHARD_ADDED).withArgs(shardAddresses[0]);
      expect(await freezerRoot.getShardCounter()).to.eq(1);

      // Add many shards.
      // One address is duplicated in the result shard array.
      const tx2 = freezerRoot.addShards(shardAddresses);
      for (const shardAddress of shardAddresses) {
        await expect(tx2).to.emit(freezerRoot, EVENT_NAME_SHARD_ADDED).withArgs(shardAddress);
      }
      expect(await freezerRoot.getShardCounter()).to.eq(1 + shardAddresses.length);
    });

    it("Is reverted if the caller is not the owner", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      const fakeShardAddress = user.address;
      await expect(
        connect(freezerRoot, user).addShards([fakeShardAddress])
      ).to.be.revertedWithCustomError(
        freezerRoot,
        REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT
      ).withArgs(user.address, ownerRole);
    });

    it("Is reverted if the number of shard exceeds the allowed maximum", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      const fakeShardAddress: string[] = Array.from(
        { length: MAX_SHARD_COUNTER },
        (_v, i) => "0x" + ((i + 1).toString().padStart(40, "0"))
      );
      const additionalFakeShardAddress = user.address;
      await proveTx(freezerRoot.addShards(fakeShardAddress));

      await expect(
        freezerRoot.addShards([additionalFakeShardAddress])
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_SHARD_COUNTER_EXCESS);
    });
  });

  describe("Function 'replaceShards()'", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      const shardCounter = 5;
      const oldShardAddresses = Array.from(
        { length: shardCounter },
        (_v, i) => "0x" + (i + 1).toString(16).padStart(40, "0")
      );
      const newShardAddresses = Array.from(
        { length: shardCounter },
        (_v, i) => "0x" + (i + 16).toString(16).padStart(40, "0")
      );

      await proveTx(freezerRoot.addShards(oldShardAddresses));

      // The empty array of addresses to replace
      const tx1 = freezerRoot.replaceShards(0, []);
      await expect(tx1).not.to.emit(freezerRoot, EVENT_NAME_SHARD_REPLACED);

      // The start index is outside the array of existing shards
      const tx2 = freezerRoot.replaceShards(oldShardAddresses.length, newShardAddresses);
      await expect(tx2).not.to.emit(freezerRoot, EVENT_NAME_SHARD_REPLACED);

      // Replacing the first shard address
      const tx3 = freezerRoot.replaceShards(0, [newShardAddresses[0]]);
      await expect(tx3).to.emit(freezerRoot, EVENT_NAME_SHARD_REPLACED).withArgs(
        newShardAddresses[0],
        oldShardAddresses[0]
      );
      oldShardAddresses[0] = newShardAddresses[0];
      expect(await freezerRoot.getShardRange(0, oldShardAddresses.length)).to.deep.eq(oldShardAddresses);

      // Replacing two shards in the middle
      const tx4 = freezerRoot.replaceShards(1, [newShardAddresses[1], newShardAddresses[2]]);
      await expect(tx4).to.emit(freezerRoot, EVENT_NAME_SHARD_REPLACED).withArgs(
        newShardAddresses[1],
        oldShardAddresses[1]
      );
      await expect(tx4).to.emit(freezerRoot, EVENT_NAME_SHARD_REPLACED).withArgs(
        newShardAddresses[2],
        oldShardAddresses[2]
      );
      oldShardAddresses[1] = newShardAddresses[1];
      oldShardAddresses[2] = newShardAddresses[2];
      expect(await freezerRoot.getShardRange(0, oldShardAddresses.length)).to.deep.eq(oldShardAddresses);

      // Replacing all shards except the first one.
      // One address is duplicated in the result shard array.
      newShardAddresses.pop();
      const tx5 = freezerRoot.replaceShards(1, newShardAddresses);
      for (let i = 1; i < oldShardAddresses.length; ++i) {
        await expect(tx5).to.emit(freezerRoot, EVENT_NAME_SHARD_REPLACED).withArgs(
          newShardAddresses[i - 1],
          oldShardAddresses[i]
        );
        oldShardAddresses[i] = newShardAddresses[i - 1];
      }
      expect(await freezerRoot.getShardRange(0, oldShardAddresses.length)).to.deep.eq(oldShardAddresses);
    });

    it("Is reverted if the caller is not the owner", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      const fakeShardAddress = user.address;
      await expect(
        connect(freezerRoot, user).replaceShards(0, [fakeShardAddress])
      ).to.be.revertedWithCustomError(
        freezerRoot,
        REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT
      ).withArgs(user.address, ownerRole);
    });

    it("Is reverted if the number of shards to replacement is greater than expected", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      const fakeShardAddresses = Array.from(
        { length: 3 },
        (_v, i) => "0x" + (i + 1).toString(16).padStart(40, "0")
      );
      await proveTx(freezerRoot.addShards(fakeShardAddresses));

      await expect(
        freezerRoot.replaceShards(1, fakeShardAddresses)
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_SHARD_REPLACEMENT_COUNTER_EXCESS);
    });
  });

  describe("Function 'upgradeShardsTo()'", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot, freezerShards } = await setUpFixture(deployAndConfigureContracts);

      const targetShardImplementation1: Contract = await freezerShardFactory.deploy() as Contract;
      await targetShardImplementation1.waitForDeployment();
      const targetShardImplementationAddress1 = getAddress(targetShardImplementation1);
      await executeUpgradeShardsTo(freezerRoot, freezerShards, targetShardImplementationAddress1);
    });

    it("Is reverted if the caller is not the owner", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      await expect(
        connect(freezerRoot, user).upgradeShardsTo(user.address)
      ).to.be.revertedWithCustomError(
        freezerRoot,
        REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT
      ).withArgs(user.address, ownerRole);
    });

    it("Is reverted if the shard implementation address is zero", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      await expect(
        freezerRoot.upgradeShardsTo(ADDRESS_ZERO)
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_SHARD_ADDRESS_IS_ZERO);
    });
  });

  describe("Function 'upgradeRootAndShardsTo()'", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot, freezerShards } = await setUpFixture(deployAndConfigureContracts);

      const targetRootImplementation: Contract = await freezerRootFactory.deploy() as Contract;
      await targetRootImplementation.waitForDeployment();
      const targetRootImplementationAddress = getAddress(targetRootImplementation);

      const targetShardImplementation: Contract = await freezerShardFactory.deploy() as Contract;
      await targetShardImplementation.waitForDeployment();
      const targetShardImplementationAddress = getAddress(targetShardImplementation);

      const oldRootImplementationAddress = await upgrades.erc1967.getImplementationAddress(getAddress(freezerRoot));
      expect(oldRootImplementationAddress).to.not.eq(targetRootImplementationAddress);

      const oldShardImplementationAddresses: string[] = await getImplementationAddresses(freezerShards);
      oldShardImplementationAddresses.forEach((_, i) => {
        expect(oldShardImplementationAddresses[i]).to.not.eq(
          targetShardImplementationAddress,
          `oldShardImplementationAddresses[${i}] is wrong`
        );
      });

      await proveTx(freezerRoot.upgradeRootAndShardsTo(
        targetRootImplementationAddress,
        targetShardImplementationAddress
      ));

      const newRootImplementationAddress = await upgrades.erc1967.getImplementationAddress(getAddress(freezerRoot));
      expect(newRootImplementationAddress).to.eq(targetRootImplementationAddress);

      const newShardImplementationAddresses: string[] = await getImplementationAddresses(freezerShards);
      newShardImplementationAddresses.forEach((_, i) => {
        expect(newShardImplementationAddresses[i]).to.eq(
          targetShardImplementationAddress,
          `newShardImplementationAddresses[${i}] is wrong`
        );
      });
    });

    it("Is reverted if the caller does not have the owner role", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);

      const targetRootImplementation: Contract = await freezerRootFactory.deploy() as Contract;
      await targetRootImplementation.waitForDeployment();
      const targetRootImplementationAddress = getAddress(targetRootImplementation);

      const targetShardImplementation: Contract = await freezerShardFactory.deploy() as Contract;
      await targetShardImplementation.waitForDeployment();
      const targetShardImplementationAddress = getAddress(targetShardImplementation);

      await expect(
        connect(freezerRoot, user).upgradeRootAndShardsTo(
          targetRootImplementationAddress,
          targetShardImplementationAddress
        )
      ).to.be.revertedWithCustomError(
        freezerRoot,
        REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT
      ).withArgs(user.address, ownerRole);
    });

    it("Is reverted if the root implementation address is zero", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);

      const targetShardImplementation: Contract = await freezerShardFactory.deploy() as Contract;
      await targetShardImplementation.waitForDeployment();
      const targetShardImplementationAddress = getAddress(targetShardImplementation);

      await expect(
        freezerRoot.upgradeRootAndShardsTo(
          ADDRESS_ZERO,
          targetShardImplementationAddress
        )
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_ROOT_ADDRESS_IS_ZERO);
    });

    it("Is reverted if the shard implementation address is zero", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);

      const targetRootImplementation: Contract = await freezerRootFactory.deploy() as Contract;
      await targetRootImplementation.waitForDeployment();
      const targetRootImplementationAddress = getAddress(targetRootImplementation);

      await expect(
        freezerRoot.upgradeRootAndShardsTo(
          targetRootImplementationAddress,
          ADDRESS_ZERO
        )
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_SHARD_ADDRESS_IS_ZERO);
    });
  });

  describe("Function 'configureShardAdmin()' of the root contract", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot, freezerShards } = await setUpFixture(deployAndConfigureContracts);

      for (const freezerShard of freezerShards) {
        expect(await freezerShard.isAdmin(user.address)).to.eq(false);
      }

      const tx1 = freezerRoot.configureShardAdmin(user.address, true);
      await expect(tx1)
        .to.emit(freezerRoot, EVENT_NAME_SHARD_ADMIN_CONFIGURED)
        .withArgs(
          user.address,
          true,
          freezerShards.length // Shard counter
        );

      for (const freezerShard of freezerShards) {
        expect(await freezerShard.isAdmin(user.address)).to.eq(true);
      }

      const tx2 = freezerRoot.configureShardAdmin(user.address, false);
      await expect(tx2)
        .to.emit(freezerRoot, EVENT_NAME_SHARD_ADMIN_CONFIGURED)
        .withArgs(
          user.address,
          false,
          freezerShards.length // Shard counter
        );

      for (const freezerShard of freezerShards) {
        expect(await freezerShard.isAdmin(user.address)).to.eq(false);
      }
    });

    it("Is reverted if the caller does not have the owner role", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      await expect(
        connect(freezerRoot, user).configureShardAdmin(user.address, true)
      ).to.be.revertedWithCustomError(
        freezerRoot,
        REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT
      ).withArgs(user.address, ownerRole);
    });

    it("Is reverted if the provide account address is zero", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      await expect(
        freezerRoot.configureShardAdmin(ADDRESS_ZERO, true)
      ).to.be.revertedWithCustomError(
        freezerRoot,
        REVERT_ERROR_IF_ACCOUNT_ADDRESS_IS_ZERO
      );
    });
  });

  describe("Function 'configureAdmin()' of the shard contract", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot, freezerShards } = await setUpFixture(deployAndConfigureContracts);
      const freezerShard: Contract = freezerShards[0];

      await proveTx(freezerRoot.configureShardAdmin(shardAdmin.address, true));
      expect(await freezerShard.isAdmin(shardAdmin.address)).to.eq(true);

      // Assign an admin
      expect(await freezerShard.isAdmin(user.address)).to.eq(false);
      await expect(connect(freezerShard, shardAdmin).configureAdmin(user.address, true)).to.be.emit(
        freezerShard,
        EVENT_NAME_SHARD_ADMIN_ASSIGNED
      ).withArgs(user.address);
      expect(await freezerShard.isAdmin(user.address)).to.eq(true);

      // Assign the same admin
      await expect(connect(freezerShard, shardAdmin).configureAdmin(user.address, true)).not.to.be.emit(
        freezerShard,
        EVENT_NAME_SHARD_ADMIN_ASSIGNED
      );
      expect(await freezerShard.isAdmin(user.address)).to.eq(true);

      // Revoke the admin
      await expect(connect(freezerShard, shardAdmin).configureAdmin(user.address, false)).to.be.emit(
        freezerShard,
        EVENT_NAME_SHARD_ADMIN_REVOKED
      ).withArgs(user.address);
      expect(await freezerShard.isAdmin(user.address)).to.eq(false);

      // Revoke the admin again
      await expect(connect(freezerShard, shardAdmin).configureAdmin(user.address, false)).not.to.be.emit(
        freezerShard,
        EVENT_NAME_SHARD_ADMIN_REVOKED
      );
      expect(await freezerShard.isAdmin(user.address)).to.eq(false);
    });

    it("Is reverted if the caller is not an admin", async () => {
      const { freezerShards } = await setUpFixture(deployAndConfigureContracts);
      await expect(
        connect(freezerShards[0], deployer).configureAdmin(user.address, true)
      ).to.be.revertedWithCustomError(
        freezerShards[0],
        REVERT_ERROR_IF_UNAUTHORIZED_ON_SHARD
      );
    });
  });

  describe("Function 'freeze()' accompanied by the 'registerOperation()' one", async () => {
    async function executeAndCheckFreezing(fixture: Fixture, operation: TestOperation) {
      const { freezerRoot, tokenMock } = fixture;
      const oldFrozenBalance = await tokenMock.OLD_FROZEN_BALANCE_MOCK();
      const newFrozenBalance: bigint = operation.amount;

      const operationBefore: TestOperation = { txId: operation.txId, ...defaultOperation };
      await checkOperationStructureOnBlockchain(freezerRoot, operationBefore);

      const tx = connect(freezerRoot, freezer).freeze(
        operation.account,
        operation.amount,
        operation.txId
      );
      await expect(tx).to.be.emit(freezerRoot, EVENT_NAME_FROZEN_BALANCE_UPDATED).withArgs(
        operation.account,
        newFrozenBalance,
        oldFrozenBalance,
        operation.txId
      );
      await expect(tx).to.be.emit(tokenMock, EVENT_NAME_MOCK_CALL_FREEZE).withArgs(
        operation.account,
        operation.amount
      );

      operation.status = OperationStatus.UpdateReplacementExecuted;
      await checkOperationStructureOnBlockchain(freezerRoot, operation);
    }

    it("Executes as expected with different account address and amount values", async () => {
      const fixture = await setUpFixture(deployAndConfigureContracts);
      const operations: TestOperation[] = defineTestOperations(3);
      operations[1].amount = 0n;

      // This is allowed in the contract under test, but not for the real token contract
      operations[2].account = ADDRESS_ZERO;

      await executeAndCheckFreezing(fixture, operations[0]);
      await executeAndCheckFreezing(fixture, operations[1]);
      await executeAndCheckFreezing(fixture, operations[2]);
    });

    it("Is reverted if the root contract is paused", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await pauseContract(freezerRoot);
      await expect(connect(freezerRoot, freezer).freeze(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_CONTRACT_IS_PAUSED);
    });

    it("Is reverted if the caller does not have the freezer role on the root contract", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await expect(connect(freezerRoot, deployer).freeze(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT)
        .withArgs(deployer.address, freezerRole);
    });

    it("Is reverted if the provided off-chain transaction identifier is zero", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      operation.txId = TX_ID_ZERO;
      await expect(connect(freezerRoot, freezer).freeze(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_TX_ID_IS_ZERO);
    });

    it("Is reverted if the provided amount is greater than 64-bit unsigned integer", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      operation.amount = BigInt(2) ** 64n;
      await expect(connect(freezerRoot, freezer).freeze(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_AMOUNT_EXCESS)
        .withArgs(operation.amount);
    });

    it("Is reverted if an operation with the provided ID has been already executed", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await proveTx(connect(freezerRoot, freezer).freeze(operation.account, operation.amount, operation.txId));
      await expect(connect(freezerRoot, freezer).freeze(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_OPERATION_ALREADY_EXECUTED)
        .withArgs(operation.txId);
    });
  });

  describe("Function 'freezeIncrease()' accompanied by the 'registerOperation()' one", async () => {
    async function executeAndCheckFreezeIncreasing(fixture: Fixture, operation: TestOperation) {
      const { freezerRoot, tokenMock } = fixture;
      const oldFrozenBalance = await tokenMock.OLD_FROZEN_BALANCE_MOCK();
      const newFrozenBalance = oldFrozenBalance + operation.amount;

      const operationBefore: TestOperation = { txId: operation.txId, ...defaultOperation };
      await checkOperationStructureOnBlockchain(freezerRoot, operationBefore);

      const tx = connect(freezerRoot, freezer).freezeIncrease(
        operation.account,
        operation.amount,
        operation.txId
      );
      await expect(tx).to.be.emit(freezerRoot, EVENT_NAME_FROZEN_BALANCE_UPDATED).withArgs(
        operation.account,
        newFrozenBalance,
        oldFrozenBalance,
        operation.txId
      );
      await expect(tx).to.be.emit(tokenMock, EVENT_NAME_MOCK_CALL_FREEZE_INCREASE).withArgs(
        operation.account,
        operation.amount
      );

      operation.status = OperationStatus.UpdateIncreaseExecuted;
      await checkOperationStructureOnBlockchain(freezerRoot, operation);
    }

    it("Executes as expected with different account address and amount values", async () => {
      const fixture = await setUpFixture(deployAndConfigureContracts);
      const operations: TestOperation[] = defineTestOperations(3);

      // This following cases are allowed in the contract under test, but not for the real token contract
      operations[1].amount = 0n;
      operations[2].account = ADDRESS_ZERO;

      await executeAndCheckFreezeIncreasing(fixture, operations[0]);
      await executeAndCheckFreezeIncreasing(fixture, operations[1]);
      await executeAndCheckFreezeIncreasing(fixture, operations[2]);
    });

    it("Is reverted if the root contract is paused", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await pauseContract(freezerRoot);
      await expect(connect(freezerRoot, freezer).freezeIncrease(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_CONTRACT_IS_PAUSED);
    });

    it("Is reverted if the caller does not have the freezer role on the root contract", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await expect(connect(freezerRoot, deployer).freezeIncrease(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT)
        .withArgs(deployer.address, freezerRole);
    });

    it("Is reverted if the provided off-chain transaction identifier is zero", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      operation.txId = TX_ID_ZERO;
      await expect(connect(freezerRoot, freezer).freezeIncrease(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_TX_ID_IS_ZERO);
    });

    it("Is reverted if the provided amount is greater than 64-bit unsigned integer", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      operation.amount = BigInt(2) ** 64n;
      await expect(connect(freezerRoot, freezer).freezeIncrease(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_AMOUNT_EXCESS)
        .withArgs(operation.amount);
    });

    it("Is reverted if an operation with the provided ID has been already executed", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await proveTx(connect(freezerRoot, freezer).freeze(operation.account, operation.amount, operation.txId));
      await expect(connect(freezerRoot, freezer).freezeIncrease(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_OPERATION_ALREADY_EXECUTED)
        .withArgs(operation.txId);
    });
  });

  describe("Function 'freezeDecrease()' accompanied by the 'registerOperation()' one", async () => {
    async function executeAndCheckFreezeDecreasing(fixture: Fixture, operation: TestOperation) {
      const { freezerRoot, tokenMock } = fixture;
      const oldFrozenBalance = await tokenMock.OLD_FROZEN_BALANCE_MOCK();
      const newFrozenBalance = (operation.amount > oldFrozenBalance) ? 0n : oldFrozenBalance - operation.amount;

      const operationBefore: TestOperation = { txId: operation.txId, ...defaultOperation };
      await checkOperationStructureOnBlockchain(freezerRoot, operationBefore);

      const tx = connect(freezerRoot, freezer).freezeDecrease(
        operation.account,
        operation.amount,
        operation.txId
      );
      await expect(tx).to.be.emit(freezerRoot, EVENT_NAME_FROZEN_BALANCE_UPDATED).withArgs(
        operation.account,
        newFrozenBalance,
        oldFrozenBalance,
        operation.txId
      );
      await expect(tx).to.be.emit(tokenMock, EVENT_NAME_MOCK_CALL_FREEZE_DECREASE).withArgs(
        operation.account,
        operation.amount
      );

      operation.status = OperationStatus.UpdateDecreaseExecuted;
      await checkOperationStructureOnBlockchain(freezerRoot, operation);
    }

    it("Executes as expected with different account address and amount values", async () => {
      const fixture = await setUpFixture(deployAndConfigureContracts);
      const operations: TestOperation[] = defineTestOperations(4);
      const oldFrozenBalance: bigint = await fixture.tokenMock.OLD_FROZEN_BALANCE_MOCK();

      // This following cases are allowed in the contract under test, but not for the real token contract
      operations[1].amount = 0n;
      operations[2].amount = oldFrozenBalance + 1n;
      operations[3].account = ADDRESS_ZERO;

      await executeAndCheckFreezeDecreasing(fixture, operations[0]);
      await executeAndCheckFreezeDecreasing(fixture, operations[1]);
      await executeAndCheckFreezeDecreasing(fixture, operations[2]);
      await executeAndCheckFreezeDecreasing(fixture, operations[3]);
    });

    it("Is reverted if the root contract is paused", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await pauseContract(freezerRoot);
      await expect(connect(freezerRoot, freezer).freezeDecrease(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_CONTRACT_IS_PAUSED);
    });

    it("Is reverted if the caller does not have the freezer role on the root contract", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await expect(connect(freezerRoot, deployer).freezeDecrease(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT)
        .withArgs(deployer.address, freezerRole);
    });

    it("Is reverted if the provided off-chain transaction identifier is zero", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      operation.txId = TX_ID_ZERO;
      await expect(connect(freezerRoot, freezer).freezeDecrease(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_TX_ID_IS_ZERO);
    });

    it("Is reverted if the provided amount is greater than 64-bit unsigned integer", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      operation.amount = BigInt(2) ** 64n;
      await expect(connect(freezerRoot, freezer).freezeDecrease(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_AMOUNT_EXCESS)
        .withArgs(operation.amount);
    });

    it("Is reverted if an operation with the provided ID has been already executed", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await proveTx(connect(freezerRoot, freezer).freeze(operation.account, operation.amount, operation.txId));
      await expect(connect(freezerRoot, freezer).freezeDecrease(operation.account, operation.amount, operation.txId))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_OPERATION_ALREADY_EXECUTED)
        .withArgs(operation.txId);
    });
  });

  describe("Function 'transferFrozen()' accompanied by the 'registerOperation()' one", async () => {
    async function executeAndCheckTransfering(
      fixture: Fixture,
      operation: TestOperation,
      receiverAddress: string
    ) {
      const { freezerRoot, tokenMock } = fixture;
      const oldFrozenBalance = await tokenMock.OLD_FROZEN_BALANCE_MOCK();
      const newFrozenBalance = (operation.amount > oldFrozenBalance) ? 0n : oldFrozenBalance - operation.amount;

      const operationBefore: TestOperation = { txId: operation.txId, ...defaultOperation };
      await checkOperationStructureOnBlockchain(freezerRoot, operationBefore);

      const tx = connect(freezerRoot, freezer).transferFrozen(
        operation.account, // from
        receiverAddress, // to
        operation.amount,
        operation.txId
      );
      await expect(tx).to.be.emit(freezerRoot, EVENT_NAME_FROZEN_BALANCE_TRANSFER).withArgs(
        operation.account,
        operation.amount,
        operation.txId,
        receiverAddress
      );
      await expect(tx).to.be.emit(freezerRoot, EVENT_NAME_FROZEN_BALANCE_UPDATED).withArgs(
        operation.account,
        newFrozenBalance,
        oldFrozenBalance,
        operation.txId
      );
      expect(tx).to.be.emit(tokenMock, EVENT_NAME_MOCK_CALL_TRANSFER_FROZEN).withArgs(
        operation.account, // from
        receiverAddress, // to
        operation.amount
      );

      operation.status = OperationStatus.TransferExecuted;
      await checkOperationStructureOnBlockchain(freezerRoot, operation);
    }

    it("Executes as expected with different account address and amount values", async () => {
      const fixture = await setUpFixture(deployAndConfigureContracts);
      const operations: TestOperation[] = defineTestOperations(5);
      const oldFrozenBalance: bigint = await fixture.tokenMock.OLD_FROZEN_BALANCE_MOCK();
      const receiverAddresses: string[] = Array(operations.length).fill(receiver.address);

      operations[1].amount = 0n;
      // This following cases are allowed in the contract under test, but not for the real token contract
      operations[2].amount = oldFrozenBalance + 1n;
      operations[3].account = ADDRESS_ZERO;
      receiverAddresses[4] = ADDRESS_ZERO;

      await executeAndCheckTransfering(fixture, operations[0], receiverAddresses[0]);
      await executeAndCheckTransfering(fixture, operations[1], receiverAddresses[1]);
      await executeAndCheckTransfering(fixture, operations[2], receiverAddresses[2]);
      await executeAndCheckTransfering(fixture, operations[3], receiverAddresses[3]);
      await executeAndCheckTransfering(fixture, operations[4], receiverAddresses[4]);
    });

    it("Is reverted if the root contract is paused", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await pauseContract(freezerRoot);
      await expect(connect(freezerRoot, freezer).transferFrozen(
        operation.account, // from
        receiver.address, // to
        operation.amount,
        operation.txId
      )).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_CONTRACT_IS_PAUSED);
    });

    it("Is reverted if the caller does not have the freezer role on the root contract", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await expect(connect(freezerRoot, deployer).transferFrozen(
        operation.account, // from
        receiver.address, // to
        operation.amount,
        operation.txId
      ))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT)
        .withArgs(deployer.address, freezerRole);
    });

    it("Is reverted if the provided off-chain transaction identifier is zero", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      operation.txId = TX_ID_ZERO;
      await expect(connect(freezerRoot, freezer).transferFrozen(
        operation.account, // from
        receiver.address, // to
        operation.amount,
        operation.txId
      )).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_TX_ID_IS_ZERO);
    });

    it("Is reverted if the provided amount is greater than 64-bit unsigned integer", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      operation.amount = BigInt(2) ** 64n;
      await expect(connect(freezerRoot, freezer).transferFrozen(
        operation.account, // from
        receiver.address, // to
        operation.amount,
        operation.txId
      ))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_AMOUNT_EXCESS)
        .withArgs(operation.amount);
    });

    it("Is reverted if an operation with the provided ID has been already executed", async () => {
      const { freezerRoot } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await proveTx(connect(freezerRoot, freezer).freeze(operation.account, operation.amount, operation.txId));
      await expect(connect(freezerRoot, freezer).transferFrozen(
        operation.account, // from
        receiver.address, // to
        operation.amount,
        operation.txId
      ))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_OPERATION_ALREADY_EXECUTED)
        .withArgs(operation.txId);
    });
  });

  describe("Function 'balanceOfFrozen()'", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const expectedBalance: bigint = BigInt(await tokenMock.OLD_FROZEN_BALANCE_MOCK()) + BigInt(user.address);
      const actualBalance = await freezerRoot.balanceOfFrozen(user.address);
      expect(actualBalance).to.equal(expectedBalance);
    });
  });

  describe("Function 'getShardByTxId()'", async () => {
    it("Returns expected values for different transaction IDs", async () => {
      const { freezerRoot, freezerShards } = await setUpFixture(deployAndConfigureContracts);
      const shardCounter = freezerShards.length;
      const expectedShardIndexes: number[] = TX_ID_ARRAY.map(txId => defineShardIndexByTxId(txId, shardCounter));
      const expectedShardAddresses: string[] = expectedShardIndexes.map(i => getAddress(freezerShards[i]));

      for (let i = 0; i < shardCounter; ++i) {
        if (!expectedShardIndexes.includes(i)) {
          throw Error(`Not all shard indexes are covered with the test. Current indexes: ${expectedShardIndexes}`);
        }
      }

      for (let i = 0; i < TX_ID_ARRAY.length; ++i) {
        const txId = TX_ID_ARRAY[i];
        const expectedShardAddress = expectedShardAddresses[i];
        expect(await freezerRoot.getShardByTxId(txId)).to.eq(
          expectedShardAddress,
          `Shard address for transaction ID ${txId}`
        );
      }
    });
  });

  describe("Function 'getShardRange()'", async () => {
    it("Returns expected values in different cases", async () => {
      const { freezerRoot, freezerShards } = await setUpFixture(deployAndConfigureContracts);
      const shardAddresses = freezerShards.map(shard => getAddress(shard));
      const shardCount = freezerShards.length;
      let actualShardAddresses: string[];

      expect(freezerShards.length).greaterThanOrEqual(3);
      expect(freezerShards.length).lessThan(50);

      actualShardAddresses = await freezerRoot.getShardRange(0, 50);
      expect(actualShardAddresses).to.be.deep.equal(shardAddresses);

      actualShardAddresses = await freezerRoot.getShardRange(0, 2);
      expect(actualShardAddresses).to.be.deep.equal([shardAddresses[0], shardAddresses[1]]);

      actualShardAddresses = await freezerRoot.getShardRange(1, 2);
      expect(actualShardAddresses).to.be.deep.equal([shardAddresses[1], shardAddresses[2]]);

      actualShardAddresses = await freezerRoot.getShardRange(1, 1);
      expect(actualShardAddresses).to.be.deep.equal([shardAddresses[1]]);

      actualShardAddresses = await freezerRoot.getShardRange(1, 50);
      expect(actualShardAddresses).to.be.deep.equal(shardAddresses.slice(1));

      actualShardAddresses = await freezerRoot.getShardRange(shardCount, 50);
      expect(actualShardAddresses).to.be.deep.equal(shardAddresses.slice(shardCount));

      actualShardAddresses = await freezerRoot.getShardRange(1, 0);
      expect(actualShardAddresses).to.be.deep.equal([]);
    });
  });

  describe("Special scenarios for shard functions", async () => {
    it("The 'registerOperation()' function is reverted if it is called not by an admin", async () => {
      const { freezerShards } = await setUpFixture(deployAndConfigureContracts);
      const [operation] = defineTestOperations();
      await expect(connect(freezerShards[0], deployer).registerOperation(
        operation.txId,
        operation.status,
        operation.account,
        operation.amount
      )).to.be.revertedWithCustomError(freezerShards[0], REVERT_ERROR_IF_UNAUTHORIZED_ON_SHARD);
    });
  });
});
