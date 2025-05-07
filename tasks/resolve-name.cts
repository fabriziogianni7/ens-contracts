// tasks/register-name.js
import { task, types } from 'hardhat/config';
import { namehash, normalize } from 'viem/ens';
import dotenv from 'dotenv';
import { encodeFunctionData, Hex, parseEventLogs } from 'viem';

task('resolve-name', 'Resolves an ENS name on Beam testnet')
  .addPositionalParam('name', 'The ENS label (e.g., alice for alice.beam) needed to calcolate the node')
  .setAction(async ({ name }, hre) => {
    // Load .env
    const { parsed: parsedFile, error } = dotenv.config({ path: './.env', encoding: 'utf8' });
    if (error) throw error;
    if (!parsedFile) throw new Error('Failed to parse .env');

    const [deployer] = await hre.viem.getWalletClients();
    const owner = deployer.account.address;

    // Load contract addresses from .env
    const {
      REGISTRY_ADDRESS: registryAddress,
      REGISTRAR_ADDRESS: registrarAddress,
      CONTROLLER_ADDRESS: controllerAddress,
      WRAPPER_ADDRESS: wrapperAddress,
      RESOLVER_ADDRESS: resolverAddress,
      PRICE_ORACLE_ADDRESS: priceOracleAddress,
    } = parsedFile;
    if (
      !(
        registryAddress &&
        registrarAddress &&
        controllerAddress &&
        wrapperAddress &&
        resolverAddress &&
        priceOracleAddress
      )
    ) {
      throw new Error('Set all addresses in .env');
    }

    const publicClient = await hre.viem.getPublicClient();
    console.log(
      'Account balance:',
      (await publicClient.getBalance({ address: owner })).toString(),
    );

    console.log("NAME HASH", namehash('beam'));
    console.log("BEAM TLD HASH", namehash('beam'));
    console.log({
      registryAddress,
      registrarAddress,
      controllerAddress,
      wrapperAddress,
      resolverAddress,
      priceOracleAddress,
      owner,
      name,
    });

    // Connect to contracts
    const EnsRegistry = await hre.viem.getContractAt('ENSRegistry', registryAddress as `0x${string}`);
    const BaseRegistrar = await hre.viem.getContractAt('BaseRegistrarImplementation', registrarAddress as `0x${string}`);
    const Controller = await hre.viem.getContractAt('ETHRegistrarController', controllerAddress as `0x${string}`);
    const NameWrapper = await hre.viem.getContractAt('NameWrapper', wrapperAddress as `0x${string}`);
    const Resolver = await hre.viem.getContractAt('PublicResolver', resolverAddress as `0x${string}`);
    const PriceOracle = await hre.viem.getContractAt('ExponentialPremiumPriceOracle', priceOracleAddress as `0x${string}`);

    const domain = `${name}.beam`;
    const node = namehash(domain);

    // Step 3: Verify registration
    console.log(`\nVerifying registration for ${domain}...`);

    // Check ownership in ENS Registry (should be NameWrapper)
    const registeredOwner = await EnsRegistry.read.owner([node]);
    console.log(`Owner of ${domain} in ENSRegistry: ${registeredOwner}`);

    if (registeredOwner.toLowerCase() !== NameWrapper.address.toLowerCase()) {
      throw new Error(`Registry ownership verification failed: expected ${NameWrapper.address}, got ${registeredOwner}`);
    } else {
      console.log(`Registry ownership verified: ${domain} is owned by NameWrapper (${NameWrapper.address})`);
    }

    try {
      const addr = await Resolver.read.addr([node])
      const resolvedName = await Resolver.read.name([node])
      console.log(`the addr is: ${addr}`);
      console.log(`the resolved name is: ${resolvedName}`);
    } catch (error) {
      console.log(error);

    }



    console.log(`Registration and verification completed successfully for ${domain}!`);
  });