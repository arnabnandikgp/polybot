// Minimal ABI for UMA CTF Adapter contract
// Address: 0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296
const umaCtfAdapterAbi = [
  {
    name: "resolve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "questionID",
        type: "bytes32",
      },
    ],
    outputs: [],
  },
] as const;

export { umaCtfAdapterAbi };

