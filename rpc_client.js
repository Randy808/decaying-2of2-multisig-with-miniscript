let { JSONRPCClient } = require("json-rpc-2.0");
let fetch = require("node-fetch-commonjs");
const { BITCOIND_PORT, RPC_CREDS } = process.env;

function createRpcClient(path) {
  const client = new JSONRPCClient((jsonRPCRequest) =>
    fetch(`http://localhost:${BITCOIND_PORT}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Basic ${btoa(RPC_CREDS)}`,
      },
      body: JSON.stringify(jsonRPCRequest),
    }).then(async (response) => {
      if (response.status === 200) {
        // Use client.receive when you received a JSON-RPC response.
        return response
          .json()
          .then((jsonRPCResponse) => client.receive(jsonRPCResponse));
      } else if (jsonRPCRequest.id !== undefined) {
        let error;
        try {
          let responseJson = await response.json();
          error = JSON.stringify(responseJson.error);
        } catch (e) {
          error = response.statusText;
        }
        return Promise.reject(new Error(error));
      }
    })
  );

  return client;
}

module.exports = {
  createRpcClient,
};
