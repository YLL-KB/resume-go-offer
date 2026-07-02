/**
 * PDF 图片提取器。
 * 使用 pdfjs-dist 的 OperatorList 遍历页面运算符，
 * 找到图片绘制操作并提取图片数据、位置和尺寸。
 */

export interface ImageBlock {
  id: string;
  page: number;
  x: number;
  y: number; // PDF bottom-left origin
  width: number;
  height: number;
  dataUrl: string;
  originalWidth: number;
  originalHeight: number;
  pageHeight: number;
}

interface OpsImgEntry {
  name: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageHeight: number;
}

/**
 * 从 PDF 提取所有图片，返回 ImageBlock 数组。
 */
export async function extractImages(url: string): Promise<ImageBlock[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.v6.mjs";

  const pdf = await pdfjsLib.getDocument({ url }).promise;
  const blocks: ImageBlock[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const operatorList = await page.getOperatorList();

    // 跟踪当前变换矩阵状态
    let ctm: number[] = [1, 0, 0, 1, 0, 0]; // [a, b, c, d, e, f]
    const imgEntries: OpsImgEntry[] = [];

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];

      // pdfjs-dist OPS 常量：通过导入或内联值
      // OPS.constructPath = 1, OPS.paintImageXObject = 87 等
      // 使用数字常量避免导入问题
      switch (fn) {
        case 87: // paintImageXObject
        case 88: // paintInlineImageXObject
        case 89: // paintImageMaskXObject
          if (args && args.length >= 1) {
            const name = String(args[0]);
            // 用当前 CTM 计算位置和尺寸
            // CTM: [a, b, c, d, e, f] — e=translateX, f=translateY
            const imgWidth = Math.abs(ctm[0]) || 100; // scaleX
            const imgHeight = Math.abs(ctm[3]) || 100; // scaleY
            const x = ctm[4]; // translateX
            const y = ctm[5]; // translateY (PDF bottom-left)
            // 过滤太小的图片（≥5px 即可，用于检测小图标）
            if (imgWidth > 5 && imgHeight > 5) {
              imgEntries.push({
                name,
                page: p,
                x,
                y,
                width: imgWidth,
                height: imgHeight,
                pageHeight: viewport.height,
              });
            }
          }
          break;
        // 跟踪变换矩阵变化
        case 32: // save
        case 33: // restore
        case 34: // transform
          // 简化处理：取最后一个变换
          if (fn === 34 && args && args.length >= 6) {
            ctm = args as number[];
          }
          break;
      }
    }

    // 获取每张图片的实际数据
    for (const entry of imgEntries) {
      try {
        // pdfjs-dist 5.x: page.objs 可能不存在，尝试不同的 API
        const objs = (page as unknown as Record<string, unknown>).objs as
          | { get: (name: string) => Promise<{ data: Uint8Array; width: number; height: number }> }
          | undefined;
        if (!objs) continue;

        const imgData = await objs.get(entry.name);
        if (!imgData?.data) continue;

        const dataUrl = arrayBufferToDataUrl(
          imgData.data,
          imgData.width,
          imgData.height,
        );

        // 转换 PDF y (bottom-left) 为屏幕 y (top-left)
        const screenY = entry.pageHeight - entry.y - entry.height;

        blocks.push({
          id: `img-${entry.page}-${entry.name}`,
          page: entry.page,
          x: entry.x,
          y: screenY, // 转为 top-left 坐标
          width: entry.width,
          height: entry.height,
          dataUrl,
          originalWidth: imgData.width,
          originalHeight: imgData.height,
          pageHeight: entry.pageHeight,
        });
      } catch {
        // 某些图片可能无法提取（如内联图片），跳过
        console.warn(`无法提取图片: ${entry.name} (page ${entry.page})`);
      }
    }
  }

  return blocks;
}

/** 将图片原始数据转为 Data URL */
function arrayBufferToDataUrl(
  data: Uint8Array,
  width: number,
  height: number,
): string {
  // 尝试从原始数据判断格式
  const isJpeg =
    data[0] === 0xff && data[1] === 0xd8;
  const isPng =
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47;

  const mime = isPng ? "image/png" : isJpeg ? "image/jpeg" : "image/png";

  // 如果是原始 RGB 数据，需要编码为 PNG
  if (!isJpeg && !isPng && data.length === width * height * 3) {
    return rawRgbToPngDataUrl(data, width, height);
  }

  const base64 = bytesToBase64(data);
  return `data:${mime};base64,${base64}`;
}

/** 原始 RGB 数据 → PNG Data URL（通过 Canvas） */
function rawRgbToPngDataUrl(
  data: Uint8Array,
  width: number,
  height: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < data.length; i++) {
    imageData.data[i] = data[i];
  }
  // 如果数据是 RGB（不是 RGBA），补上 alpha
  if (data.length === width * height * 3) {
    for (let i = 0; i < width * height; i++) {
      const srcIdx = i * 3;
      const dstIdx = i * 4;
      imageData.data[dstIdx] = data[srcIdx];
      imageData.data[dstIdx + 1] = data[srcIdx + 1];
      imageData.data[dstIdx + 2] = data[srcIdx + 2];
      imageData.data[dstIdx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
