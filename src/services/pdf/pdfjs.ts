import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs"
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url"

// In browser / webview environments, PDF.js requires workerSrc to be explicitly set
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker
}

export { pdfjsLib }
