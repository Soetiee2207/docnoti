# ADR-005: OCR Engine

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** OCR processing for scanned and image-based documents

---

## Context

PDF documents processed by `docnoti` may contain:

- scanned pages;
- images instead of text;
- Vietnamese text;
- mixed text and images;
- poor-quality scans;
- multi-page scanned documents.

OCR is mandatory for V1.

The OCR system must:

- run locally by default;
- support Vietnamese;
- preserve page boundaries;
- integrate with the PDF processing pipeline;
- provide text usable by classification, AI analysis, evidence, and search;
- be replaceable without changing the rest of the application;
- support future local AI/document-processing improvements.

---

## Decision

`docnoti` will use **PaddleOCR** as the primary OCR engine for V1.

OCR will be exposed through an application-level abstraction:

```text
PDF Processor
      │
      ▼
OCR Service
      │
      ▼
OCRProvider
      │
      ▼
PaddleOCR