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
  UpdateExecuted = 2
}

interface Operation {
  txId: string;
  status: OperationStatus;

  [key: string]: number | string; // Indexing signature to ensure that fields are iterated over in a key-value style
}

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
      `Mismatch in the "${property}" property in the actual object and expected one` + indexString
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
  const TX_ID1 = ethers.encodeBytes32String("MOCK_TRANSACTION_ID1");
  const TX_ID2 = ethers.encodeBytes32String("MOCK_TRANSACTION_ID2");
  const TX_ID3 = ethers.encodeBytes32String("MOCK_TRANSACTION_ID3");
  const TX_ID_ARRAY: string[] = [TX_ID1, TX_ID2, TX_ID3];
  const TOKEN_AMOUNT = 12345678;
  const TOKEN_AMOUNT_ZERO = 0;
  const MAX_SHARD_COUNTER = 100;

  // Errors of the lib contracts
  const REVERT_ERROR_IF_CONTRACT_INITIALIZATION_IS_INVALID = "InvalidInitialization";
  const REVERT_ERROR_IF_CONTRACT_IS_PAUSED = "EnforcedPause";
  const REVERT_ERROR_IF_UNAUTHORIZED = "Unauthorized";
  const REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT = "AccessControlUnauthorizedAccount";

  // Errors of the contracts under test
  const REVERT_ERROR_IF_ROOT_ADDRESS_IZ_ZERO = "ZeroRootAddress";
  const REVERT_ERROR_IF_SHARD_ADDRESS_IZ_ZERO = "ZeroShardAddress";
  const REVERT_ERROR_IF_TOKEN_ADDRESS_IZ_ZERO = "ZeroTokenAddress";
  const REVERT_ERROR_IF_ACCOUNT_ADDRESS_IS_ZERO = "ZeroAccountAddress";
  const REVERT_ERROR_IF_SHARD_COUNTER_EXCESS = "ShardCounterExcess";
  const REVERT_ERROR_IF_SHARD_ADMIN_ASSIGNED = "ShardAdminAssigned";
  const REVERT_ERROR_IF_SHARD_ADMIN_REVOKED = "ShardAdminRevoked";

  // Events of the contracts under test
  const EVENT_NAME_SHARD_ADDED = "ShardAdded";
  const EVENT_NAME_SHARD_ADMIN_CONFIGURED = "ShardAdminConfigured";
  const EVENT_NAME_FROZEN_BALANCE_TRANSFER = "FrozenBalanceTransfer";
  const EVENT_NAME_FROZEN_BALANCE_UPDATED = "FrozenBalanceUpdated";

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
    let secondUser: HardhatEthersSigner;
    let thirdUser: HardhatEthersSigner;
    [deployer, shardAdmin, freezer, receiver, user, secondUser, thirdUser] = await ethers.getSigners();
    users = [user, secondUser, thirdUser];

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

  async function pauseContract(contract: Contract) {
    await proveTx(contract.grantRole(pauserRole, deployer.address));
    await proveTx(contract.pause());
  }

  async function checkOperationStructuresOnBlockchain(freezerCashier: Contract, operations: Operation[]) {
    for (let i = 0; i < operations.length; ++i) {
      const operation: Operation = operations[i];
      const actualOperation: Record<string, unknown> = await freezerCashier.getOperation(operation.txId);
      checkEquality(actualOperation, operation, i);
    }
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
      const { freezerRoot, tokenMock } = await setUpFixture(deployContracts);

      // The underlying contract address
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

      // Other parameters and constants
      expect(await freezerRoot.MAX_SHARD_COUNTER()).to.equal(MAX_SHARD_COUNTER);
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
      const { freezerRoot, freezerShards: [pixCashierShard] } = await setUpFixture(deployContracts);
      await expect(
        pixCashierShard.initialize(getAddress(freezerRoot))
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_CONTRACT_INITIALIZATION_IS_INVALID);
    });

    it("Is reverted if the passed token address is zero for the root contract", async () => {
      const anotherFreezerRoot: Contract = await upgrades.deployProxy(freezerRootFactory, [], {
        initializer: false
      });

      await expect(
        anotherFreezerRoot.initialize(ADDRESS_ZERO)
      ).to.be.revertedWithCustomError(freezerRootFactory, REVERT_ERROR_IF_TOKEN_ADDRESS_IZ_ZERO);
    });

    it("Is reverted if the passed admin address is zero for the shard contract", async () => {
      const anotherFreezerShard: Contract = await upgrades.deployProxy(freezerShardFactory, [], {
        initializer: false
      });

      await expect(
        anotherFreezerShard.initialize(ADDRESS_ZERO)
      ).to.be.revertedWithCustomError(freezerShardFactory, REVERT_ERROR_IF_ACCOUNT_ADDRESS_IS_ZERO);
    });
  });

  describe("Function 'upgradeToAndCall()'", async () => {
    it("Executes as expected for the root contract", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      await checkContractUupsUpgrading(freezerRoot, freezerRootFactory);
    });

    it("Executes as expected for the shard contract", async () => {
      const anotherPixCashierShard: Contract = await upgrades.deployProxy(freezerShardFactory, [deployer.address]);
      await checkContractUupsUpgrading(anotherPixCashierShard, freezerShardFactory);
    });

    it("Is reverted if the caller is not the owner for the root contract", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);

      await expect(connect(freezerRoot, user).upgradeToAndCall(user.address, "0x"))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT)
        .withArgs(user.address, ownerRole);
    });

    it("Is reverted if the caller is not an admin for the shard contract", async () => {
      const anotherFreezerShard: Contract = await upgrades.deployProxy(freezerShardFactory, [deployer.address]);

      await expect(connect(anotherFreezerShard, user).upgradeToAndCall(user.address, "0x"))
        .to.be.revertedWithCustomError(anotherFreezerShard, REVERT_ERROR_IF_UNAUTHORIZED);
    });
  });

  describe("Function 'upgradeTo()'", async () => {
    it("Executes as expected for the root contract", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      await checkContractUupsUpgrading(freezerRoot, freezerRootFactory, "upgradeTo(address)");
    });

    it("Executes as expected for the shard contract", async () => {
      const anotherFreezerShard: Contract = await upgrades.deployProxy(freezerShardFactory, [deployer.address]);
      await checkContractUupsUpgrading(anotherFreezerShard, freezerShardFactory, "upgradeTo(address)");
    });

    it("Is reverted for the root contract if the caller does not have the owner role", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);

      await expect(connect(freezerRoot, user).upgradeTo(user.address))
        .to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT)
        .withArgs(user.address, ownerRole);
    });

    it("Is reverted for the shard contract if the caller is not an admin", async () => {
      const anotherFreezerShard: Contract = await upgrades.deployProxy(freezerShardFactory, [deployer.address]);

      await expect(connect(anotherFreezerShard, user).upgradeTo(user.address))
        .to.be.revertedWithCustomError(anotherFreezerShard, REVERT_ERROR_IF_UNAUTHORIZED);
    });
  });

  describe("Function 'addShards()'", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot } = await setUpFixture(deployContracts);
      const shardAddresses = users.map(user => user.address);

      const tx1 = freezerRoot.addShards([shardAddresses[0]]);
      await expect(tx1).to.emit(freezerRoot, EVENT_NAME_SHARD_ADDED).withArgs(shardAddresses[0]);
      expect(await freezerRoot.getShardCounter()).to.eq(1);

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
        connect(freezerRoot, freezer).addShards([fakeShardAddress])
      ).to.be.revertedWithCustomError(
        freezerRoot,
        REVERT_ERROR_IF_UNAUTHORIZED_ACCOUNT
      ).withArgs(freezer.address, ownerRole);
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
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_SHARD_ADDRESS_IZ_ZERO);
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
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_ROOT_ADDRESS_IZ_ZERO);
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
      ).to.be.revertedWithCustomError(freezerRoot, REVERT_ERROR_IF_SHARD_ADDRESS_IZ_ZERO);
    });
  });

  describe("Function 'configureShardAdmin()' of the root contract", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot, freezerShards } = await setUpFixture(deployAndConfigureContracts);

      for (const freezerShard of freezerShards) {
        expect(await freezerShard.isAdmin(user.address)).to.eq(false);
      }

      const tx1 = await proveTx(freezerRoot.configureShardAdmin(user.address, true));
      await expect(tx1)
        .to.emit(freezerRoot, EVENT_NAME_SHARD_ADMIN_CONFIGURED)
        .withArgs(
          user.address,
          true,
          freezerShards.length // Shard counter
        );

      for (const pixCashierShard of freezerShards) {
        expect(await pixCashierShard.isAdmin(user.address)).to.eq(true);
      }

      const tx2 = await proveTx(freezerRoot.configureShardAdmin(user.address, false));
      await expect(tx2)
        .to.emit(freezerRoot, EVENT_NAME_SHARD_ADMIN_CONFIGURED)
        .withArgs(
          user.address,
          false,
          freezerShards.length // Shard counter
        );

      for (const pixCashierShard of freezerShards) {
        expect(await pixCashierShard.isAdmin(user.address)).to.eq(false);
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
  });

  describe("Function 'configureAdmin()' of the shard contract", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot, freezerShards } = await setUpFixture(deployAndConfigureContracts);
      const freezerShard: Contract = freezerShards[0];

      await proveTx(freezerRoot.configureShardAdmin(shardAdmin.address, true));
      expect(await freezerShard.isAdmin(shardAdmin.address)).to.eq(true);

      expect(await freezerShard.isAdmin(user.address)).to.eq(false);
      await expect(connect(freezerShard, shardAdmin).configureAdmin(user.address, true)).to.be.emit(
        freezerShard,
        REVERT_ERROR_IF_SHARD_ADMIN_ASSIGNED
      ).withArgs(user.address);
      expect(await freezerShard.isAdmin(user.address)).to.eq(true);

      await expect(connect(freezerShard, shardAdmin).configureAdmin(user.address, false)).to.be.emit(
        freezerShard,
        REVERT_ERROR_IF_SHARD_ADMIN_REVOKED
      ).withArgs(user.address);
      expect(await freezerShard.isAdmin(user.address)).to.eq(false);
    });

    it("Is reverted if the caller is not an admin", async () => {
      const { freezerShards } = await setUpFixture(deployAndConfigureContracts);
      await expect(
        connect(freezerShards[0], deployer).configureAdmin(user.address, true)
      ).to.be.revertedWithCustomError(
        freezerShards[0],
        REVERT_ERROR_IF_UNAUTHORIZED
      );
    });
  });

  describe("Function 'freeze()' accompanied by the 'registerOperation()' one", async () => {
    it("Executes as expected", async () => {
      const { freezerRoot, tokenMock } = await setUpFixture(deployAndConfigureContracts);
      const oldFrozenBalance = await tokenMock.OLD_FROZEN_BALANCE_MOCK();
      const tx = await proveTx(connect(freezerRoot, freezer).freeze(
        user.address,
        TOKEN_AMOUNT,
        TX_ID1
      ));
      expect(tx).to.be.emit(freezerRoot, EVENT_NAME_FROZEN_BALANCE_UPDATED);
    });
  });

  describe("Function 'getShardByTxId()'", async () => {
    it("Returns expected values for different transaction IDs", async () => {
      const { freezerRoot, freezerShards } = await setUpFixture(deployAndConfigureContracts);
      const shardCount = freezerShards.length;
      const expectedShardIndexes: number[] = TX_ID_ARRAY.map(txId => defineShardIndexByTxId(txId, shardCount));
      const expectedShardAddresses: string[] = expectedShardIndexes.map(i => getAddress(freezerShards[i]));

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

  // describe("Scenarios for distributing data among shards", async () => {
  //   async function prepareTest(): Promise<{
  //     fixture: Fixture;
  //     txIds: string[];
  //     shardMatchIndexes: number[];
  //     txIdsByShardIndex: string[][];
  //   }> {
  //     const fixture = await setUpFixture(deployAndConfigureContracts);
  //     const shardCount = fixture.freezerShards.length;
  //     const txIdCount = shardCount * 3;
  //     const txIdIndexes = Array.from(Array(txIdCount).keys());
  //     const txIds: string[] = txIdIndexes.map(i => ethers.encodeBytes32String("txId" + i.toString()));
  //     const shardMatchIndexes: number[] = txIds.map(txId => defineShardIndexByTxId(txId, shardCount));
  //     const shardOrderedIndexes: number[] = Array.from(Array(shardCount).keys());
  //     const txIdsByShardIndex: string[][] = Array.from({ length: shardCount }, () => []);
  //     for (let i = 0; i < txIds.length; ++i) {
  //       const txId = txIds[i];
  //       const shardMatchIndex = shardMatchIndexes[i];
  //       txIdsByShardIndex[shardMatchIndex].push(txId);
  //     }
  //
  //     expect(shardMatchIndexes).to.include.members(shardOrderedIndexes);
  //
  //     return { fixture, txIds, shardMatchIndexes, txIdsByShardIndex };
  //   }
  //
  //   it("Cash-in data distribution executes as expected", async () => {
  //     const { fixture, txIds, shardMatchIndexes, txIdsByShardIndex } = await prepareTest();
  //     const { freezerRoot, freezerShards } = fixture;
  //     const cashIns: TestCashIn[] = txIds.map((txId, i) => ({
  //       account: user,
  //       amount: i + 1,
  //       txId,
  //       status: CashInStatus.Executed
  //     }));
  //     for (const cashIn of cashIns) {
  //       await proveTx(connect(freezerRoot, cashier).cashIn(
  //         cashIn.account.address,
  //         cashIn.amount,
  //         cashIn.txId
  //       ));
  //     }
  //     // Get and check structures one by one
  //     for (let i = 0; i < txIds.length; ++i) {
  //       const txId = txIds[i];
  //       const shardIndex = shardMatchIndexes[i];
  //       const expectedCashIn = cashIns[i];
  //       const actualCashIn = await freezerShards[shardIndex].getCashIn(txId);
  //       checkCashInEquality(actualCashIn, expectedCashIn, i);
  //     }
  //
  //     // Get and check structures by shards
  //     for (let i = 0; i < txIdsByShardIndex.length; ++i) {
  //       const txIds = txIdsByShardIndex[i];
  //       const expectedCashIns: TestCashIn[] = cashIns.filter(cashIn => txIds.includes(cashIn.txId));
  //       const actualCashIns = await freezerShards[i].getCashIns(txIds);
  //       for (let j = 0; j < txIds.length; ++j) {
  //         checkCashInEquality(actualCashIns[j], expectedCashIns[j], j);
  //       }
  //     }
  //   });
  //
  //   it("Cash-out data distribution executes as expected", async () => {
  //     const { fixture, txIds, shardMatchIndexes, txIdsByShardIndex } = await prepareTest();
  //     const { freezerRoot, freezerShards } = fixture;
  //     const cashOuts: TestCashOut[] = txIds.map((txId, i) => ({
  //       account: user,
  //       amount: i + 1,
  //       txId,
  //       status: CashOutStatus.Pending
  //     }));
  //     await requestCashOuts(freezerRoot, cashOuts);
  //
  //     // Get and check structures one by one
  //     for (let i = 0; i < txIds.length; ++i) {
  //       const txId = txIds[i];
  //       const shardIndex = shardMatchIndexes[i];
  //       const expectedCashOut = cashOuts[i];
  //       const actualCashOut = await freezerShards[shardIndex].getCashOut(txId);
  //       checkCashOutEquality(actualCashOut, expectedCashOut, i);
  //     }
  //
  //     // Get and check structures by shards
  //     for (let i = 0; i < txIdsByShardIndex.length; ++i) {
  //       const txIds = txIdsByShardIndex[i];
  //       const expectedCashOuts: TestCashOut[] = cashOuts.filter(cashOut => txIds.includes(cashOut.txId));
  //       const actualCashOuts = await freezerShards[i].getCashOuts(txIds);
  //       for (let j = 0; j < txIds.length; ++j) {
  //         checkCashOutEquality(actualCashOuts[j], expectedCashOuts[j], j);
  //       }
  //     }
  //   });
  // });
  //
  // describe("Special scenarios for shard functions", async () => {
  //   it("The 'registerCashIn()' function is reverted if it is called not by the owner or admin", async () => {
  //     const { freezerShards } = await setUpFixture(deployAndConfigureContracts);
  //     await expect(connect(freezerShards[0], deployer).registerCashIn(
  //       user.address, // account
  //       1, // amount
  //       TX_ID1,
  //       CashInStatus.Executed
  //     )).to.be.revertedWithCustomError(freezerShards[0], REVERT_ERROR_IF_UNAUTHORIZED);
  //   });
  //
  //   it("The 'revokeCashIn()' function is reverted if it is called not by the owner or admin", async () => {
  //     const { freezerShards } = await setUpFixture(deployAndConfigureContracts);
  //     await expect(
  //       connect(freezerShards[0], deployer).revokeCashIn(TX_ID1)
  //     ).to.be.revertedWithCustomError(freezerShards[0], REVERT_ERROR_IF_UNAUTHORIZED);
  //   });
  //
  //   it("The 'registerCashOut()' function is reverted if it is called not by the owner or admin", async () => {
  //     const { freezerShards } = await setUpFixture(deployAndConfigureContracts);
  //     await expect(
  //       connect(freezerShards[0], deployer).registerCashOut(
  //         user.address, // account
  //         1, // amount
  //         TX_ID1
  //       )
  //     ).to.be.revertedWithCustomError(freezerShards[0], REVERT_ERROR_IF_UNAUTHORIZED);
  //   });
  //
  //   it("The 'registerInternalCashOut()' function is reverted if it is called not by the owner or admin", async () => {
  //     const { freezerShards } = await setUpFixture(deployAndConfigureContracts);
  //     await expect(
  //       connect(freezerShards[0], deployer).registerInternalCashOut(
  //         user.address, // account
  //         1, // amount
  //         TX_ID1
  //       )
  //     ).to.be.revertedWithCustomError(freezerShards[0], REVERT_ERROR_IF_UNAUTHORIZED);
  //   });
  //
  //   it("The 'processCashOut()' function is reverted if it is called not by the owner", async () => {
  //     const { freezerShards } = await setUpFixture(deployAndConfigureContracts);
  //     await expect(
  //       connect(freezerShards[0], deployer).processCashOut(
  //         TX_ID1,
  //         CashOutStatus.Confirmed
  //       )
  //     ).to.be.revertedWithCustomError(freezerShards[0], REVERT_ERROR_IF_UNAUTHORIZED);
  //   });
  //
  //   it("The 'setCashOutFlags()' function is reverted if it is called not by the owner", async () => {
  //     const { freezerShards } = await setUpFixture(deployAndConfigureContracts);
  //     await expect(
  //       connect(freezerShards[0], deployer).setCashOutFlags(
  //         TX_ID1,
  //         0 // flags
  //       )
  //     ).to.be.revertedWithCustomError(freezerShards[0], REVERT_ERROR_IF_UNAUTHORIZED);
  //   });
  // });
});
