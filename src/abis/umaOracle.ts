// Minimal ABI for UMA Oracle contract
// Address: 0xee3af10ebb505d975377d620ccfc098e9168858a
const umaOracleAbi = [
  {
    name: "getRequest",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "questionID",
        type: "bytes32",
      },
    ],
    outputs: [
      {
        name: "requestTimestamp",
        type: "uint256",
      },
      {
        name: "liveness",
        type: "uint256",
      },
      {
        name: "ancillaryData",
        type: "bytes",
      },
    ],
  },
] as const;

export { umaOracleAbi };

