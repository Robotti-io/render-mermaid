import fs from 'fs';
import path from 'path';

import limitProfiles from './limitProfiles.js';

function assertPositiveSafeInteger(value, name) {
  if (value === undefined || value === null) return;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}

function assertPositiveSafeIntegerOrInfinity(value, name) {
  if (value === undefined || value === null) return;
  if (value === Infinity) return;
  assertPositiveSafeInteger(value, name);
}

export function mergeOptions(options = {}) {
  const merged = {
    ...limitProfiles.hardened,
    ...options,
  };

  assertPositiveSafeInteger(merged.maxConcurrency, 'maxConcurrency');
  assertPositiveSafeInteger(merged.timeoutMs, 'timeoutMs');
  assertPositiveSafeIntegerOrInfinity(merged.maxBlocks, 'maxBlocks');
  assertPositiveSafeInteger(merged.maxFileBytes, 'maxFileBytes');
  assertPositiveSafeInteger(merged.maxBlockBytes, 'maxBlockBytes');
  assertPositiveSafeInteger(merged.maxSvgBytes, 'maxSvgBytes');

  if (!['inherit', 'capture', 'ignore'].includes(merged.childOutput)) {
    throw new Error('childOutput must be one of: inherit, capture, ignore');
  }

  if (merged.mmdcPath !== undefined && merged.mmdcPath !== null) {
    if (typeof merged.mmdcPath !== 'string' || merged.mmdcPath.trim().length === 0) {
      throw new Error('mmdcPath must be a non-empty string');
    }
  }

  // Existing rendering options (from index.d.ts) may be provided as well.
  // Validate only when present.
  if (merged.scale !== undefined) {
    if (typeof merged.scale !== 'number' || !Number.isFinite(merged.scale) || merged.scale <= 0) {
      throw new Error('scale must be a positive number');
    }
  }
  if (merged.density !== undefined) {
    if (!Number.isSafeInteger(merged.density) || merged.density <= 0) {
      throw new Error('density must be a positive integer');
    }
  }
  if (merged.maxWidth !== undefined && merged.maxWidth !== null) {
    if (!Number.isSafeInteger(merged.maxWidth) || merged.maxWidth <= 0) {
      throw new Error('maxWidth must be a positive integer or null');
    }
  }

  return merged;
}

export async function runWithConcurrency(items, concurrency, handler) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await handler(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

export function collectStream(stream, { maxBytes }) {
  if (!stream) return { getText: () => '' };
  const chunks = [];
  let total = 0;
  let truncated = false;

  const onData = (buf) => {
    if (truncated) return;
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf));
    total += b.length;
    if (total > maxBytes) {
      truncated = true;
      const allowed = b.length - (total - maxBytes);
      if (allowed > 0) chunks.push(b.subarray(0, allowed));
      return;
    }
    chunks.push(b);
  };

  stream.on('data', onData);
  return {
    getText: () => {
      try {
        return Buffer.concat(chunks).toString('utf-8');
      } catch {
        return '';
      }
    },
  };
}

export function findPackageRootFromResolvedFile(resolvedFilePath, packageName) {
  let currentDir = path.dirname(resolvedFilePath);
  const { root } = path.parse(currentDir);

  while (true) {
    const candidate = path.join(currentDir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
        if (pkg?.name === packageName) {
          return { packageDir: currentDir, packageJson: pkg };
        }
      } catch {
        // ignore and continue walking up
      }
    }

    if (currentDir === root) break;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  throw new Error(`Unable to locate ${packageName} package root from ${resolvedFilePath}`);
}

export function findPackageDirInNodeModules(packageName, startDir) {
  const parts = packageName.split('/');
  let currentDir = startDir;
  const { root } = path.parse(currentDir);

  while (true) {
    const candidateDir = path.join(currentDir, 'node_modules', ...parts);
    const candidatePkgJson = path.join(candidateDir, 'package.json');
    if (fs.existsSync(candidatePkgJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidatePkgJson, 'utf-8'));
        if (pkg?.name === packageName) {
          return { packageDir: candidateDir, packageJson: pkg };
        }
      } catch {
        // ignore and continue
      }
    }

    if (currentDir === root) break;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return null;
}
