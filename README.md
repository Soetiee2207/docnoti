# docnoti

**docnoti** là ứng dụng desktop thông minh xử lý tài liệu (document intelligence) hoạt động theo mô hình local-first và đặt quyền riêng tư lên hàng đầu. Ứng dụng tiếp nhận và phân tích các tệp tài liệu (PDF) trực tiếp trên thiết bị của người dùng để trích xuất thông tin có dẫn chứng xác thực (evidence-backed), nhận diện hạn chót và tạo nhiệm vụ (tasks/deadlines), phát thông báo nhắc nhở cục bộ, đồng thời chỉ thực hiện các thao tác quan trọng khi có sự xác nhận của người dùng.

---

## Công nghệ sử dụng (Tech Stack)

- **Desktop Runtime:** [Tauri 2](https://v2.tauri.app/) (quản lý vòng đời ứng dụng native, bảo mật và IPC bridge)
- **Frontend:** [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) (giao diện người dùng với Tailwind CSS và shadcn/ui)
- **Native Backend:** [Rust](https://www.rust-lang.org/) (quản lý SQLite nội nhúng với rusqlite, tương tác hệ thống tệp, thông báo hệ thống và khay ứng dụng)

---

## Môi trường phát triển Windows (Mục tiêu V1)

Windows là hệ điều hành mục tiêu chính thức cho việc đóng gói và phát hành (packaging/installer) của phiên bản V1.

### 1. Yêu cầu tiên quyết (Prerequisites)

- **Hệ điều hành:** Windows 10/11 (64-bit).
- **Node.js & npm:** Phiên bản Node.js LTS (khuyến nghị v20 trở lên).
- **Rust & C++ Build Tools:**
  - Rust phiên bản `stable` (yêu cầu tối thiểu `1.77.2` theo `src-tauri/Cargo.toml`).
  - Microsoft C++ Build Tools (MSVC toolchain, có sẵn qua Visual Studio Installer với workload "Desktop development with C++").
- **Microsoft Edge WebView2:** Đã tích hợp sẵn trên Windows 10/11 (WebView2 Evergreen Runtime).
- **Python (Tùy chọn):** Chỉ cần cài đặt Python nếu bạn muốn chạy module OCR cục bộ (PaddleOCR) trong môi trường phát triển. Không bắt buộc cài đặt cho các chức năng giao diện thông thường và không yêu cầu tải các mô hình nặng khi chưa sử dụng.

### 2. Cài đặt dependency

Cài đặt các gói phụ thuộc JavaScript bằng lệnh:

```bash
npm ci
```

### 3. Khởi chạy ứng dụng (Development)

Mở ứng dụng desktop trong môi trường development:

```bash
npm run tauri dev
```

> **Lưu ý quan trọng:** `docnoti` là ứng dụng desktop tích hợp sâu với native layer qua Tauri IPC (kết nối cơ sở dữ liệu SQLite cục bộ, hệ thống tệp bảo mật, khay hệ thống tray icon, thông báo native). **Ứng dụng phải được mở qua Tauri bằng lệnh `npm run tauri dev` thay vì chỉ chạy giao diện web trên trình duyệt với `npm run dev` (Vite localhost)**, vì giao diện web đơn thuần sẽ thiếu các native IPC bindings và không thể truy cập dữ liệu hay hoạt động đúng.

### 4. Các lệnh kiểm tra và xây dựng

- **Kiểm tra mã nguồn (Lint):**
  ```bash
  npm run lint
  ```
  *(Sử dụng Oxlint)*

- **Chạy kiểm thử tự động (Unit Tests):**
  ```bash
  npm test
  ```
  *(Sử dụng Vitest)*

- **Kiểm tra kiểu và biên dịch frontend:**
  ```bash
  npm run build
  ```
  *(Thực thi `tsc -b && vite build`)*

---

## Lưu trữ dữ liệu và Quy tắc an toàn

- **Vị trí lưu trữ dữ liệu:**
  - Cơ sở dữ liệu SQLite (`docnoti.db`), tệp PDF được quản lý (managed documents), trạng thái xử lý và chỉ mục tìm kiếm được lưu trữ độc lập tại thư mục dữ liệu cục bộ của hệ điều hành (mặc định tại `%LOCALAPPDATA%\docnoti` trên Windows, hoặc đường dẫn do người dùng cấu hình trong mục Cài đặt).
  - Trong quá trình phát triển, thư mục `data/` và các tệp cơ sở dữ liệu (`*.db`, `*.db-wal`, `*.sqlite*`) đã được cấu hình trong `.gitignore`.
- **Bảo mật và bảo toàn dữ liệu:**
  - **Tuyệt đối không commit dữ liệu người dùng:** Không commit các file cơ sở dữ liệu thực tế, tệp PDF kiểm thử chứa dữ liệu riêng tư, hoặc dữ liệu nhạy cảm vào Git repository.
  - **Không lưu trữ Secret/API Key trong mã nguồn:** Các API key (như OpenAI API) chỉ được nhập qua giao diện người dùng và lưu trữ an toàn trong Windows Credential Manager thông qua native bridge, không ghi vào tệp cấu hình hay Git.

---

## Môi trường Linux (Fedora) — Hỗ trợ Developer (Best-effort)

Dự án ưu tiên Windows cho phiên bản V1 và **không tuyên bố hỗ trợ bản phát hành hoặc gói cài đặt chính thức (release/installer) cho Linux**. Tuy nhiên, lập trình viên sử dụng Linux (như Fedora) có thể thiết lập môi trường phát triển thử nghiệm theo hình thức best-effort:

### 1. Cài đặt các gói phụ thuộc native của Tauri 2 (Fedora)

Cài đặt các gói phụ thuộc hệ thống theo tài liệu chính thức của Tauri:

```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel dbus-devel pkgconf-pkg-config libxdo-devel
```

Đồng thời đảm bảo hệ thống đã cài đặt Rust toolchain (`rustup`) và Node.js phiên bản LTS.

### 2. Các lệnh thao tác

Sau khi cài đặt xong toolchain và thư viện native, các lệnh làm việc với ứng dụng hoàn toàn giống như trên Windows:

```bash
npm ci                # Cài đặt dependencies
npm run tauri dev     # Mở ứng dụng desktop
npm run lint          # Kiểm tra mã nguồn
npm test              # Chạy test
npm run build         # Build frontend
```
