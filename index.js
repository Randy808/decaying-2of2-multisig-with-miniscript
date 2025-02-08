const { createRpcClient } = require("./rpc_client");
const winston = require("winston");
const fs = require("node:fs/promises");

let logger = winston.createLogger();

if (process.env.NODE_ENV === "development") {
  logger = winston.createLogger({
    level: "debug",
  });

  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

const { WALLET_NAME, NETWORK } = process.env;
const DESCRIPTOR_FILE_NAME = `${WALLET_NAME}_descriptor.dat`;
const client = createRpcClient(`/wallet/${WALLET_NAME}`);

async function createWalletIfNotExists(rpcClient, walletName) {
  let newWallet = true;

  try {
    await rpcClient.request("createwallet", { wallet_name: walletName });
  } catch (e) {
    if (!e.message.includes("Database already exists")) {
      throw e;
    }
    logger.debug(`Wallet '${walletName}' already exists.`);
    newWallet = false;
  }

  try {
    let loadedWallets = await rpcClient.request("listwallets");
    if (!loadedWallets.includes(walletName)) {
      await rpcClient.request("loadwallet", { filename: walletName });
    }
  } catch (e) {
    if (!e.message.includes("is already loaded.")) {
      console.log(`An error occurred while loading wallet ${walletName}`);
      throw e;
    }
    logger.debug(`Wallet '${walletName}' already loaded.`);
  }

  return newWallet;
}

const DEFAULT_WALLET = "";
const defaultWalletClient = createRpcClient(`/wallet/${DEFAULT_WALLET}`);

const initializeDefaultWallet = async (rpcClient) => {
  await createWalletIfNotExists(rpcClient, DEFAULT_WALLET);

  let blockCount = await defaultWalletClient.request("getblockcount");

  if (NETWORK == "regtest" && blockCount < 100) {
    // Fund the default wallet with block subsidies
    logger.debug("Generating blocks and funding default wallet...");
    let address = await defaultWalletClient.request("getnewaddress");
    await defaultWalletClient.request("generatetoaddress", {
      nblocks: 101,
      address,
    });
  }
};

async function listDescriptors(private = false) {
  try {
    return await client.request("listdescriptors", {
      private,
    });
  } catch (e) {
    /*
      If the error contains this message it's because we already have a descriptor loaded 
      that can't be shown for some reason. I think it might be a bug considering both the
      fact that we have at least one owned private key in all our descriptors and the fact
      it doesn't at least show the private keys of the standard descriptors that were shown
      previously.
    */
    if (e.message.includes("Can't get descriptor string")) {
      let newMessage = `An error has occurred: ${e.message}\n`;
      newMessage += `This message may be a result of a miniscript descriptor with private keys being imported in the past.`;
      newMessage += `The opaque error message is a usability issue in Bitcoin Core as of version 28.1.`;
      e.message = newMessage;
    }

    throw e;
  }
}

async function getPrivateKeyDescriptor() {
  let listDescriptorsResponse = await listDescriptors(true);

  let { descriptors } = listDescriptorsResponse;
  for (let d of descriptors) {
    let { desc } = d;
    if (desc.startsWith("wpkh(") && !desc.internal) {
      let startIndex = "wpkh(".length;
      let endIndex = desc.indexOf("#") - 1;
      keyDescriptor = desc.substring(startIndex, endIndex);
      return keyDescriptor;
    }
  }
}

function get2of2DecayingMiniscriptTemplate(
  ownedPrivateKey,
  unownedPublicKey,
  blockDelay
) {
  return `wsh(thresh(2,pk(${ownedPrivateKey}),s:pk(${unownedPublicKey}),sln:older(${blockDelay})))`;
}

async function getDescriptorChecksum(descriptor) {
  console.log(descriptor);
  let descriptorInfo = await client.request("getdescriptorinfo", {
    descriptor,
  });

  return descriptorInfo.checksum;
}

async function importDescriptor(descriptor) {
  return client.request("importdescriptors", {
    requests: [
      {
        desc: descriptor,
        timestamp: "now",
      },
    ],
  });
}

async function getDecaying2of2Descriptor(publicKey2) {
  try {
    return await fs.readFile(DESCRIPTOR_FILE_NAME, { encoding: "utf8" });
  } catch (e) {
    console.log(
      `Unable to read descriptor from '${DESCRIPTOR_FILE_NAME}', attempting to generate a new one...`
    );
  }

  let descriptor;

  let privateKeyDescriptor = await getPrivateKeyDescriptor();

  descriptor = get2of2DecayingMiniscriptTemplate(
    privateKeyDescriptor,
    publicKey2,
    2
  );
  let checksum = await getDescriptorChecksum(descriptor);
  descriptor = `${descriptor}#${checksum}`;
  await importDescriptor(descriptor);
  await fs.writeFile(DESCRIPTOR_FILE_NAME, descriptor, { flag: "w" });
  return descriptor;
}

async function initializeDecaying2of2Wallet(rpcClient) {
  await createWalletIfNotExists(rpcClient, WALLET_NAME);

  // This will make sure we have some keys accessible
  // when calling 'listdescriptors'
  await client.request("getnewaddress");
}

void (async function main() {
  const rpcClient = createRpcClient("");
  await initializeDefaultWallet(rpcClient);
  await initializeDecaying2of2Wallet(rpcClient);
  let publicKey =
    "tpubD6NzVbkrYhZ4XcSpKRM8Mj6hFSD1WyAQ2DCqETVcwe3PCPoyQreQMg4LZwe8AZsytsGphvrRtwxFv7ij5LjQctZuWDLwzp3dhf2mCxzTK4Y";
  let descriptor = await getDecaying2of2Descriptor(publicKey);
  let decaying2of2Address = await client.request("deriveaddresses", {
    descriptor,
    range: [1, 1],
  });

  console.log(decaying2of2Address);

  await defaultWalletClient.request("sendtoaddress", {
    address: decaying2of2Address[0],
    amount: 0.00001,
  });

  let defaultWalletAddress = await defaultWalletClient.request("getnewaddress");

  await defaultWalletClient.request("generatetoaddress", {
    nblocks: 2,
    address: defaultWalletAddress,
  });

  let decaying2of2Balance = await client.request("getbalance");
  console.log(`Balance: ${decaying2of2Balance}`);

  let unspent = await client.request("listunspent");
  let multisigUtxo = unspent[0];

  let newDefaultWalletAddress = await defaultWalletClient.request(
    "getnewaddress"
  );

  let rawTransactionHex = await client.request("createrawtransaction", {
    inputs: [
      {
        txid: multisigUtxo.txid,
        vout: multisigUtxo.vout,
        sequence: 2,
      },
    ],
    outputs: [
      {
        // Called with toFixed to avoid JS precision issues
        [newDefaultWalletAddress]: (0.00001 - 0.000002).toFixed(6),
      },
    ],
  });

  let signedTransactionResponse = await client.request(
    "signrawtransactionwithwallet",
    {
      hexstring: rawTransactionHex,
    }
  );

  let signedTransactionHex = signedTransactionResponse.hex;

  let txid = await client.request("sendrawtransaction", {
    hexstring: signedTransactionHex,
  });

  console.log(`Success: ${txid}`);
})();
