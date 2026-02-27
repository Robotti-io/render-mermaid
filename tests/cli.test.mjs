import { jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

function createStdoutCapture() {
  const chunks = [];
  return {
    stdout: {
      write: (str) => {
        chunks.push(String(str));
        return true;
      },
    },
    getOutput: () => chunks.join(''),
  };
}

function makeTempRoot(prefix = 'render-mermaid-cli-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeBytes(filePath, byteCount) {
  // Write a file with a predictable size without holding a huge string in memory.
  const fd = fs.openSync(filePath, 'w');
  try {
    const chunk = Buffer.alloc(64 * 1024, 'a');
    let remaining = byteCount;
    while (remaining > 0) {
      const toWrite = Math.min(remaining, chunk.length);
      fs.writeSync(fd, chunk, 0, toWrite);
      remaining -= toWrite;
    }
  } finally {
    fs.closeSync(fd);
  }
}

describe('CLI', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('--help prints usage and returns 0', async () => {
    const cap = createStdoutCapture();

    const { runCli } = await import('../cli.js');
    const code = await runCli(['node', 'cli.js', '--help'], { stdout: cap.stdout });

    expect(code).toBe(0);
    expect(cap.getOutput()).toContain('Usage:');
    expect(cap.getOutput()).toContain('render-mermaid <input.md>');
    expect(cap.getOutput()).toContain('--mode <string>');
  });

  test('missing input prints usage and returns 1', async () => {
    const cap = createStdoutCapture();

    const { runCli } = await import('../cli.js');
    const code = await runCli(['node', 'cli.js'], { stdout: cap.stdout });

    expect(code).toBe(1);
    expect(cap.getOutput()).toContain('Usage:');
  });

  test('unknown option throws (strict parsing)', async () => {
    const cap = createStdoutCapture();
    const { runCli } = await import('../cli.js');

    await expect(runCli(['node', 'cli.js', '--nope'], { stdout: cap.stdout }))
      .rejects
      .toThrow(/Unknown option: --nope/);
  });

  test('numeric flags must be positive integers', async () => {
    const cap = createStdoutCapture();
    const { runCli } = await import('../cli.js');

    await expect(runCli(['node', 'cli.js', '--timeout-ms', '0', './doc.md'], { stdout: cap.stdout }))
      .rejects
      .toThrow(/timeoutMs must be a positive integer/i);

    await expect(runCli(['node', 'cli.js', '--max-concurrency', '-1', './doc.md'], { stdout: cap.stdout }))
      .rejects
      .toThrow(/maxConcurrency must be a positive integer/i);
  });

  test('--mode lax allows larger files than hardened (no mermaid blocks)', async () => {
    const cap = createStdoutCapture();
    const tempRoot = makeTempRoot('render-mermaid-cli-mode-test-');
    const inputPath = path.join(tempRoot, 'big.md');
    const outputDir = path.join(tempRoot, 'out');

    try {
      // 1.5MB: should exceed hardened maxFileBytes (1MB) but be under lax (2MB).
      writeBytes(inputPath, 1_500_000);

      const { runCli } = await import('../cli.js');

      await expect(runCli(['node', 'cli.js', inputPath, outputDir], { stdout: cap.stdout }))
        .rejects
        .toThrow(/Document is too large/i);

      const code = await runCli(
        ['node', 'cli.js', '--mode', 'lax', inputPath, outputDir],
        { stdout: cap.stdout },
      );
      expect(code).toBe(0);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('invalid --mode value falls back to hardened defaults', async () => {
    const cap = createStdoutCapture();
    const tempRoot = makeTempRoot('render-mermaid-cli-mode-invalid-test-');
    const inputPath = path.join(tempRoot, 'big.md');
    const outputDir = path.join(tempRoot, 'out');

    try {
      writeBytes(inputPath, 1_500_000);

      const { runCli } = await import('../cli.js');
      await expect(
        runCli(['node', 'cli.js', '--mode', 'definitely-not-a-mode', inputPath, outputDir], { stdout: cap.stdout }),
      )
        .rejects
        .toThrow(/Document is too large/i);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('happy path runs on real markdown and returns 0', async () => {
    const cap = createStdoutCapture();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'render-mermaid-cli-test-'));
    const inputPath = path.join(tempRoot, 'doc.md');
    const outputDir = path.join(tempRoot, 'out');
    const cwdShouldNotBeUsed = path.join(tempRoot, 'cwd-should-not-be-used');

    try {
      // No ```mermaid``` blocks -> renderer.run() does not spawn mmdc.
      fs.writeFileSync(inputPath, '# Doc\n\nJust text.\n', 'utf-8');

      const { runCli } = await import('../cli.js');
      const code = await runCli(
        ['node', 'cli.js', inputPath, outputDir],
        { stdout: cap.stdout, cwd: () => cwdShouldNotBeUsed },
      );

      expect(code).toBe(0);
      expect(fs.existsSync(outputDir)).toBe(true);
      expect(fs.existsSync(cwdShouldNotBeUsed)).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('omitting output dir uses cwd() and creates it if missing', async () => {
    const cap = createStdoutCapture();
    const tempRoot = makeTempRoot('render-mermaid-cli-cwd-test-');
    const inputPath = path.join(tempRoot, 'doc.md');
    const cwdDir = path.join(tempRoot, 'cwd-output');

    try {
      fs.writeFileSync(inputPath, '# Doc\n\nNo mermaid blocks.\n', 'utf-8');
      expect(fs.existsSync(cwdDir)).toBe(false);

      const { runCli } = await import('../cli.js');
      const code = await runCli(
        ['node', 'cli.js', inputPath],
        { stdout: cap.stdout, cwd: () => cwdDir },
      );

      expect(code).toBe(0);
      expect(fs.existsSync(cwdDir)).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('--verbose forces renderer childOutput=inherit', async () => {
    const cap = createStdoutCapture();
    const tempRoot = makeTempRoot('render-mermaid-cli-verbose-test-');
    const inputPath = path.join(tempRoot, 'doc.md');
    const outputDir = path.join(tempRoot, 'out');

    try {
      fs.writeFileSync(inputPath, '# Doc\n\nNo mermaid blocks.\n', 'utf-8');

      const { MermaidRenderer } = await import('../index.js');
      const originalRun = MermaidRenderer.prototype.run;
      let capturedOptions;

      MermaidRenderer.prototype.run = async function run() {
        capturedOptions = this.options;
        return undefined;
      };

      try {
        const { runCli } = await import('../cli.js');
        const code = await runCli(
          ['node', 'cli.js', '--verbose', inputPath, outputDir],
          { stdout: cap.stdout },
        );

        expect(code).toBe(0);
        expect(capturedOptions).toBeTruthy();
        expect(capturedOptions.childOutput).toBe('inherit');
      } finally {
        MermaidRenderer.prototype.run = originalRun;
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('--mode unsafe applies preset values', async () => {
    const cap = createStdoutCapture();
    const tempRoot = makeTempRoot('render-mermaid-cli-unsafe-test-');
    const inputPath = path.join(tempRoot, 'doc.md');
    const outputDir = path.join(tempRoot, 'out');

    try {
      fs.writeFileSync(inputPath, '# Doc\n\nNo mermaid blocks.\n', 'utf-8');

      const { MermaidRenderer } = await import('../index.js');
      const originalRun = MermaidRenderer.prototype.run;
      let capturedOptions;

      MermaidRenderer.prototype.run = async function run() {
        capturedOptions = this.options;
        return undefined;
      };

      try {
        const { runCli } = await import('../cli.js');
        const code = await runCli(
          ['node', 'cli.js', '--mode', 'unsafe', inputPath, outputDir],
          { stdout: cap.stdout },
        );

        expect(code).toBe(0);
        expect(capturedOptions).toBeTruthy();
        expect(capturedOptions.timeoutMs).toBe(60_000);
        expect(capturedOptions.maxBlocks).toBe(250);
        expect(capturedOptions.maxFileBytes).toBe(10 * 1024 * 1024);
        expect(capturedOptions.childOutput).toBe('capture');
      } finally {
        MermaidRenderer.prototype.run = originalRun;
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('real fixture fails with Too many Mermaid blocks when maxBlocks is small', async () => {
    const cap = createStdoutCapture();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'render-mermaid-cli-fixture-test-'));
    const outputDir = path.join(tempRoot, 'out');
    const fixturePath = fileURLToPath(new URL('./Threat Model Review - 2026-02-25.md', import.meta.url));

    try {
      const { runCli } = await import('../cli.js');
      await expect(
        runCli(
          ['node', 'cli.js', '--max-blocks', '1', fixturePath, outputDir],
          { stdout: cap.stdout },
        ),
      )
        .rejects
        .toThrow(/Too many Mermaid blocks/i);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('missing document path throws helpful error', async () => {
    const cap = createStdoutCapture();
    const missingPath = path.join(
      os.tmpdir(),
      `render-mermaid-missing-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.md`,
    );

    const { runCli } = await import('../cli.js');
    await expect(runCli(['node', 'cli.js', missingPath], { stdout: cap.stdout }))
      .rejects
      .toThrow(`Document path does not exist: ${path.resolve(missingPath)}`);
  });
});
