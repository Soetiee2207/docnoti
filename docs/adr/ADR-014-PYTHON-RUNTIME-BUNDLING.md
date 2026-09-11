# ADR-014: Python Runtime and Offline Model Bundling

- **Status:** Proposed (Design & Audit Complete)
- **Date:** 2026-09-11
- **Decision Type:** Architecture & Production Hardening
- **Scope:** Desktop Application Packaging, Windows Clean-Machine Offline OCR Execution

---

## 1. Problem Statement

In current development and testing builds, DocNoti relies on the host operating system's Python environment to execute OCR and embedding runners:
1. **External Runtime Dependency:** `src-tauri/src/ocr.rs` resolves Python by checking the `DOCNOTI_PYTHON` environment variable, relative virtualenvs (`.venv/Scripts/python.exe`), or falling back to the system `PATH` (`python`).
2. **Missing Dependencies on Clean Windows Machines:** On a fresh Windows 10/11 machine without Python, or with Python installed but missing `paddlepaddle` / `paddleocr`, OCR operations immediately fail with exit code 2 (`PaddleOCR is not installed in the current Python environment`).
3. **Implicit Online Model Downloads:** PaddleOCR 3.7+ (`paddlex`) by default attempts to query HuggingFace / Baidu Bos to download model parameters to `%USERPROFILE%\.paddlex\official_models` during first execution, violating DocNoti's core invariant: **Local-First, Zero Unsolicited Network Calls**.
4. **Target Invariant for V1 Production:** 
   $$\text{Installer} \longrightarrow \text{Launch} \longrightarrow \text{OCR PDF Scan}$$
   Must execute successfully out-of-the-box on a clean Windows machine **without** requiring the user to install Python, run `pip install`, or connect to the internet.

---

## 2. Current Architecture & Discovery Audit

### 2.1 Component Interaction
```text
[Frontend / UI]
      │
      ▼ invoke("run_ocr_on_image", { imageBytes })
[src-tauri: ocr.rs]
      │ 1. find_ocr_script(&app)  ──> searches AppData / Resources / Relative
      │ 2. find_python_exe()      ──> checks DOCNOTI_PYTHON -> .venv -> system PATH
      │ 3. Writes temp image      ──> AppData\Local\docnoti\temp_ocr\<uuid>.png
      │ 4. Command::new(python)   ──> executes scripts/ocr_runner.py <image_path>
      ▼
[scripts/ocr_runner.py]
      │ 1. Sets os.environ["PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT"] = "0"
      │ 2. Sets os.environ["FLAGS_use_mkldnn"] = "0"
      │ 3. Imports paddleocr (PaddleOCR 3.7 / PaddleX)
      │ 4. Implicitly uses %USERPROFILE%\.paddlex for model cache
      ▼
[Local Output JSON] ──> Stdout parsed by Rust ──> Returned to TypeScript Ingestion Pipeline
```

### 2.2 Root Incompatibilities Identified in Audit
1. **Dynamic Model Discovery:** In PaddleOCR 3.7+, model paths are resolved through `paddlex.utils.cache.CACHE_DIR`, which falls back to `~/.paddlex` unless overridden by the `PADDLE_PDX_CACHE_HOME` environment variable.
2. **Native DLL Dependencies:** PaddlePaddle 3.3.1 requires 13 native C++ libraries in `paddle/libs/` (~188.82 MB), including `mklml.dll`, `mkldnn.dll`, `phi.dll`, `libiomp5md.dll`, and `liblapack.dll`, as well as the Microsoft Visual C++ 2015–2022 Redistributable (`vcruntime140.dll`, `msvcp140.dll`).
3. **OneDNN / MKLDNN CPU Bug:** On Windows CPUs, PaddlePaddle 3.3 crashes with a PIR instruction attribute error unless `PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT=0` and `FLAGS_use_mkldnn=0` are strictly enforced prior to importing `paddleocr`.

---

## 3. Dependency Inventory & Classification

Based on live disk audit of the running runtime:

### 3.1 APPLICATION RESOURCES (To Bundle in Installer)

| Component | Disk Size (Uncompressed) | Role & License |
| :--- | :--- | :--- |
| **Python Embedded Runtime (3.11.9 x64)** | ~25 MB | Portable CPython runtime (PSFL) |
| **PaddlePaddle 3.3.1 (Core + Native DLLs)** | ~381.72 MB | Deep learning framework & tensor engine (Apache 2.0) |
| **`paddle/libs/*.dll` (13 native DLLs)** | *(Included above, 188 MB)* | Intel MKL, oneDNN, OpenMP, BLAS (Intel SWL / Apache 2.0) |
| **OpenCV Headless (`cv2`)** | ~121.03 MB | Image manipulation for text bounding boxes (Apache 2.0) |
| **PaddleOCR 3.7.0 + PaddleX 3.0** | ~14.77 MB | OCR pipelines & document orientation (Apache 2.0) |
| **Supporting Libraries (`numpy`, `PIL`, `shapely`, `pyclipper`, `yaml`)** | ~54.00 MB | Geometry, parsing, array operations (BSD / MIT) |
| **Offline OCR Models (`PP-OCRv6`, `UVDoc`, `PP-LCNet`)** | ~176.57 MB | Pre-trained weights for Vietnamese & multilingual OCR (Apache 2.0) |
| **Runner Scripts (`ocr_runner.py`, `embedding_runner.py`)** | ~0.02 MB | Application bridges (MIT / Proprietary docnoti) |
| **Total Uncompressed Application Resources** | **~773 MB** | *(Compresses to ~185–240 MB via NSIS LZMA Solid)* |

### 3.2 USER DATA (Must NOT be in Installation Directory)

Per ADR-003 and ADR-013, user data resides strictly in `%LOCALAPPDATA%\docnoti` or user-configured custom paths:
- **Database:** `docnoti.db` (Drizzle / SQLite + FTS5)
- **Managed Documents:** Original and ingested PDF files
- **Extracted Text & Page Cache:** Local disk document store
- **Temporary Files:** `%LOCALAPPDATA%\docnoti\temp_ocr\`
- **Logs:** Application activity & background processing logs

### 3.3 DO NOT BUNDLE

- **Secrets & API Keys:** OpenAI API key (must reside exclusively in Windows Credential Manager / DPAPI per ADR-012).
- **User Databases & Ingested Documents:** Strictly created at runtime.
- **PyTorch / HuggingFace Large Models:** Jina PyTorch models (>2 GB) are excluded.

---

## 4. Options Considered for Packaging

### Option A: Python Embedded Runtime + Bundled Pruned Site-Packages (Recommended)
- **Mechanism:** Bundle official `python-3.11.x-embed-amd64` in `resources/runtime/python`. Place pre-installed, wheel-pruned site-packages into `resources/runtime/python/Lib/site-packages`. Enable standard importing via `python311._pth`. Bundle pre-downloaded models into `resources/ocr/models`.
- **Pros:**
  - 100% deterministic: Zero reliance on system Python or user PATH.
  - Instant startup: No archive extraction to `%TEMP%` at runtime (<400ms spawn time).
  - Clean separation: Script logic, model weights, and Python binaries can be inspected and updated independently.
  - Fully compatible with PaddlePaddle native DLL loading (`AddDllDirectory` / Python 3.8+ DLL search).
- **Cons:**
  - Installer footprint is ~190–240 MB compressed.

### Option B: PyInstaller Frozen Executable Sidecar (`ocr_runner.exe`)
- **Mechanism:** Compile `ocr_runner.py` into a frozen binary using PyInstaller.
- **Evaluation:**
  - *One-file mode (`--onefile`):* Unpacks ~800 MB of binaries to `%TEMP%` on every invocation, causing unacceptable 15–25 second latency for single-page OCR.
  - *One-dir mode (`--onedir`):* Produces a folder almost identical in size to Option A, but PaddlePaddle 3.x dynamic PIR dialects and PaddleX dynamic plugin imports frequently fail in frozen environments unless extensive custom PyInstaller hooks are maintained.
  - *Verdict:* High maintenance overhead, opaque debugging, no size benefit.

### Option C: Standalone Python Full Distribution
- **Mechanism:** Copy entire CPython installation (`Lib`, `Doc`, `tcl`, `include`, `Scripts`).
- **Evaluation:** Includes hundreds of unnecessary files (`tcl/tk`, `idlelib`, `test`, header files), bloating uncompressed size by >180 MB without any functional benefit for headless OCR.

### Option D: Native ONNX Runtime Direct Engine (RapidOCR-ONNX / Rust ORT)
- **Mechanism:** Replace Python & PaddlePaddle entirely with native C++/Rust ONNX Runtime calling exported PP-OCR ONNX models.
- **Evaluation:**
  - Extremely lightweight (~60 MB total) and fast.
  - **However:** Requires rewriting the OCR pipeline, converting PP-OCRv6 models, and extensive re-verification of Vietnamese diacritic extraction accuracy.
  - *Verdict:* Excellent candidate for V2 long-term optimization, but out of scope for V1 hardening under the constraint: *"Không thay đổi implementation hiện tại. Không xóa Python fallback hiện tại."*

---

## 5. Decision: Option A (Embedded Python Runtime + Bundled Offline Models)

For V1, DocNoti adopts **Option A**:
1. Bundle an isolated **Python 3.11 Embedded Runtime** within Tauri application resources.
2. Bundle a pruned **`site-packages`** containing `paddlepaddle-cpu`, `paddleocr`, `paddlex`, `opencv-python-headless`, and dependencies.
3. Bundle verified **offline OCR models** directly into resources.
4. Configure Rust `ocr.rs` to prioritize the bundled embedded runtime, falling back to local venv and system Python only during development.
5. Provide automatic verification and fallback in `ocr.rs`.

---

## 6. Proposed Deployment Layout

```text
<Installation Directory> (e.g. C:\Program Files\docnoti\)
├── docnoti.exe                              # Tauri application binary
├── ...
└── resources/
    ├── scripts/
    │   ├── ocr_runner.py                    # Primary OCR execution script
    │   └── embedding_runner.py              # Embedding runner script
    │
    ├── runtime/
    │   └── python/                          # Python 3.11 Embedded Runtime
    │       ├── python.exe                   # Headless python executable
    │       ├── python311.dll                # CPython core DLL
    │       ├── python311._pth               # Configured search path file
    │       ├── vcruntime140.dll             # Bundled MSVC runtime
    │       ├── msvcp140.dll                 # Bundled MSVC runtime
    │       └── Lib/
    │           └── site-packages/           # Pruned dependencies
    │               ├── paddle/              # PaddlePaddle 3.3.1 + paddle/libs/*.dll
    │               ├── paddleocr/           # PaddleOCR 3.7.0
    │               ├── paddlex/             # PaddleX 3.0 engine
    │               ├── cv2/                 # OpenCV headless
    │               ├── numpy/               # NumPy array library
    │               ├── PIL/                 # Pillow image library
    │               └── ...                  # pyclipper, shapely, yaml
    │
    └── ocr/
        └── models/                          # Pre-packaged offline OCR models
            └── official_models/
                ├── PP-OCRv6_medium_det/     # Text detection model (~59 MB)
                │   ├── inference.pdiparams
                │   └── inference.json
                ├── PP-OCRv6_medium_rec/     # Text recognition model (Vi/Multi) (~73 MB)
                │   ├── inference.pdiparams
                │   └── inference.json
                ├── PP-LCNet_x1_0_doc_ori/   # Document orientation (~6.4 MB)
                ├── PP-LCNet_x1_0_textline_ori/ # Textline orientation (~6.4 MB)
                └── UVDoc/                   # Document unwarping (~30.6 MB)
```

---

## 7. Runtime Resolution Architecture

### 7.1 Multi-Tier Runtime Resolution Strategy in Rust (`ocr.rs`)

```text
1. BUNDLED RUNTIME (Production Priority):
   Check: <app_resource_dir>/runtime/python/python.exe
   If present -> USE BUNDLED RUNTIME.

2. EXPLICIT OVERRIDE (Enterprise / Power-User):
   Check: std::env::var("DOCNOTI_PYTHON")
   If valid -> USE OVERRIDE.

3. LOCAL VENV (Development Priority):
   Check: ../.venv/Scripts/python.exe, .venv/Scripts/python.exe
   If present -> USE DEV VENV.

4. SYSTEM FALLBACK (Legacy / Dev Fallback):
   Check: "python" on PATH.
```

### 7.2 Model Path & Environment Invariant Enforcement

When spawning the Python process from Rust `ocr.rs`, the following environment variables **must be explicitly injected** into the child process:

```rust
// 1. Point PaddleX directly to bundled offline models
let bundled_models_dir = res_dir.join("ocr").join("models");
cmd.env("PADDLE_PDX_CACHE_HOME", &bundled_models_dir);

// 2. Prevent MKLDNN instruction crash on CPUs
cmd.env("PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT", "0");
cmd.env("FLAGS_use_mkldnn", "0");

// 3. Disable any unsolicited telemetry or phone-home
cmd.env("DISABLE_AUTO_LOGGING_CONFIG", "1");
cmd.env("PADDLE_DISABLE_TELEMETRY", "1");

// 4. Ensure UTF-8 I/O encoding across all Windows locales
cmd.env("PYTHONIOENCODING", "utf-8");
cmd.env("PYTHONUTF8", "1");
```

---

## 8. Embedding Runtime Strategy (Jina Embeddings)

### Audit Findings for `jina-embeddings-v5-text-small`
1. **Current State:** `scripts/embedding_runner.py` is an offline stub. If local model weights are not present on disk, `LocalJinaEmbeddingProvider.isAvailable()` returns `false`, and the search service transparently falls back to pure FTS5 keyword matching.
2. **Library Requirements:** Running local transformer inference requires `onnxruntime` (~42 MB) or PyTorch (>2 GB).
3. **Model Size:** Dense 1024-dim model weights in ONNX format require ~130–280 MB.
4. **License Invariant:** Jina-v5 is licensed under `CC BY-NC 4.0` (Non-Commercial). Bundling it directly into the commercial/general installer creates licensing ambiguities.

### Recommendation for Embeddings
- **Do NOT bundle PyTorch or large embedding weights in the V1 installer.**
- The bundled Python runtime already includes `numpy` and can accommodate `onnxruntime` if needed.
- In V1, search remains 100% functional via **SQLite FTS5 + Unicode61 tokenization**.
- Local embedding models should remain an **optional offline user package** placed in `%LOCALAPPDATA%\docnoti\models\jina-embeddings-v5-text-small` if vector retrieval is activated.

---

## 9. Error Handling & Clean Machine Edge Cases

| Failure Scenario | Detection Mechanism | Graceful Handling |
| :--- | :--- | :--- |
| **Missing Visual C++ Runtime (`vcruntime140.dll`)** | Process spawn fails with `STATUS_DLL_NOT_FOUND` (0xC0000135) | NSIS installer bundles or checks Microsoft Visual C++ 2015–2022 Redistributable; fallback returns clear user-actionable message. |
| **Bundled Model File Corrupted** | `ocr_runner.py` throws deserialization exception | Rust catches stderr, marks OCR as failed for the page, and PDF ingestion continues with native text layer. |
| **Write Protected Temp Directory** | Rust cannot write to `temp_ocr` | Uses `%LOCALAPPDATA%\docnoti\temp_ocr` which is always user-writable. |
| **Low Memory (System RAM < 2 GB)** | Python process killed by OS OOM | Rust detects non-zero exit code, logs warning, and gracefully falls back to text extraction. |

---

## 10. Update & Maintenance Strategy

1. **Independent Script Updates:** Because `ocr_runner.py` is not compiled into a frozen exe, hotfixes to parsing or bounding box logic do not require re-bundling the heavy 500 MB Python runtime.
2. **Model Upgrades:** Newer PaddleOCR weights (e.g. specialized tabular or handwriting models) can be dropped into `resources/ocr/models/official_models/` without modifying binaries.
3. **Application Updates:** When updating DocNoti via NSIS / MSI, the installer overwrites `resources/` while preserving all user databases and documents in `%LOCALAPPDATA%\docnoti`.

---

## 11. Licensing Compliance Summary

- **CPython (3.11):** Python Software Foundation License (PSFL) — Permissive, commercial bundling allowed.
- **PaddlePaddle & PaddleOCR:** Apache License 2.0 — Permissive, commercial bundling and redistribution allowed with NOTICE attribution.
- **OpenCV (headless):** Apache License 2.0 — Permissive.
- **NumPy / Pillow / Shapely / PyYAML:** BSD / MIT / Apache 2.0 — Permissive.
- **Notice Obligation:** Include third-party licenses in `THIRD_PARTY_LICENSES.txt` in the installed root directory.

---

## 12. Migration & Hardening Plan (When Approved for Implementation)

1. **Phase 1: Runtime Preparation Script (`scripts/bundle_python_runtime.py`)**:
   - Download official `python-3.11.9-embed-amd64.zip`.
   - Configure `python311._pth` to include `Lib/site-packages`.
   - Install required wheels with `--no-deps` into `Lib/site-packages`.
   - Prune `__pycache__`, `.dist-info`, and unused test directories.
2. **Phase 2: Offline Model Harvesting**:
   - Copy pre-cached models from `~/.paddlex/official_models` into `resources/ocr/models/official_models`.
3. **Phase 3: Tauri Configuration Update**:
   - Update `tauri.conf.json` bundle resources to include `resources/runtime/**` and `resources/ocr/models/**`.
4. **Phase 4: Rust Bridge Update (`ocr.rs`)**:
   - Update `find_python_exe()` and `run_ocr_on_image()` with multi-tier resolution and `PADDLE_PDX_CACHE_HOME` environment injection.
5. **Phase 5: NSIS Installer Configuration**:
   - Add VC++ Redistributable check in NSIS installer script.
6. **Phase 6: Verification on a Clean Windows VM**:
   - Test on a pristine Windows Sandbox / clean VM with zero pre-installed developer tools.

---

## 13. Testing & Verification Strategy

- **Test Case BUNDLE-01 (Clean Machine):** Install installer on clean Windows Sandbox (no Python, no Git, no VS). Verify launch and successful OCR of `07_pdf_scan_toan_bo.pdf`.
- **Test Case BUNDLE-02 (Offline Execution):** Disable all network interfaces on the test machine. Run OCR to verify 0 network requests and zero download timeouts.
- **Test Case BUNDLE-03 (Fallback Preservation):** Verify that during development (`npm run tauri dev`), `find_python_exe()` seamlessly uses local `.venv`.
- **Test Case BUNDLE-04 (Performance Benchmark):** Measure page OCR execution latency on clean machine; ensure cold start is under 4.0s and warm page OCR is under 2.5s.
