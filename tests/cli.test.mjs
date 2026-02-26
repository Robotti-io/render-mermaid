import { jest } from '@jest/globals';

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
  });

  test('missing input prints usage and returns 1', async () => {
    const cap = createStdoutCapture();

    const { runCli } = await import('../cli.js');
    const code = await runCli(['node', 'cli.js'], { stdout: cap.stdout });

    expect(code).toBe(1);
    expect(cap.getOutput()).toContain('Usage:');
  });

  test('happy path constructs renderer and returns 0', async () => {
    const cap = createStdoutCapture();
    const runMock = jest.fn(async () => {});
    const ctorMock = jest.fn(() => ({ run: runMock }));

    jest.unstable_mockModule('../render-mermaid.js', () => ({
      default: ctorMock,
    }));

    const { runCli } = await import('../cli.js');
    const code = await runCli(
      ['node', 'cli.js', './doc.md', './out'],
      { stdout: cap.stdout, cwd: () => 'CWD_SHOULD_NOT_BE_USED' },
    );

    expect(code).toBe(0);
    expect(ctorMock).toHaveBeenCalledWith('./doc.md', './out');
    expect(runMock).toHaveBeenCalledTimes(1);
  });

  test('renderer failure throws prefixed Error', async () => {
    const cap = createStdoutCapture();
    const ctorMock = jest.fn(() => ({
      run: async () => {
        throw new Error('boom');
      },
    }));

    jest.unstable_mockModule('../render-mermaid.js', () => ({
      default: ctorMock,
    }));

    const { runCli } = await import('../cli.js');
    await expect(runCli(['node', 'cli.js', './doc.md'], { stdout: cap.stdout, cwd: () => './cwd' }))
      .rejects
      .toThrow(/Error: boom/);
  });
});
