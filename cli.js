#! /usr/bin/env node
import MermaidRenderer from "./render-mermaid.js";
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { parseArgs as parseArgsUtil } from 'util';
import limitProfiles from './lib/limitProfiles.js';


function parseIntArg(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function normalizeArgs(args) {
  // util.parseArgs treats values starting with '-' as ambiguous unless provided as --opt=-1.
  // Preserve the previous parser behavior by rewriting negative numeric values.
  const valueOptions = new Set([
    '--mode',
    '--max-concurrency',
    '--timeout-ms',
    '--max-blocks',
    '--max-file-bytes',
    '--max-block-bytes',
    '--max-svg-bytes',
  ]);

  const normalized = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    const next = args[i + 1];

    if (valueOptions.has(token) && typeof next === 'string' && /^-\d/.test(next)) {
      normalized.push(`${token}=${next}`);
      i += 1;
      continue;
    }

    normalized.push(token);
  }

  return normalized;
}

function parseArgs(args) {
  let parsed;
  try {
    parsed = parseArgsUtil({
      args: normalizeArgs(args),
      allowPositionals: true,
      strict: true,
      options: {
        verbose: { type: 'boolean' },
        mode: { type: 'string' },
        'max-concurrency': { type: 'string' },
        'timeout-ms': { type: 'string' },
        'max-blocks': { type: 'string' },
        'max-file-bytes': { type: 'string' },
        'max-block-bytes': { type: 'string' },
        'max-svg-bytes': { type: 'string' },
      },
    });
  } catch (err) {
    // Preserve existing strict behavior and error text for unknown flags.
    if (err?.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      const msg = String(err?.message ?? '');
      const match = msg.match(/(--[A-Za-z0-9-]+)/);
      const opt = match?.[1] ?? 'unknown';
      throw new Error(`Unknown option: ${opt}`, { cause: err });
    }
    throw err;
  }

  const positionals = parsed.positionals ?? [];
  const values = parsed.values ?? {};

  let mode = 'hardened';
  if (typeof values.mode === 'string' && Object.keys(limitProfiles).includes(values.mode)) {
    mode = values.mode;
  }

  const base = limitProfiles[mode];
  const rendererOptions = { ...base };

  if (values['max-concurrency'] !== undefined) {
    rendererOptions.maxConcurrency = parseIntArg(values['max-concurrency'], 'maxConcurrency');
  }
  if (values['timeout-ms'] !== undefined) {
    rendererOptions.timeoutMs = parseIntArg(values['timeout-ms'], 'timeoutMs');
  }
  if (values['max-blocks'] !== undefined) {
    rendererOptions.maxBlocks = parseIntArg(values['max-blocks'], 'maxBlocks');
  }
  if (values['max-file-bytes'] !== undefined) {
    rendererOptions.maxFileBytes = parseIntArg(values['max-file-bytes'], 'maxFileBytes');
  }
  if (values['max-block-bytes'] !== undefined) {
    rendererOptions.maxBlockBytes = parseIntArg(values['max-block-bytes'], 'maxBlockBytes');
  }
  if (values['max-svg-bytes'] !== undefined) {
    rendererOptions.maxSvgBytes = parseIntArg(values['max-svg-bytes'], 'maxSvgBytes');
  }

  if (values.verbose) {
    rendererOptions.childOutput = 'inherit';
  }

  return { positionals, rendererOptions };
}

export function printHelp(stdout = process.stdout) {
  stdout.write(`render-mermaid

Usage:
  render-mermaid <input.md> [output-dir]

Arguments:
  input.md      Markdown file containing one or more \`\`\`mermaid\`\`\` blocks
  output-dir    Directory to write PNG files (default: current working directory)

Options:
  -h, --help    Show help
  --verbose     Inherit Mermaid CLI stdout/stderr (may leak sensitive info)

  --mode <string>               Preset limit profile (hardened (default), lax, unsafe)
  --max-concurrency <number>    Max renders in flight
  --timeout-ms <number>         Max time per render
  --max-blocks <number>         Max Mermaid blocks allowed
  --max-file-bytes <number>     Max input file size in bytes
  --max-block-bytes <number>    Max Mermaid block size in bytes
  --max-svg-bytes <number>      Max rendered SVG size in bytes
`);
}

export async function runCli(
  argv = process.argv,
  { stdout = process.stdout, cwd = () => process.cwd() } = {},
) {
  const args = argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp(stdout);
    return 0;
  }

  const { positionals, rendererOptions } = parseArgs(args);
  const inputPath = positionals[0];
  const outputDir = positionals[1] || cwd();

  if (!inputPath) {
    printHelp(stdout);
    return 1;
  }

  try {
    const hasOptions = rendererOptions && Object.keys(rendererOptions).length > 0;
    const mermaidRenderer = hasOptions
      ? new MermaidRenderer(inputPath, outputDir, rendererOptions)
      : new MermaidRenderer(inputPath, outputDir);
    await mermaidRenderer.run();
    return 0;
  } catch (err) {
    throw new Error(`Error: ${err.message}`, { cause: err });
  }
}

function isDirectRun() {
  const invokedPath = process.argv[1];
  if (!invokedPath) return false;
  try {
    const cliFilePath = fileURLToPath(import.meta.url);
    return path.resolve(invokedPath) === path.resolve(cliFilePath);
  } catch {
    try {
      return import.meta.url === pathToFileURL(invokedPath).href;
    } catch {
      return false;
    }
  }
}

if (isDirectRun()) {
  const exitCode = await runCli(process.argv);
  process.exit(exitCode);
}

