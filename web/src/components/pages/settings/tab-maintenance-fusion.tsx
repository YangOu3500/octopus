'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
    Activity,
    ArrowRight,
    CheckCircle2,
    CircleDashed,
    Download,
    Eye,
    GitBranch,
    ListChecks,
    Network,
    Search,
    Settings2,
    Thermometer,
    TriangleAlert,
    type LucideIcon,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavStore, type NavItem } from '@/stores/nav';
import { cn } from '@/lib/utils';

type CapabilityStatus = 'done' | 'partial' | 'planned';
type CapabilitySource = 'ccLoad' | 'AxonHub' | 'both' | 'octopus';

type Capability = {
    id: string;
    status: CapabilityStatus;
    source: CapabilitySource;
    nav?: NavItem;
    icon: LucideIcon;
};

type StatusFilter = CapabilityStatus | 'all';
type SourceFilter = CapabilitySource | 'all';
type EntryFilter = NavItem | 'all';

const capabilityStatuses: CapabilityStatus[] = ['done', 'partial', 'planned'];
const capabilitySources: CapabilitySource[] = ['both', 'AxonHub', 'ccLoad', 'octopus'];

const capabilities: Capability[] = [
    { id: 'responseValidator', status: 'done', source: 'ccLoad', nav: 'log', icon: CheckCircle2 },
    { id: 'failoverRetry', status: 'done', source: 'ccLoad', nav: 'group', icon: GitBranch },
    { id: 'streamGate', status: 'done', source: 'ccLoad', nav: 'setting', icon: ListChecks },
    { id: 'traceAttempts', status: 'done', source: 'both', nav: 'traces', icon: Eye },
    { id: 'healthCooldown', status: 'partial', source: 'both', nav: 'setting', icon: Settings2 },
    { id: 'channelModelHealth', status: 'done', source: 'both', nav: 'modelHealth', icon: Thermometer },
    { id: 'selectionTracker', status: 'done', source: 'AxonHub', nav: 'group', icon: Activity },
    { id: 'channelConcurrency', status: 'done', source: 'AxonHub', nav: 'setting', icon: Network },
    { id: 'distributedQueue', status: 'partial', source: 'AxonHub', nav: 'setting', icon: Network },
    { id: 'slowProbe', status: 'partial', source: 'ccLoad', nav: 'setting', icon: CircleDashed },
    { id: 'costUsage', status: 'done', source: 'AxonHub', nav: 'home', icon: CheckCircle2 },
    { id: 'modelTest', status: 'done', source: 'ccLoad', nav: 'modelTest', icon: ListChecks },
    { id: 'groupAutoGenerate', status: 'done', source: 'octopus', nav: 'group', icon: CheckCircle2 },
    { id: 'modelAssociation', status: 'partial', source: 'AxonHub', nav: 'group', icon: GitBranch },
    { id: 'protocolTransform', status: 'partial', source: 'AxonHub', nav: 'log', icon: GitBranch },
    { id: 'liveDebug', status: 'partial', source: 'ccLoad', nav: 'log', icon: TriangleAlert },
    { id: 'safeDiagnosticsExport', status: 'done', source: 'both', nav: 'log', icon: Download },
    { id: 'quotaStatus', status: 'done', source: 'both', nav: 'modelHealth', icon: CircleDashed },
];

function statusClass(status: CapabilityStatus) {
    switch (status) {
        case 'done':
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-355';
        case 'partial':
            return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-350';
        case 'planned':
        default:
            return 'border-muted-foreground/30 bg-muted text-muted-foreground';
    }
}

function sourceLabel(source: Capability['source'], t: (key: string, values?: Record<string, string | number>) => string) {
    if (source === 'both') return t('fusionCapabilities.sources.both');
    return source === 'ccLoad' ? 'ccLoad' : source === 'AxonHub' ? 'AxonHub' : 'Octopus';
}

export function SettingFusionCapabilities() {
    const t = useTranslations('setting');
    const setActiveItem = useNavStore((state) => state.setActiveItem);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [entryFilter, setEntryFilter] = useState<EntryFilter>('all');

    const counts = useMemo(() => {
        const acc = { done: 0, partial: 0, planned: 0 };
        capabilities.forEach((c) => acc[c.status]++);
        return acc;
    }, []);

    const filteredCapabilities = useMemo(() => capabilities.filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
        if (entryFilter !== 'all' && item.nav !== entryFilter) return false;
        if (!query.trim()) return true;

        const normQuery = query.trim().toLowerCase();
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

        return searchText.includes(normQuery);
    }), [entryFilter, query, sourceFilter, statusFilter, t]);

    return (
        <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-1 pb-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                    <Eye className="h-4 w-4 text-primary" />
                    {t('fusionCapabilities.title')}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                    {capabilityStatuses.map((status) => (
                        <Badge key={status} variant="outline" className={cn('rounded-md text-[10px]', statusClass(status))}>
                            {t(`fusionCapabilities.status.${status}`)} {counts[status]}
                        </Badge>
                    ))}
                </div>
            </div>

            <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="details" className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs px-4">
                    <AccordionTrigger className="py-3 hover:no-underline">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                            <span className="text-xs font-semibold text-card-foreground">{t('fusionCapabilities.columns.capability')}</span>
                            <span className="text-[10px] text-muted-foreground">
                                {t('fusionCapabilities.filters.summary', { shown: filteredCapabilities.length, total: capabilities.length })}
                            </span>
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 pt-0 space-y-4">
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={t('fusionCapabilities.filters.searchPlaceholder')}
                                    className="h-8 rounded-lg pl-9 text-xs bg-background"
                                />
                            </div>
                            <div className="flex flex-wrap gap-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 rounded-lg text-xs"
                                    onClick={() => {
                                        setQuery('');
                                        setStatusFilter('all');
                                        setSourceFilter('all');
                                        setEntryFilter('all');
                                    }}
                                >
                                    {t('fusionCapabilities.filters.clear')}
                                </Button>
                            </div>
                        </div>

                        {/* Filters list */}
                        <div className="flex flex-wrap gap-1 border-t border-border/40 pt-3">
                            {capabilityStatuses.map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
                                    className={cn(
                                        "px-2 py-0.5 border rounded-md text-[10px] transition-colors",
                                        statusFilter === status ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/40"
                                    )}
                                >
                                    {t(`fusionCapabilities.status.${status}`)}
                                </button>
                            ))}
                            {capabilitySources.map((source) => (
                                <button
                                    key={source}
                                    onClick={() => setSourceFilter(sourceFilter === source ? 'all' : source)}
                                    className={cn(
                                        "px-2 py-0.5 border rounded-md text-[10px] transition-colors",
                                        sourceFilter === source ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/40"
                                    )}
                                >
                                    {sourceLabel(source, t)}
                                </button>
                            ))}
                        </div>

                        {/* Capabilities Rows */}
                        <div className="grid gap-2 max-h-80 overflow-y-auto pr-1 border-t border-border/40 pt-3 custom-scrollbar">
                            {filteredCapabilities.length === 0 ? (
                                <div className="text-center py-6 text-xs text-muted-foreground">
                                    {t('fusionCapabilities.filters.noResults')}
                                </div>
                            ) : (
                                filteredCapabilities.map((item) => (
                                    <div key={item.id} className="rounded-xl border border-border/60 bg-muted/15 p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                                            <div className="flex items-start gap-2">
                                                <item.icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="text-xs font-semibold text-foreground/90">
                                                        {t(`fusionCapabilities.items.${item.id}.name`)}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                                                        {t(`fusionCapabilities.items.${item.id}.desc`)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <Badge variant="outline" className={cn('rounded-md text-[9px] font-normal px-1.5', statusClass(item.status))}>
                                                    {t(`fusionCapabilities.status.${item.status}`)}
                                                </Badge>
                                                <Badge variant="outline" className="rounded-md text-[9px] font-normal px-1.5 bg-background">
                                                    {sourceLabel(item.source, t)}
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2 text-[10px] bg-background p-2 rounded-lg">
                                            <div>
                                                <span className="text-muted-foreground block mb-0.5">{t('fusionCapabilities.columns.ui')}</span>
                                                <span className="text-foreground/95">{t(`fusionCapabilities.items.${item.id}.ui`)}</span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground block mb-0.5">{t('fusionCapabilities.columns.gap')}</span>
                                                <span className="text-foreground/95">{t(`fusionCapabilities.items.${item.id}.gap`)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between border-t border-border/20 pt-2 text-[10px]">
                                            <span className="text-muted-foreground">
                                                {t('fusionCapabilities.columns.entry')}: {item.nav ? t(`fusionCapabilities.nav.${item.nav}`) : '-'}
                                            </span>
                                            {item.nav && (
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveItem(item.nav!)}
                                                    className="flex items-center gap-1 text-primary hover:underline font-medium"
                                                >
                                                    {t(`fusionCapabilities.nav.${item.nav}`)}
                                                    <ArrowRight className="size-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
}
export { SettingFusionCapabilities as SettingFusion };
