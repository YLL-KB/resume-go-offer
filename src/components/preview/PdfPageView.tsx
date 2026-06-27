"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2 } from "lucide-react";

// pdf.js worker — must be set before any PDF operations
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfPageView({ url }: { url: string }) {
  const [numPages, setNumPages] = useState(0);

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full max-w-[210mm] origin-top scale-[0.58] md:scale-90 md:origin-top-left">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              加载模版...
            </div>
          }
          error={
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              PDF 加载失败
            </div>
          }
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={`page-${i + 1}`}
              className="bg-white shadow-lg mx-auto mb-4 last:mb-0"
              style={{ width: "210mm" }}
            >
              <Page
                pageNumber={i + 1}
                width={794}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
