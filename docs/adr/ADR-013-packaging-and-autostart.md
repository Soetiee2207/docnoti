# ADR-013: Packaging and Autostart

- **Status:** Accepted
- **Date:** 2026-09-06
- **Decision Type:** Architecture
- **Scope:** Desktop packaging, installation, and Windows startup behavior

---

## Context

`docnoti` is a Windows-first desktop application and must be usable by non-technical users.

The application needs to:

- be distributed as an installable desktop application;
- start normally from Windows;
- optionally start automatically with Windows;
- support background processing after startup;
- support watched folders;
- support runtime notifications;
- keep application data separate from the installed application files;
- provide a production build without requiring Node.js or a development environment.

The packaging mechanism must be compatible with the Tauri 2 desktop runtime selected in ADR-001.

---

## Decision

`docnoti` will use **Tauri 2 Bundler** for production packaging and distribution.

Autostart will use the **Tauri autostart capability/plugin**.

Architecture:

```text
Source Code
    ↓
Vite Build
    ↓
Tauri 2 Build
    ↓
Tauri Bundler
    ↓
Windows Installer / Application Package
    ↓
Installed docnoti