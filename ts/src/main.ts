#!/usr/bin/env -S node --no-warnings
import { Crs, BarretenbergApiAsync, newBarretenbergApiAsync, RawBuffer } from './index.js';
import createDebug from 'debug';
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { numToUInt32BE } from './serialize/serialize.js';
import { Command } from 'commander';

createDebug.log = console.error.bind(console);
const debug = createDebug('bb.js');

// Maximum we support.
const MAX_CIRCUIT_SIZE = 2 ** 19;

function getBytecode(jsonPath: string) {
  const json = readFileSync(jsonPath, 'utf-8');
  const parsed = JSON.parse(json);
  const buffer = Buffer.from(parsed.bytecode, 'base64');
  const decompressed = gunzipSync(buffer);
  return decompressed;
}

function getWitness(witnessPath: string) {
  const data = readFileSync(witnessPath);
  return Buffer.concat([numToUInt32BE(data.length / 32), data]);
}

async function getCircuitSize(jsonPath: string, api: BarretenbergApiAsync) {
  const bytecode = getBytecode(jsonPath);
  const [exact, total, subgroup] = await api.acirGetCircuitSizes(new RawBuffer(bytecode));
  return { exact, total, subgroup };
}

async function init(jsonPath: string, sizeHint?: number) {
  const api = await newBarretenbergApiAsync();

  const subgroupSize = await (async () => {
    if (sizeHint) {
      // Round to subgroup size.
      return Math.pow(2, Math.ceil(Math.log2(sizeHint)));
    }

    // First compute circuit size.
    debug(`computing circuit size (use size hint to skip)...`);
    const circuitSizes = await getCircuitSize(jsonPath, api);
    debug(`circuit size: ${circuitSizes.total}`);

    if (circuitSizes.subgroup > MAX_CIRCUIT_SIZE) {
      throw new Error(`Circuit size of ${circuitSizes.subgroup} exceeds max supported of ${MAX_CIRCUIT_SIZE}`);
    }

    return circuitSizes.subgroup;
  })();

  debug(`subgroup size: ${subgroupSize}`);
  debug('loading crs...');
  // Plus 1 needed! (Move +1 into Crs?)
  const crs = await Crs.new(subgroupSize + 1);

  // Important to init slab allocator as first thing, to ensure maximum memory efficiency.
  await api.commonInitSlabAllocator(subgroupSize);

  // Load CRS into wasm global CRS state.
  // TODO: Make RawBuffer be default behaviour, and have a specific Vector type for when wanting length prefixed.
  await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));

  const acirComposer = await api.acirNewAcirComposer();
  return { api, acirComposer, circuitSize: subgroupSize };
}

async function initLite() {
  const api = await newBarretenbergApiAsync(1);

  // Plus 1 needed! (Move +1 into Crs?)
  const crs = await Crs.new(1);

  // Load CRS into wasm global CRS state.
  await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));

  const acirComposer = await api.acirNewAcirComposer();
  return { api, acirComposer };
}

export async function proveAndVerify(jsonPath: string, witnessPath: string, isRecursive: boolean, sizeHint?: number) {
  const { api, acirComposer } = await init(jsonPath, sizeHint);
  try {
    // debug('initing proving key...');
    const bytecode = getBytecode(jsonPath);
    // await api.acirInitProvingKey(acirComposer, new RawBuffer(bytecode), circuitSize);

    // const circuitSize = await api.acirGetExactCircuitSize(acirComposer);
    // debug(`circuit size: ${circuitSize}`);

    // debug('initing verification key...');
    // await api.acirInitVerificationKey(acirComposer);

    debug(`creating proof...`);
    const witness = getWitness(witnessPath);
    const proof = await api.acirCreateProof(acirComposer, new RawBuffer(bytecode), new RawBuffer(witness), isRecursive);

    debug(`verifying...`);
    const verified = await api.acirVerifyProof(acirComposer, proof, isRecursive);
    console.log(`verified: ${verified}`);
    return verified;
  } finally {
    await api.destroy();
  }
}

export async function prove(
  jsonPath: string,
  witnessPath: string,
  isRecursive: boolean,
  outputPath: string,
  sizeHint?: number,
) {
  const { api, acirComposer } = await init(jsonPath, sizeHint);
  try {
    // debug('initing proving key...');
    const bytecode = getBytecode(jsonPath);
    // await api.acirInitProvingKey(acirComposer, new RawBuffer(bytecode), circuitSize);

    // const circuitSize = await api.acirGetExactCircuitSize(acirComposer);
    // debug(`circuit size: ${circuitSize}`);

    debug(`creating proof...`);
    const witness = getWitness(witnessPath);
    const proof = await api.acirCreateProof(acirComposer, new RawBuffer(bytecode), new RawBuffer(witness), isRecursive);
    debug(`done.`);

    writeFileSync(outputPath, proof);
    console.log(`proof written to: ${outputPath}`);
  } finally {
    await api.destroy();
  }
}

export async function gateCount(jsonPath: string) {
  const api = await newBarretenbergApiAsync(1);
  try {
    const circuitSizes = await getCircuitSize(jsonPath, api);
    console.log(`${circuitSizes.exact}`);
  } finally {
    await api.destroy();
  }
}

export async function verify(jsonPath: string, proofPath: string, isRecursive: boolean, vkPath: string) {
  const { api, acirComposer } = await initLite();
  try {
    await api.acirLoadVerificationKey(acirComposer, new RawBuffer(readFileSync(vkPath)));
    const verified = await api.acirVerifyProof(acirComposer, readFileSync(proofPath), isRecursive);
    console.log(`verified: ${verified}`);
    return verified;
  } finally {
    await api.destroy();
  }
}

export async function contract(outputPath: string, vkPath: string) {
  const { api, acirComposer } = await initLite();
  try {
    await api.acirLoadVerificationKey(acirComposer, new RawBuffer(readFileSync(vkPath)));
    const contract = await api.acirGetSolidityVerifier(acirComposer);
    if (outputPath === '-') {
      console.log(contract);
    } else {
      writeFileSync(outputPath, contract);
      console.log(`contract written to: ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function writeVk(jsonPath: string, outputPath: string, sizeHint?: number) {
  const { api, acirComposer, circuitSize } = await init(jsonPath, sizeHint);
  try {
    debug('initing proving key...');
    const bytecode = getBytecode(jsonPath);
    await api.acirInitProvingKey(acirComposer, new RawBuffer(bytecode), circuitSize);

    debug('initing verification key...');
    const vk = await api.acirGetVerificationKey(acirComposer);
    if (outputPath === '-') {
      process.stdout.write(vk);
    } else {
      writeFileSync(outputPath, vk);
      console.log(`vk written to: ${outputPath}`);
    }
  } finally {
    await api.destroy();
  }
}

export async function proofAsFields(proofPath: string, numInnerPublicInputs: number, outputPath: string) {
  const { api, acirComposer } = await initLite();

  try {
    debug('serializing proof byte array into field elements');
    const proofAsFields = await api.acirSerializeProofIntoFields(
      acirComposer,
      readFileSync(proofPath),
      numInnerPublicInputs,
    );

    writeFileSync(outputPath, JSON.stringify(proofAsFields.map(f => f.toString())));
    debug('done.');
  } finally {
    await api.destroy();
  }
}

export async function vkAsFields(vkPath: string, vkeyOutputPath: string) {
  const { api, acirComposer } = await initLite();

  try {
    debug('serializing vk byte array into field elements');
    await api.acirLoadVerificationKey(acirComposer, new RawBuffer(readFileSync(vkPath)));
    const [vkAsFields, vkHash] = await api.acirSerializeVerificationKeyIntoFields(acirComposer);
    const output = [vkHash, ...vkAsFields].map(f => f.toString());
    writeFileSync(vkeyOutputPath, JSON.stringify(output));
    debug('done.');
  } finally {
    await api.destroy();
  }
}

// nargo use bb.js: backend -> bb.js
// backend prove --data-dir data --witness /foo/bar/witness.tr --json /foo/bar/main.json
// backend verify ...
// backend get_total_num_gates --data-dir data --json /foo/bar/main.json
// backend get_sol_contract --data-dir data --json /foo/bar/main.json --output
// backend get_features
// OPTIONAL stateful backend:
// backend start
// backend stop

const program = new Command();

program.option('-v, --verbose', 'enable verbose logging', false);

function handleGlobalOptions() {
  if (program.opts().verbose) {
    createDebug.enable('bb.js*');
  }
}

program
  .command('prove_and_verify')
  .description('Generate a proof and verify it. Process exits with success or failure code.')
  .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.tr')
  .option('-r, --recursive', 'prove and verify using recursive prover and verifier', false)
  .option('-s, --size-hint <gates>', 'provide a circuit size hint to skip calculation phase')
  .action(async ({ jsonPath, witnessPath, recursive, sizeHint }) => {
    handleGlobalOptions();
    const result = await proveAndVerify(jsonPath, witnessPath, recursive, sizeHint);
    process.exit(result ? 0 : 1);
  });

program
  .command('prove')
  .description('Generate a proof and write it to a file.')
  .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
  .option('-w, --witness-path <path>', 'Specify the witness path', './target/witness.tr')
  .option('-r, --recursive', 'prove using recursive prover', false)
  .option('-o, --output-path <path>', 'Specify the proof output path', './proofs/proof')
  .option('-s, --size-hint <gates>', 'provide a circuit size hint to skip calculation phase')
  .action(async ({ jsonPath, witnessPath, recursive, outputPath, sizeHint }) => {
    handleGlobalOptions();
    await prove(jsonPath, witnessPath, recursive, outputPath, sizeHint);
  });

program
  .command('gates')
  .description('Print gate count to standard output.')
  .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
  .action(async ({ jsonPath }) => {
    handleGlobalOptions();
    await gateCount(jsonPath);
  });

program
  .command('verify')
  .description('Verify a proof. Process exists with success or failure code.')
  .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
  .requiredOption('-p, --proof-path <path>', 'Specify the path to the proof')
  .option('-r, --recursive', 'prove using recursive prover', false)
  .requiredOption('-k, --vk <path>', 'path to a verification key. avoids recomputation.')
  .action(async ({ jsonPath, proofPath, recursive, vk }) => {
    handleGlobalOptions();
    await verify(jsonPath, proofPath, recursive, vk);
  });

program
  .command('contract')
  .description('Output solidity verification key contract.')
  .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
  .option('-o, --output-path <path>', 'Specify the path to write the contract', '-')
  .requiredOption('-k, --vk <path>', 'path to a verification key. avoids recomputation.')
  .action(async ({ outputPath, vk }) => {
    handleGlobalOptions();
    await contract(outputPath, vk);
  });

program
  .command('write_vk')
  .description('Output verification key.')
  .option('-j, --json-path <path>', 'Specify the JSON path', './target/main.json')
  .requiredOption('-o, --output-path <path>', 'Specify the path to write the key')
  .option('-s, --size-hint <gates>', 'provide a circuit size hint to skip calculation phase')
  .action(async ({ jsonPath, outputPath, sizeHint }) => {
    handleGlobalOptions();
    await writeVk(jsonPath, outputPath, sizeHint);
  });

program
  .command('proof_as_fields')
  .description('Return the proof as fields elements')
  .requiredOption('-p, --proof-path <path>', 'Specify the proof path')
  .requiredOption('-n, --num-public-inputs <number>', 'Specify the number of public inputs')
  .requiredOption('-o, --output-path <path>', 'Specify the JSON path to write the proof fields')
  .action(async ({ proofPath, numPublicInputs, outputPath }) => {
    handleGlobalOptions();
    await proofAsFields(proofPath, numPublicInputs, outputPath);
  });

program
  .command('vk_as_fields')
  .description('Return the verifiation key represented as fields elements. Also return the verification key hash.')
  .requiredOption('-i, --input-path <path>', 'Specifies the vk path (output from write_vk)')
  .requiredOption('-o, --output-path <path>', 'Specify the JSON path to write the verification key fields and key hash')
  .action(async ({ inputPath, outputPath }) => {
    handleGlobalOptions();
    await vkAsFields(inputPath, outputPath);
  });

program.name('bb.js').parse(process.argv);
