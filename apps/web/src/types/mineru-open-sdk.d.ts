declare module "mineru-open-sdk" {
  interface ExtractOptions { model?: string; ocr?: boolean; formula?: boolean; table?: boolean; language?: string; pages?: string; extraFormats?: string[]; timeout?: number; }
  interface FlashExtractOptions { language?: string; pageRange?: string; ocr?: boolean; formula?: boolean; table?: boolean; timeout?: number; }
  interface ExtractResult {
    taskId: string; state: string; filename: string | null; errCode: string; error: string | null;
    markdown: string | null;
    contentList: Record<string, unknown>[] | null;
    images: { name: string; data: Uint8Array; path: string }[];
    html: string | null; latex: string | null;
  }
  export class MinerU {
    constructor(token?: string);
    flashExtract(source: string, options?: FlashExtractOptions): Promise<ExtractResult>;
    extract(source: string, options?: ExtractOptions): Promise<ExtractResult>;
  }
}
