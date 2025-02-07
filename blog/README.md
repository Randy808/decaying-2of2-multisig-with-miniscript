# How to Make a Decaying 2-of-2 Multisig with Miniscript and Bitcoin Core

## Introduction

While talking to some friends about custody schemes, our conversation turned to the topic of Miniscript and its ability to enable more powerful Bitcoin scripts for locking funds. Not only that, we can do so in a way that can be statically analyzed! This means we can make assertions about the scripts we use, such as whether a transaction containing the input will be vulnerable to tampering when broadcast. In some cases, it can even detect whether a transaction is unspendable, which causes most Miniscript libraries to throw an error after printing that the script “is not sane.”

Then, when I hear the usual question, “Why isn’t everyone using this?”—often directed at the average Bitcoin developer working on the 137th wallet—I find myself wondering the same thing. Finally, that led us to this blog post, where I aim to be the change I want to see in the world.

Towards that goal, I will show you how to set up a decaying 2-of-2 wallet with Bitcoin Core. I won’t dive too deep into the details of Miniscript, but I’ll cover as much as is needed.

I will run `bitcoind` configured to use `regtest` and a clean wallet named `decaying-multisig`. To contextualize all my Bitcoin commands with this wallet, I’ll alias `bitcoin-cli` to the following (from within my Docker container):

```bash
alias bitcoin-cli="/app/bitcoin-28.1/bin/bitcoin-cli -regtest -rpcwallet=decaying-multisig"
```

---

## Creating Our Descriptor

The first step to making a decaying 2-of-2 wallet is defining what kind of script we want to use. This information is needed to construct the descriptor that will house our Miniscript expression. I’ll use a SegWit script denoted by the descriptor prefix `wsh`.

The second step involves picking the expression that will be used. Pieter Wuille has a website where he describes what the Miniscript project is and provides tools for developers [to experiment with](https://bitcoin.sipa.be/miniscript/). Under the section **“Policy To Miniscript compiler”**, there are examples. Click on **“A 3-of-3 that turns into a 2-of-3 after 90 days”**, and you should see a section pop up that says **“miniscript output.”** Underneath this heading, you should see the following expression:

```
thresh(3,pk(key_1),s:pk(key_2),s:pk(key_3),sln:older(12960))
```

We will utilize this template to create a 2-of-2 by replacing the `3` in the first argument and removing `s:pk(key_3)`.

Finally, we need to decide what the “decay” will be. I’m going to pick a relative timelock of *2 blocks*, so our final expression looks like this:

```
wsh(thresh(2,pk(key_1),s:pk(key_2),sln:older(2)))
```

The keys can be any key descriptors you’d like. I’ll use the following values for `key_1` and `key_2`:

```
key_1=tprv8ZgxMBicQKsPdzuc344mDaeUk5zseMcRK9Hst8xodskNu3YbQG5NxLa2X17PUU5yXQhptiBE7F5W5cgEmsfQg4Y21Y18w4DJhLxSb8CurDf/84h/1h/0h/0/*
key_2=tpubD6NzVbkrYhZ4YiCvExLvH4yh1k3jFGf5irm6TsrArY8GYdEhYVdztQTBtTirmRc6XfSJpH9tayUdnngaJZKDaa2zbqEY29DfcGZW8iRVGUY
```

`key_1` is an extended private key that our wallet can use to sign transactions with this descriptor, and `key_2` is an extended public key, which we can’t generate signatures for.

---

## Importing Our Descriptor

Before we import our descriptor, we need to calculate a checksum. We can do this using `getdescriptorinfo` followed by a string of our descriptor. It’s very important that you **don’t use spaces** in your descriptor. If you do, the descriptor will not be parsed correctly. The command should look like this:

```bash
bitcoin-cli getdescriptorinfo "wsh(thresh(2,pk(tprv8ZgxMBicQKsPdzuc344mDaeUk5zseMcRK9Hst8xodskNu3YbQG5NxLa2X17PUU5yXQhptiBE7F5W5cgEmsfQg4Y21Y18w4DJhLxSb8CurDf),s:pk(tpubD6NzVbkrYhZ4YiCvExLvH4yh1k3jFGf5irm6TsrArY8GYdEhYVdztQTBtTirmRc6XfSJpH9tayUdnngaJZKDaa2zbqEY29DfcGZW8iRVGUY),sln:older(2)))"
```

The response should look like this:

```json
{
  "descriptor": "wsh(thresh(2,pk(tpubD6NzVbkrYhZ4XTwPvhjMczJbK7WoogoKtStfAf1749YmjXoN2ety8qBthASmkUTMukZhJbipk2XLdP6HGuF7Q9WWE5nG7UG9Zd7ZGkmeMg2),s:pk(tpubD6NzVbkrYhZ4YiCvExLvH4yh1k3jFGf5irm6TsrArY8GYdEhYVdztQTBtTirmRc6XfSJpH9tayUdnngaJZKDaa2zbqEY29DfcGZW8iRVGUY),sln:older(2)))#yx7ftr3e",
  "checksum": "jgkkfj86",
  "isrange": false,
  "issolvable": true,
  "hasprivatekeys": true
}
```

Notice that the value for `descriptor` is **not** the one we passed in. It has converted our extended private key into an extended public key. The value after the `#` is the checksum displayed in the descriptor string, but the one we actually need is listed separately in the `"checksum"` field, namely `jgkkfj86`.

To import our descriptor containing our private key, we’ll use the command `importdescriptors` followed by an array containing a single object. This object has two required properties: `desc` and `timestamp`. The `desc` property will contain our descriptor (suffixed with `#jgkkfj86`), and the `timestamp` will be `"now"`. The timestamp indicates the block height from which to start rescanning the chain for funds. The final command should look like this:

```bash
bitcoin-cli importdescriptors '[{"desc": "wsh(thresh(2,pk(tprv8ZgxMBicQKsPdzuc344mDaeUk5zseMcRK9Hst8xodskNu3YbQG5NxLa2X17PUU5yXQhptiBE7F5W5cgEmsfQg4Y21Y18w4DJhLxSb8CurDf),s:pk(tpubD6NzVbkrYhZ4YiCvExLvH4yh1k3jFGf5irm6TsrArY8GYdEhYVdztQTBtTirmRc6XfSJpH9tayUdnngaJZKDaa2zbqEY29DfcGZW8iRVGUY),sln:older(2)))#jgkkfj86", "timestamp": "now"}]'
```

The response should be:

```json
[
  {
    "success": true,
    "warnings": [
      "Not all private keys provided. Some wallet functionality may return unexpected errors"
    ]
  }
]
```

With this, our descriptor has been successfully imported!

---

## Deriving an Address

To derive an address, we can use the command `deriveaddresses` followed by the descriptor we just imported:

```bash
bitcoin-cli deriveaddresses "wsh(thresh(2,pk(tprv8ZgxMBicQKsPdzuc344mDaeUk5zseMcRK9Hst8xodskNu3YbQG5NxLa2X17PUU5yXQhptiBE7F5W5cgEmsfQg4Y21Y18w4DJhLxSb8CurDf),s:pk(tpubD6NzVbkrYhZ4YiCvExLvH4yh1k3jFGf5irm6TsrArY8GYdEhYVdztQTBtTirmRc6XfSJpH9tayUdnngaJZKDaa2zbqEY29DfcGZW8iRVGUY),sln:older(2)))#jgkkfj86"
```

The response should be:

```json
[
  "bcrt1qz8rtjmgv9vkfk6uaajxh4snsha25wyggk66h8h86gyph48yx7zmq2tytly"
]
```

---

## Sending Money to the 2-of-2 Address

This part can be done by switching to another wallet. I always have a default wallet that I generate the first 101 blocks to, so I’ll use that:

```bash
/app/bitcoin-28.1/bin/bitcoin-cli -regtest -rpcwallet="" sendtoaddress bcrt1qz8rtjmgv9vkfk6uaajxh4snsha25wyggk66h8h86gyph48yx7zmq2tytly 1
```

---

## Spending from the 2-of-2 After 2 Blocks

Although I do have the private key for `key_2` [1], I’d like to spend from this descriptor without it. We can do this by forcing the production of two blocks to satisfy the `older(2)` clause (the default wallet is used here so we can maintain one UTXO in our decaying 2-of-2):

```bash
/app/bitcoin-28.1/bin/bitcoin-cli -regtest -rpcwallet="" -generate 2
```

Now our funds are confirmed, and we’re ready to construct our spending transaction. We’ll do this manually because of current limitations in Bitcoin Core.

First, let’s identify the funds available to us:

```bash
bitcoin-cli listunspent
```

This should result in a list of our UTXOs for our descriptor:

```json
[
  {
    "txid": "718bfccb1e263e09d5bc53756ff555d931efb54fb279d74402f2a96e3a3ea7e8",
    "vout": 1,
    "address": "bcrt1qz8rtjmgv9vkfk6uaajxh4snsha25wyggk66h8h86gyph48yx7zmq2tytly",
    "label": "",
    "witnessScript": "21038d5924643acd9682da30726d786c3feb9de48ef6fd8d7ff2c96dcf209d98e8a9ac7c21026e620298d77036d7fc9301b49f810732f62e85520d6fefbc55a1aeef54334b35ac937c63006752b29268935287",
    "scriptPubKey": "002011c6b96d0c2b2c9b6b9dec8d7ac270bf55471108b6b573dcfa41037a9c86f0b6",
    "amount": 1.00000000,
    "confirmations": 2,
    "spendable": true,
    "solvable": true,
    "desc": "wsh(thresh(2,pk([d446a94d]038d5924643acd9682da30726d786c3feb9de48ef6fd8d7ff2c96dcf209d98e8a9),s:pk([aabc1516]026e620298d77036d7fc9301b49f810732f62e85520d6fefbc55a1aeef54334b35),sln:older(2)))#he52c7ua",
    "parent_descs": [
      "wsh(thresh(2,pk(tpubD6NzVbkrYhZ4XTwPvhjMczJbK7WoogoKtStfAf1749YmjXoN2ety8qBthASmkUTMukZhJbipk2XLdP6HGuF7Q9WWE5nG7UG9Zd7ZGkmeMg2),s:pk(tpubD6NzVbkrYhZ4YiCvExLvH4yh1k3jFGf5irm6TsrArY8GYdEhYVdztQTBtTirmRc6XfSJpH9tayUdnngaJZKDaa2zbqEY29DfcGZW8iRVGUY),sln:older(2)))#yx7ftr3e"
    ],
    "safe": true
  }
]
```

To spend this UTXO, we can construct a transaction using `createrawtransaction` (the output address used below was generated from my default `regtest` wallet):

```bash
bitcoin-cli createrawtransaction "[{\"txid\":\"718bfccb1e263e09d5bc53756ff555d931efb54fb279d74402f2a96e3a3ea7e8\",\"vout\":1,\"sequence\":2}]" "[{\"bcrt1qwl9u38l365rwudzs96h0z5vkamrdagc3ty3s68vwrhnggetzyvlscc6umf\":0.99999000}]"
```

Note that the sequence number used is **2**, which is required so that Bitcoin Core recognizes the descriptor as satisfied.

The result of this is:

```
0200000001e8a73e3a6ea9f20244d779b24fb5ef31d955f56f7553bcd5093e261ecbfc8b710100000000020000000118ddf5050000000022002077cbc89ff1d506ee34502eaef15196eec6dea31159230d1d8e1de6846562233f00000000
```

Next, we need to sign our transaction:

```bash
bitcoin-cli signrawtransactionwithwallet 0200000001e8a73e3a6ea9f20244d779b24fb5ef31d955f56f7553bcd5093e261ecbfc8b710100000000020000000118ddf5050000000022002077cbc89ff1d506ee34502eaef15196eec6dea31159230d1d8e1de6846562233f00000000
```

The response should look like this:

```json
{
  "hex": "02000000000101e8a73e3a6ea9f20244d779b24fb5ef31d955f56f7553bcd5093e261ecbfc8b710100000000020000000118ddf5050000000022002077cbc89ff1d506ee34502eaef15196eec6dea31159230d1d8e1de6846562233f04000047304402204f1e4f4465d5db0cd871f8ed0f4ca966eb49ce003402048a09af8d87f3c9b7a1022036d7e9eb519e4c7d94a3b31f2d104727bc37edc443ff9a89c8519426c6a3e90a015321038d5924643acd9682da30726d786c3feb9de48ef6fd8d7ff2c96dcf209d98e8a9ac7c21026e620298d77036d7fc9301b49f810732f62e85520d6fefbc55a1aeef54334b35ac937c63006752b2926893528700000000",
  "complete": true
}
```

Finally, we can broadcast our signed transaction:

```bash
bitcoin-cli sendrawtransaction 02000000000101e8a73e3a6ea9f20244d779b24fb5ef31d955f56f7553bcd5093e261ecbfc8b710100000000020000000118ddf5050000000022002077cbc89ff1d506ee34502eaef15196eec6dea31159230d1d8e1de6846562233f04000047304402204f1e4f4465d5db0cd871f8ed0f4ca966eb49ce003402048a09af8d87f3c9b7a1022036d7e9eb519e4c7d94a3b31f2d104727bc37edc443ff9a89c8519426c6a3e90a015321038d5924643acd9682da30726d786c3feb9de48ef6fd8d7ff2c96dcf209d98e8a9ac7c21026e620298d77036d7fc9301b49f810732f62e85520d6fefbc55a1aeef54334b35ac937c63006752b2926893528700000000
```

You should see a transaction ID similar to:

```
1de05f97187360d1b8eb9e5cd481f805649420c5c687f8811060e35774e06edd
```

This marks the completion of our experiment, as we have successfully broadcast a transaction spending from our decaying 2-of-2 multisig output with only one signature!

[1] It’s `vprv9DMUxX4ShgxMMqZN22FaHqWanepgyBTAynCkk9beCH5dpLcPRR9Xx39bkjsVBc56KyALSq3Q2VYh5rfoAv7pfDnA5US34p5aYX7fDRM1NS5`