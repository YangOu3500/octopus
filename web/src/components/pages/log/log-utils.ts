'use client';

import type { useTranslations } from 'next-intl';
import type { ChannelAttempt } from '@/api/endpoints/log';

export const PAGE_SIZE = 20;
export const LOG_EXPORT_VERSION = 1;
export const ACTIVE_DEBUG_EXPORT_VERSION = 2;
export const LOG_DETAIL_EXPORT_VERSION = 1;

export type LogTranslations = ReturnType<typeof useTranslations>;

export function hasNumber(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function formatDuration(ms: number | null | undefined): string {
    if (!hasNumber(ms)) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function formatCost(value: number | null | undefined): string {
    if (!hasNumber(value)) return '—';
    return value.toFixed(6);
}

export function formatDateTime(value: number | null | undefined): string {
    if (!hasNumber(value) || value <= 0) return '—';
    const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestamp).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

export function formatClientIP(value: string | null | undefined): string {
    const ip = value?.trim();
    if (!ip) return '—';
    const ipv4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
    if (ipv4) return `${ipv4[1]}.*`;
    if (ip.includes(':') && ip.length > 24) return `${ip.slice(0, 20)}…`;
    return ip;
}

export function sanitizeErrorMessage(raw: string | undefined | null): string {
    if (!raw) return '';
    let text = raw.replace(/^upstream error:\s*(\d+):\s*/i, (_m, code) => `[HTTP ${code}] `);
    if (/<\/?(html|body|head|title|div|p|h[1-6]|br|script|style)[\s>]/i.test(text)) {
        const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const h1Match = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const summarySource = titleMatch?.[1] || h1Match?.[1] || '';
        const summary = summarySource
            ? summarySource.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
            : '(HTML response)';
        const stripped = text
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/\s+/g, ' ')
            .trim();
        const detail = stripped.length > 500 ? `${stripped.slice(0, 500)}…` : stripped;
        text = summary && detail && detail !== summary ? `${summary} — ${detail}` : (summary || detail || '(HTML response)');
    }
    return text;
}

export function sanitizeLogExportText(value: string | undefined | null, maxLength = 500): string | undefined {
    if (!value) return undefined;
    let text = value
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_API_KEY]')
        .replace(/\b(cookie|set-cookie|authorization|x-api-key)\s*[:=]\s*[^,\s;]+/gi, '$1=[REDACTED]')
        .replace(/\s+/g, ' ')
        .trim();

    if (!text) return undefined;
    if (text.length > maxLength) text = `${text.slice(0, maxLength)}...`;
    return text;
}

export function sanitizeBaseURLForExport(value: string | undefined | null): string | undefined {
    const raw = value?.trim();
    if (!raw) return undefined;
    try {
        const parsed = new URL(raw);
        parsed.username = '';
        parsed.password = '';
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return sanitizeLogExportText(raw, 240);
    }
}

export function compactObject<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    );
}

export function downloadJson(filename: string, payload: unknown): void {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function formatEntity(label: string, id: number | null | undefined, name?: string | null): string {
    const trimmed = name?.trim();
    if (trimmed) return id ? `${trimmed} (#${id})` : trimmed;
    return id ? `${label} #${id}` : '—';
}

export function statusBadgeClass(status: string | undefined): string {
    switch ((status ?? '').toLowerCase()) {
        case 'success':
            return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none';
        case 'failed':
            return 'bg-destructive/10 text-destructive border-none';
        case 'canceled':
            return 'bg-muted text-muted-foreground border-none';
        case 'circuit_break':
            return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-none';
        case 'skipped':
            return 'bg-muted text-muted-foreground border-none';
        default:
            return 'border-border bg-background text-muted-foreground';
    }
}

export function statusContainerClass(status: string | undefined): string {
    switch ((status ?? '').toLowerCase()) {
        case 'success':
            return 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10';
        case 'failed':
            return 'bg-destructive/5 border-destructive/20 hover:bg-destructive/10';
        case 'circuit_break':
            return 'bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10';
        case 'skipped':
            return 'bg-muted/40 border-border/60 hover:bg-muted/60';
        default:
            return 'border-border hover:bg-muted/30';
    }
}

export function protocolPath(attempt: ChannelAttempt): string {
    const parts = [attempt.request_protocol, attempt.upstream_protocol, attempt.response_protocol]
        .map((item) => item?.trim())
        .filter(Boolean);
    return parts.length > 0 ? parts.join(' -> ') : '—';
}

export function hasQueueMetadata(attempt: ChannelAttempt): boolean {
    return Boolean(
        attempt.channel_concurrency_mode
        || attempt.channel_concurrency_limit
        || attempt.channel_concurrency_wait_ms
        || attempt.channel_concurrency_acquired
        || attempt.channel_concurrency_timed_out,
    );
}

export function hasCapacityMetadata(attempt: ChannelAttempt): boolean {
    return Boolean(
        attempt.quota_status
        || attempt.quota_reason
        || attempt.capacity_status
        || attempt.capacity_reason
        || attempt.capacity_scope
        || attempt.capacity_source
        || attempt.last_observed_at
        || attempt.expires_at,
    );
}
