'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Activity, ArrowRight, CheckCircle2, CircleDashed, Download, Eye, GitBranch, ListChecks, Network, Search, Settings2, Thermometer, TriangleAlert, type LucideIcon } from 'lucide-react';
import { toast } from '@/components/common/Toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavStore, type NavItem } from '@/components/modules/navbar';
import { useChannelTabStore, type ChannelTab } from '@/components/modules/channel/tab-store';
import { cn } from '@/lib/utils';

type CapabilityStatus = 'done' | 'partial' | 'planned';
type CapabilitySource = 'ccLoad' | 'AxonHub' | 'both' | 'octopus';

type Capability = {
    id: string;
    status: CapabilityStatus;
    source: CapabilitySource;
    nav?: NavItem;
    channelTab?: ChannelTab;
    icon: LucideIcon;
};

type StatusFilter = CapabilityStatus | 'all';
type SourceFilter = CapabilitySource | 'all';

const capabilityStatuses: CapabilityStatus[] = ['done', 'partial', 'planned'];
const capabilitySources: CapabilitySource[] = ['both', 'AxonHub', 'ccLoad', 'octopus'];
const capabilityEntries = ['home', 'log', 'traces', 'channel', 'group', 'modelTest', 'setting'] as const satisfies readonly NavItem[];
type CapabilityEntry = (typeof capabilityEntries)[number];
type EntryFilter = CapabilityEntry | 'all';

const capabilities: Capability[] = [
    { id: 'responseValidator', status: 'done', source: 'ccLoad', nav: 'log', icon: CheckCircle2 },
    { id: 'failoverRetry', status: 'done', source: 'ccLoad', nav: 'group', icon: GitBranch },
    { id: 'streamGate', status: 'done', source: 'ccLoad', nav: 'setting', icon: ListChecks },
    { id: 'traceAttempts', status: 'done', source: 'both', nav: 'traces', icon: Eye },
    { id: 'healthCooldown', status: 'partial', source: 'both', nav: 'setting', icon: Settings2 },
    { id: 'channelModelHealth', status: 'done', source: 'both', nav: 'channel', channelTab: 'health', icon: Thermometer },
    { id: 'selectionTracker', status: 'done', source: 'AxonHub', nav: 'group', icon: Activity },
    { id: 'channelConcurrency', status: 'done', source: 'AxonHub', nav: 'setting', icon: Network },
    { id: 'slowProbe', status: 'partial', source: 'ccLoad', nav: 'setting', icon: CircleDashed },
    { id: 'costUsage', status: 'done', source: 'AxonHub', nav: 'home', icon: CheckCircle2 },
    { id: 'modelTest', status: 'done', source: 'ccLoad', nav: 'modelTest', icon: ListChecks },
    { id: 'groupAutoGenerate', status: 'done', source: 'octopus', nav: 'group', icon: CheckCircle2 },
    { id: 'modelAssociation', status: 'done', source: 'AxonHub', nav: 'group', icon: GitBranch },
    { id: 'protocolTransform', status: 'partial', source: 'AxonHub', nav: 'log', icon: GitBranch },
    { id: 'liveDebug', status: 'partial', source: 'ccLoad', nav: 'log', icon: TriangleAlert },
    { id: 'safeDiagnosticsExport', status: 'done', source: 'both', nav: 'log', icon: Download },
    { id: 'quotaStatus', status: 'done', source: 'both', nav: 'channel', channelTab: 'health', icon: CircleDashed },
];

const FUSION_CAPABILITY_EXPORT_VERSION = 3;

function emptyStatusCounts(): Record<CapabilityStatus, number> {
    return { done: 0, partial: 0, planned: 0 };
}

function exportTimestamp() {
    return new Date().toISOString();
}

function exportFilenameTimestamp() {
    return exportTimestamp().replace(/[:.]/g, '-');
}

function downloadJson(filename: string, payload: unknown) {
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

function statusClass(status: CapabilityStatus) {
    switch (status) {
        case 'done':
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
        case 'partial':
            return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
        case 'planned':
        default:
            return 'border-muted-foreground/30 bg-muted text-muted-foreground';
    }
}

function sourceLabel(source: Capability['source'], t: ReturnType<typeof useTranslations<'setting'>>) {
    switch (source) {
        case 'ccLoad':
            return 'ccLoad';
        case 'AxonHub':
            return 'AxonHub';
        case 'both':
            return t('fusionCapabilities.sources.both');
        case 'octopus':
        default:
            return 'Octopus';
    }
}

export function SettingFusionCapabilities() {
    const t = useTranslations('setting');
    const setActiveItem = useNavStore((state) => state.setActiveItem);
    const setChannelTab = useChannelTabStore((state) => state.setActiveTab);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [entryFilter, setEntryFilter] = useState<EntryFilter>('all');

    const counts = capabilities.reduce(
        (acc, item) => {
            acc[item.status] += 1;
            return acc;
        },
        { done: 0, partial: 0, planned: 0 } satisfies Record<CapabilityStatus, number>,
    );

    const sourceCounts = capabilities.reduce(
        (acc, item) => {
            acc[item.source] += 1;
            return acc;
        },
        { ccLoad: 0, AxonHub: 0, both: 0, octopus: 0 } satisfies Record<CapabilitySource, number>,
    );

    const sourceStatusCounts = capabilities.reduce(
        (acc, item) => {
            acc[item.source][item.status] += 1;
            return acc;
        },
        {
            ccLoad: emptyStatusCounts(),
            AxonHub: emptyStatusCounts(),
            both: emptyStatusCounts(),
            octopus: emptyStatusCounts(),
        } satisfies Record<CapabilitySource, Record<CapabilityStatus, number>>,
    );

    const entryCounts = capabilityEntries.reduce((acc, entry) => {
        acc[entry] = capabilities.filter((item) => item.nav === entry).length;
        return acc;
    }, {} as Record<CapabilityEntry, number>);

    const entryStatusCounts = capabilityEntries.reduce((acc, entry) => {
        acc[entry] = capabilities.reduce((statusAcc, item) => {
            if (item.nav === entry) statusAcc[item.status] += 1;
            return statusAcc;
        }, emptyStatusCounts());
        return acc;
    }, {} as Record<CapabilityEntry, Record<CapabilityStatus, number>>);

    const sourceOptions: SourceFilter[] = ['all', ...capabilitySources];
    const statusOptions: StatusFilter[] = ['all', ...capabilityStatuses];
    const entryOptions: EntryFilter[] = ['all', ...capabilityEntries];
    const normalizedQuery = query.trim().toLowerCase();

    const filteredCapabilities = useMemo(() => capabilities.filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
        if (entryFilter !== 'all' && item.nav !== entryFilter) return false;
        if (!normalizedQuery) return true;

        const searchText = [
            item.id,
            sourceLabel(item.source, t),
            item.nav ? t(`fusionCapabilities.nav.${item.nav}`) : '',
            t(`fusionCapabilities.status.${item.status}`),
            t(`fusionCapabilities.items.${item.id}.name`),
            t(`fusionCapabilities.items.${item.id}.desc`),
            t(`fusionCapabilities.items.${item.id}.ui`),
            t(`fusionCapabilities.items.${item.id}.gap`),
        ].join(' ').toLowerCase();

        return searchText.includes(normalizedQuery);
    }), [entryFilter, normalizedQuery, sourceFilter, statusFilter, t]);

    const hasActiveFilters = normalizedQuery.length > 0 || statusFilter !== 'all' || sourceFilter !== 'all' || entryFilter !== 'all';

    const exportCurrentView = () => {
        if (filteredCapabilities.length === 0) {
            toast.warning(t('fusionCapabilities.export.empty'));
            return;
        }

        const exportedAt = exportTimestamp();
        downloadJson(`octopus-fusion-capabilities-${exportFilenameTimestamp()}.json`, {
            export_version: FUSION_CAPABILITY_EXPORT_VERSION,
            exported_at: exportedAt,
            safety_note: t('fusionCapabilities.export.safe'),
            filters: {
                query: query.trim(),
                status: statusFilter,
                source: sourceFilter,
                entry: entryFilter,
            },
            counts: {
                shown: filteredCapabilities.length,
                total: capabilities.length,
                statuses: counts,
                sources: sourceCounts,
                statuses_by_source: sourceStatusCounts,
                entries: entryCounts,
                statuses_by_entry: entryStatusCounts,
            },
            capabilities: filteredCapabilities.map((item) => ({
                id: item.id,
                status: item.status,
                status_label: t(`fusionCapabilities.status.${item.status}`),
                source: item.source,
                source_label: sourceLabel(item.source, t),
                entry: item.nav ? item.nav : undefined,
                entry_label: item.nav ? t(`fusionCapabilities.nav.${item.nav}`) : undefined,
                channel_tab: item.channelTab,
                name: t(`fusionCapabilities.items.${item.id}.name`),
                description: t(`fusionCapabilities.items.${item.id}.desc`),
                current_ui: t(`fusionCapabilities.items.${item.id}.ui`),
                remaining_gap: t(`fusionCapabilities.items.${item.id}.gap`),
            })),
        });
        toast.success(t('fusionCapabilities.export.success'), {
            description: t('fusionCapabilities.export.safe'),
        });
    };

    return (
        <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
                        <Eye className="h-5 w-5" />
                        {t('fusionCapabilities.title')}
                    </h2>
                    <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
                        {t('fusionCapabilities.subtitle')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {(['done', 'partial', 'planned'] as CapabilityStatus[]).map((status) => (
                        <Badge key={status} variant="outline" className={cn('rounded-md', statusClass(status))}>
                            {t(`fusionCapabilities.status.${status}`)} {counts[status]}
                        </Badge>
                    ))}
                </div>
            </div>

            <div className="mb-4 rounded-lg border border-border bg-background/40 p-3">
                <div className="mb-3 flex flex-col gap-1">
                    <div className="text-sm font-medium text-card-foreground">
                        {t('fusionCapabilities.coverage.title')}
                    </div>
                    <div className="text-xs leading-relaxed text-muted-foreground">
                        {t('fusionCapabilities.coverage.description')}
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {capabilitySources.map((source) => (
                        <button
                            key={source}
                            type="button"
                            className={cn(
                                'rounded-lg border border-border bg-card/60 p-3 text-left transition-colors hover:bg-muted/50',
                                sourceFilter === source && 'border-primary/60 bg-primary/5',
                            )}
                            onClick={() => setSourceFilter(source)}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium text-card-foreground">
                                    {sourceLabel(source, t)}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    {t('fusionCapabilities.coverage.total', { count: sourceCounts[source] })}
                                </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {capabilityStatuses.map((status) => (
                                    <Badge key={status} variant="outline" className={cn('rounded-md text-[11px]', statusClass(status))}>
                                        {t(`fusionCapabilities.status.${status}`)} {sourceStatusCounts[source][status]}
                                    </Badge>
                                ))}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-4 rounded-lg border border-border bg-background/40 p-3">
                <div className="mb-3 flex flex-col gap-1">
                    <div className="text-sm font-medium text-card-foreground">
                        {t('fusionCapabilities.entryCoverage.title')}
                    </div>
                    <div className="text-xs leading-relaxed text-muted-foreground">
                        {t('fusionCapabilities.entryCoverage.description')}
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7">
                    {capabilityEntries.map((entry) => (
                        <button
                            key={entry}
                            type="button"
                            className={cn(
                                'rounded-lg border border-border bg-card/60 p-3 text-left transition-colors hover:bg-muted/50',
                                entryFilter === entry && 'border-primary/60 bg-primary/5',
                            )}
                            onClick={() => setEntryFilter(entry)}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium text-card-foreground">
                                    {t(`fusionCapabilities.nav.${entry}`)}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    {t('fusionCapabilities.entryCoverage.total', { count: entryCounts[entry] })}
                                </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {capabilityStatuses.map((status) => (
                                    <Badge key={status} variant="outline" className={cn('rounded-md text-[11px]', statusClass(status))}>
                                        {t(`fusionCapabilities.status.${status}`)} {entryStatusCounts[entry][status]}
                                    </Badge>
                                ))}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-4 space-y-3 rounded-lg border border-border bg-background/40 p-3">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-center">
                    <div className="relative min-w-0">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t('fusionCapabilities.filters.searchPlaceholder')}
                            className="h-9 rounded-lg pl-9"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                            {t('fusionCapabilities.filters.summary', {
                                shown: filteredCapabilities.length,
                                total: capabilities.length,
                            })}
                        </span>
                        {hasActiveFilters ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-md px-2 text-xs"
                                onClick={() => {
                                    setQuery('');
                                    setStatusFilter('all');
                                    setSourceFilter('all');
                                    setEntryFilter('all');
                                }}
                            >
                                {t('fusionCapabilities.filters.clear')}
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-md px-2 text-xs"
                            disabled={filteredCapabilities.length === 0}
                            onClick={exportCurrentView}
                        >
                            <Download className="size-3.5" />
                            {t('fusionCapabilities.export.button')}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {statusOptions.map((status) => (
                        <Button
                            key={status}
                            type="button"
                            variant={statusFilter === status ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 rounded-md px-2 text-xs"
                            onClick={() => setStatusFilter(status)}
                        >
                            {status === 'all'
                                ? t('fusionCapabilities.filters.allStatuses')
                                : `${t(`fusionCapabilities.status.${status}`)} ${counts[status]}`}
                        </Button>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2">
                    {sourceOptions.map((source) => (
                        <Button
                            key={source}
                            type="button"
                            variant={sourceFilter === source ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 rounded-md px-2 text-xs"
                            onClick={() => setSourceFilter(source)}
                        >
                            {source === 'all' ? t('fusionCapabilities.filters.allSources') : sourceLabel(source, t)}
                        </Button>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2">
                    {entryOptions.map((entry) => (
                        <Button
                            key={entry}
                            type="button"
                            variant={entryFilter === entry ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 rounded-md px-2 text-xs"
                            onClick={() => setEntryFilter(entry)}
                        >
                            {entry === 'all'
                                ? t('fusionCapabilities.filters.allEntries')
                                : `${t(`fusionCapabilities.nav.${entry}`)} ${entryCounts[entry]}`}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[920px] text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 font-medium">{t('fusionCapabilities.columns.capability')}</th>
                            <th className="px-3 py-2 font-medium">{t('fusionCapabilities.columns.source')}</th>
                            <th className="px-3 py-2 font-medium">{t('fusionCapabilities.columns.ui')}</th>
                            <th className="px-3 py-2 font-medium">{t('fusionCapabilities.columns.gap')}</th>
                            <th className="px-3 py-2 font-medium">{t('fusionCapabilities.columns.entry')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCapabilities.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                                    {t('fusionCapabilities.filters.noResults')}
                                </td>
                            </tr>
                        ) : filteredCapabilities.map((item) => {
                            const Icon = item.icon;
                            return (
                                <tr key={item.id} className="border-t border-border align-top">
                                    <td className="px-3 py-3">
                                        <div className="flex items-start gap-2">
                                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                            <div className="min-w-0">
                                                <div className="font-medium text-card-foreground">
                                                    {t(`fusionCapabilities.items.${item.id}.name`)}
                                                </div>
                                                <div className="mt-1 text-muted-foreground">
                                                    {t(`fusionCapabilities.items.${item.id}.desc`)}
                                                </div>
                                                <Badge variant="outline" className={cn('mt-2 rounded-md', statusClass(item.status))}>
                                                    {t(`fusionCapabilities.status.${item.status}`)}
                                                </Badge>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-muted-foreground">
                                        {sourceLabel(item.source, t)}
                                    </td>
                                    <td className="px-3 py-3 text-muted-foreground">
                                        {t(`fusionCapabilities.items.${item.id}.ui`)}
                                    </td>
                                    <td className="px-3 py-3 text-muted-foreground">
                                        {t(`fusionCapabilities.items.${item.id}.gap`)}
                                    </td>
                                    <td className="px-3 py-3">
                                        {item.nav ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8 rounded-lg px-2 text-xs"
                                                onClick={() => {
                                                    if (item.channelTab) setChannelTab(item.channelTab);
                                                    setActiveItem(item.nav!);
                                                }}
                                            >
                                                {t(`fusionCapabilities.nav.${item.nav}`)}
                                                <ArrowRight className="size-3.5" />
                                            </Button>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {t('fusionCapabilities.note')}
            </p>
        </div>
    );
}
