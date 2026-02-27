import os from 'os';

const limitProfiles = {
  hardened: { // Hardened default limits for untrusted documents.
    maxConcurrency: 1,
    timeoutMs: 15_000,
    maxBlocks: 25,
    maxFileBytes: 1 * 1024 * 1024, // 1MB
    maxBlockBytes: 64 * 1024, // 64KB
    maxSvgBytes: 2 * 1024 * 1024, // 2MB
    childOutput: 'capture',
  },
  lax: { // Lax limits for trusted local documents.
    maxConcurrency: 2,
    timeoutMs: 30_000,
    maxBlocks: 50,
    maxFileBytes: 2 * 1024 * 1024, // 2MB
    maxBlockBytes: 128 * 1024, // 128KB
    maxSvgBytes: 5 * 1024 * 1024, // 5MB
    childOutput: 'capture',
  },
  unsafe: { // Unsafe limits for debugging (may leak sensitive info).
    maxConcurrency: os.cpus().length,
    timeoutMs: 60_000,
    maxBlocks: 250,
    maxFileBytes: 10 * 1024 * 1024, // 10MB
    maxBlockBytes: 512 * 1024, // 512KB
    maxSvgBytes: 20 * 1024 * 1024, // 20MB
    childOutput: 'capture',
  },
};

export default limitProfiles;
