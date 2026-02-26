#!/usr/bin/env node
import MermaidRenderer from "./render-mermaid.js";
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

export function printHelp(stdout = process.stdout) {
  stdout.write(`render-mermaid

Usage:
  render-mermaid <input.md> [output-dir]

Arguments:
  input.md      Markdown file containing one or more \`\`\`mermaid\`\`\` blocks
  output-dir    Directory to write PNG files (default: current working directory)

Options:
  -h, --help    Show help
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

  const inputPath = args[0];
  const outputDir = args[1] || cwd();

  if (!inputPath) {
    printHelp(stdout);
    return 1;
  }

  try {
    const mermaidRenderer = new MermaidRenderer(inputPath, outputDir);
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

