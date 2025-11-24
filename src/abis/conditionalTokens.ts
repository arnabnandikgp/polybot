// Minimal ABI for ConditionalTokens (CTF) contract
// Address: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
const conditionalTokensAbi = [
  {
    name: "redeemPositions",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "collateralToken",
        type: "address",
      },
      {
        name: "parentCollectionId",
        type: "bytes32",
      },
      {
        name: "conditionId",
        type: "bytes32",
      },
      {
        name: "indexSets",
        type: "uint256[]",
      },
    ],
    outputs: [],
  },
] as const;

export { conditionalTokensAbi };

