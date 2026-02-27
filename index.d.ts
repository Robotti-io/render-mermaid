export interface MermaidRendererOptions {
  /**
   * Maximum number of Mermaid blocks allowed in the document.
  * @default 25
   */
  maxBlocks?: number;

  /**
   * Maximum input Markdown file size in bytes.
    * @default 1048576 (1 MB)
   */
  maxFileBytes?: number;

  /**
   * Maximum Mermaid block size in bytes.
    * @default 65536 (64 KB)
   */
  maxBlockBytes?: number;

  /**
   * Maximum rendered SVG size in bytes before rasterizing.
    * @default 2097152 (2 MB)
   */
  maxSvgBytes?: number;

  /**
   * Maximum number of Mermaid renders to run concurrently.
    * @default 1
   */
  maxConcurrency?: number;

  /**
   * Timeout for each Mermaid CLI invocation.
    * @default 15000
   */
  timeoutMs?: number;

  /**
   * Controls what to do with Mermaid CLI stdout/stderr.
   * - 'capture': pipe and capture output (not printed)
   * - 'inherit': inherit output (printed to console)
   * - 'ignore' : discard output
   *
   * @default 'capture'
   */
  childOutput?: 'capture' | 'inherit' | 'ignore';

  /**
   * CSS color passed to `mmdc -b`.
   * @default 'white'
   */
  backgroundColor?: string;

  /**
   * Mermaid CLI scale passed to `mmdc -s`.
   * @default 1
   */
  scale?: number;

  /**
   * Sharp density used when rasterizing SVG.
   * @default 350
   */
  density?: number;

  /**
   * If provided, resizes PNG to this max width.
   */
  maxWidth?: number | null;

  /**
   * Optional override path to the Mermaid CLI binary/script (`mmdc`).
   * Intended for advanced usage and testing.
   */
  mmdcPath?: string;
}

export declare class MermaidRenderer {
  constructor(documentPath: string, destinationPath?: string, options?: MermaidRendererOptions);

  extractMermaidBlocks(): string[];

  run(): Promise<void>;

  mermaidDocumentConversion(
    inputPath: string,
    svgOutputPath: string,
    pngOutputPath: string,
    mermaidConfigurationPath: string,
    backgroundColor?: string,
    scale?: number,
  ): Promise<void>;

  convertSVGToPNG(
    inputPath: string,
    outputPath: string,
    density?: number,
    maxWidth?: number | null,
  ): Promise<void>;
}

export default MermaidRenderer;
