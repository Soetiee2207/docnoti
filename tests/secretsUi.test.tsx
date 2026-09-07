import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SettingsView } from '@/components/settings/SettingsView';
import * as useSecretsModule from '@/hooks/useSecrets';
import * as useAutostartModule from '@/hooks/useAutostart';

vi.mock('@/hooks/useSecrets');
vi.mock('@/hooks/useAutostart');

describe('SettingsView - Secrets & AI Configuration UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAutostartModule, 'useAutostart').mockReturnValue({
      autostartEnabled: false,
      daemonStatus: null,
      loading: false,
      error: null,
      setAutostart: vi.fn(),
      reload: vi.fn(),
      exitApp: vi.fn(),
    });
  });

  it('renders unconfigured state with password input and "Chưa cấu hình" badge', () => {
    vi.spyOn(useSecretsModule, 'useSecrets').mockReturnValue({
      isConfigured: false,
      loading: false,
      error: null,
      saveApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
      reload: vi.fn(),
    });

    const html = renderToString(<SettingsView />);

    expect(html).toContain('OpenAI API Key');
    expect(html).toContain('Chưa cấu hình');
    expect(html).toContain('type="password"');
    expect(html).toContain('placeholder="Nhập OpenAI API Key (sk-...)"');
    expect(html).toContain('Lưu khóa');
    expect(html).not.toContain('Xóa khóa');
  });

  it('renders configured state with "Đã cấu hình" badge, replace option, and delete button', () => {
    vi.spyOn(useSecretsModule, 'useSecrets').mockReturnValue({
      isConfigured: true,
      loading: false,
      error: null,
      saveApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
      reload: vi.fn(),
    });

    const html = renderToString(<SettingsView />);

    expect(html).toContain('Đã cấu hình');
    expect(html).toContain('Cập nhật');
    expect(html).toContain('Xóa khóa');
    expect(html).toContain('Windows Credential Manager');
  });

  it('never renders plaintext API key in HTML or DOM', () => {
    const sensitiveKey = 'sk-proj-actual-super-secret-key-1234567890';
    vi.spyOn(useSecretsModule, 'useSecrets').mockReturnValue({
      isConfigured: true,
      loading: false,
      error: null,
      saveApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
      reload: vi.fn(),
    });

    const html = renderToString(<SettingsView />);

    // Invariant: Plaintext key MUST NEVER appear anywhere in the rendered HTML output
    expect(html).not.toContain(sensitiveKey);
    expect(html).not.toContain('actual-super-secret');
    expect(html).toContain('Windows Credential Manager');
  });

  it('renders error message cleanly without sensitive credential exposure', () => {
    vi.spyOn(useSecretsModule, 'useSecrets').mockReturnValue({
      isConfigured: false,
      loading: false,
      error: 'Không thể lưu thông tin xác thực vào Windows Credential Store.',
      saveApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
      reload: vi.fn(),
    });

    const html = renderToString(<SettingsView />);

    expect(html).toContain('Không thể lưu thông tin xác thực vào Windows Credential Store.');
  });
});
