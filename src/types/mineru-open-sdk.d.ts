declare module "mineru-open-sdk" {
  export class MinerU {
    constructor(token?: string);
    flashExtract(url: string): Promise<{ markdown: string; images?: { name: string; data: string }[] }>;
    extract(url: string): Promise<{ markdown: string; images?: { name: string; data: string }[] }>;
  }
}
