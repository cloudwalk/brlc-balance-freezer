import { ethers, upgrades } from "hardhat";

async function main() {
  const CONTRACT_NAME: string = "BalanceFreezer"; // TBD: Enter contract name
  const TOKEN_ADDRESS: string = "0xA9a55a81a4C085EC0C31585Aed4cFB09D78dfD53"; // TBD: Enter token contract address

  const factory = await ethers.getContractFactory(CONTRACT_NAME);
  const proxy = await upgrades.deployProxy(
    factory,
    [TOKEN_ADDRESS],
    { kind: "uups" }
  );

  await proxy.waitForDeployment();

  console.log("Root proxy deployed to:", proxy.target);
}

main().then().catch(err => {
  throw err;
});
