import { BarretenbergWasm } from './barretenberg_wasm.js';

describe('barretenberg wasm', () => {
  let wasm!: BarretenbergWasm;

  beforeAll(async () => {
    wasm = await BarretenbergWasm.new();
  });

  it('should new malloc, transfer and slice mem', () => {
    const length = 1024;
    const ptr = wasm.call('bbmalloc', length);
    const buf = Buffer.alloc(length, 128);
    wasm.writeMemory(ptr, buf);
    wasm.call('bbfree', ptr);
    const result = Buffer.from(wasm.getMemorySlice(ptr, ptr + length));
    expect(result).toStrictEqual(buf);
  });

  // TODO: Asyncify has been disabled by Blaine for... reasons.
  // it('should use asyncify to do an async callback into js', async () => {
  //   const addr1 = await wasm.asyncCall('test_async_func', 1024 * 1024, 1);
  //   const addr2 = await wasm.asyncCall('test_async_func', 1024 * 1024 * 2, 2);
  //   expect(wasm.getMemorySlice(addr1, addr1 + 1024 * 1024).every(v => v === 1)).toBe(true);
  //   expect(wasm.getMemorySlice(addr2, addr2 + 1024 * 1024 * 2).every(v => v === 2)).toBe(true);
  // });
});
