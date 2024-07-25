const express = require('express');
const cors = require('cors');
const { mnemonicGenerate, cryptoWaitReady } = require('@polkadot/util-crypto');
const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');

const app = express();
const PORT = 3000;

app.use(cors());

app.get('/generate-address', async (req, res) => {
  try {
    console.log('Connecting to the WebSocket endpoint...');
    
    // Step 1: Connect to the node
    const provider = new WsProvider('wss://testnet.dubaicustoms.network'); // Replace with your WebSocket endpoint
    const api = await ApiPromise.create({ provider });

    await api.isReady;
    console.log('Connected to the node');

    // Step 2: Ensure crypto is ready
    await cryptoWaitReady();

    // Step 3: Generate new mnemonic and keypair
    const mnemonic = mnemonicGenerate();
    console.log(`Generated mnemonic: ${mnemonic}`);
    const keyring = new Keyring({ type: 'sr25519' });
    const newPair = keyring.addFromUri(mnemonic);
    console.log(`New pair address: ${newPair.address}`);

    // Step 4: Use Alice's account to fund the new account
    const alice = keyring.addFromUri('//Alice');
    console.log(`Alice's address: ${alice.address}`);

    // Step 5: Check Alice's balance for debug purposes
    const aliceBalance = await api.query.system.account(alice.address);
    console.log(`Alice's balance: ${aliceBalance.data.free}`);

    // Step 6: Transfer funds from Alice to the new account
    const transfer = api.tx.balances.transfer(newPair.address, 1000000000000); // Adjust the amount as needed
    console.log(`Transfer details: from Alice to ${newPair.address}`);

    // Step 7: Sign and send the transaction
    await transfer.signAndSend(alice, ({ status, events, dispatchError }) => {
      if (status.isInBlock) {
        console.log(`Transfer included at blockHash ${status.asInBlock}`);
        res.json({
          mnemonic,
          address: newPair.address,
          status: 'success',
          blockHash: status.asInBlock.toString()
        });
      } else if (status.isFinalized) {
        console.log(`Finalized at blockHash ${status.asFinalized.toString()}`);
      } else if (dispatchError) {
        console.error('DispatchError:', dispatchError);
        let errorInfo = 'Unknown error';

        // Extract specific error information if available
        if (dispatchError.isModule) {
          const decoded = api.registry.findMetaError(dispatchError.asModule);
          const { docs, name, section } = decoded;
          errorInfo = `${section}.${name}: ${docs.join(' ')}`;
        } else {
          errorInfo = dispatchError.toString();
        }
        
        res.status(500).json({ error: 'Failed to transfer funds', details: errorInfo });
      }

      // Log additional events for debugging
      events.forEach(({ phase, event: { data, method, section } }) => {
        console.log(`\t${phase}: ${section}.${method}:: ${data}`);
      });
    });
  } catch (error) {
    console.error('Error generating or funding address:', error);
    res.status(500).json({ error: 'Failed to generate and fund address', details: error.toString() });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
