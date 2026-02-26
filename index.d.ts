export interface MermaidRendererOptions {
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
}

export declare class MermaidRenderer {
  constructor(documentPath: string, destinationPath?: string);

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
