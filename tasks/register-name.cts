// tasks/register-name.js
import { task, types } from 'hardhat/config';
import { namehash, normalize } from 'viem/ens';
import dotenv from 'dotenv';
import { encodeFunctionData, Hex, parseEventLogs } from 'viem';

task('register-name', 'Registers an ENS name on Beam testnet')
  .addPositionalParam('name', 'The ENS label to register (e.g., alice for alice.beam)')
  .addOptionalParam('duration', 'Registration duration in seconds', '31536000', types.string)
  .addOptionalParam('secret', 'Commitment secret', 'secret', types.string)
  .setAction(async ({ name, duration, secret }, hre) => {
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
    duration = BigInt(60 * 60 * 24 * 365);

    console.log("NAME HASH", namehash('beam'));
    console.log({
      registryAddress,
      registrarAddress,
      controllerAddress,
      wrapperAddress,
      resolverAddress,
      priceOracleAddress,
      owner,
      name,
      duration,
      secret,
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
    const nameNode = namehash(name);
    const durationBigInt = BigInt(duration);
    const secretHex: `0x${string}` = '0x' + Buffer.from("Secret2").toString('hex').padEnd(64, '0');

    // Step 1: Check availability
    const available = await Controller.read.available([name]);
    console.log(`Is ${domain} available? ${available}`);
    if (!available) throw new Error(`${domain} is not available`);

    // Step 2: Get registration price
    const price = await PriceOracle.read.price([name, 0n, durationBigInt]);
    console.log(`Registration price for ${domain}: ${price.base} wei (base), ${price.premium} wei (premium)`);
    const totalPrice = price.base + (price.premium || 0n);
    console.log(`Total price: ${totalPrice} wei`);


    const abiEncodedSetAddr = encodeFunctionData({
      abi: Resolver.abi,
      functionName: 'setAddr',
      args: [node, owner]
    })

    const abiEncodedSetName = encodeFunctionData({
      abi: Resolver.abi,
      functionName: 'setName',
      args: [node, name]
    })

    const callData = [abiEncodedSetAddr, abiEncodedSetName]


    const commitmentHash = await Controller.read.makeCommitment([
      name,
      owner,
      durationBigInt,
      secretHex,
      Resolver.address,
      callData,
      true,
      0,
    ]);

    await Controller.write.commit([commitmentHash], {
      account: deployer.account,
    });

    // const minCommitmentAge = await Controller.read.minCommitmentAge();
    // const maxCommitmentAge = await Controller.read.maxCommitmentAge();

    console.log(`Waiting 5 minutes till minCommitmentAge is ok...`);
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));


    const registerTX = await Controller.write.register([
      name,
      owner,
      durationBigInt,
      secretHex,
      Resolver.address,
      callData,
      true,
      0
    ], {
      value: totalPrice,
      account: deployer.account,
      gas: 25000000n
    });

    console.log("registerTX", registerTX);

    // Step 3: Verify registration
    console.log(`\nVerifying registration for ${domain}...`);

    // Check ownership in ENS Registry (should be NameWrapper)
    const registeredOwner = await EnsRegistry.read.owner([node]);
    console.log(`Owner of ${domain} in ENSRegistry: ${registeredOwner}`);
    if (registeredOwner.toLowerCase() !== NameWrapper.address.toLowerCase()) {
      throw new Error(`Registry ownership verification failed: expected ${NameWrapper.address}, got ${registeredOwner}`);
    } else {
      console.log(`Registry ownership verified: ${domain} is owned by NameWrapper (${NameWrapper.address})`);
    } try {
      //   console.log(ensResolver)
      const addr = await Resolver.read.addr([node])
      console.log(`the addr is: ${addr}`);
    } catch (error) {
      console.log(error);

    }



    console.log(`Registration and verification completed successfully for ${domain}!`);
  });