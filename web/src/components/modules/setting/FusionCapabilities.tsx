'use client';

import { useTranslations } from 'next-intl';
import { Activity, ArrowRight, CheckCircle2, CircleDashed, Eye, GitBranch, ListChecks, Settings2, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavStore, type NavItem } from '@/components/modules/navbar';
import { cn } from '@/lib/utils';

type CapabilityStatus = 'done' | 'partial' | 'planned';

type Capability = {
    id: string;
    status: CapabilityStatus;
    source: 'ccLoad' | 'AxonHub' | 'both' | 'octopus';
    nav?: NavItem;
    icon: LucideIcon;
};

const capabilities: Capability[] = [
    { id: 'responseValidator', status: 'done', source: 'ccLoad', nav: 'log', icon: CheckCircle2 },
    { id: 'failoverRetry', status: 'done', source: 'ccLoad', nav: 'group', icon: GitBranch },
    { id: 'streamGate', status: 'done', source: 'ccLoad', nav: 'setting', icon: ListChecks },
    { id: 'traceAttempts', status: 'done', source: 'both', nav: 'log', icon: Eye },
    { id: 'healthCooldown', status: 'partial', source: 'both', nav: 'setting', icon: Settings2 },
    { id: 'selectionTracker', status: 'done', source: 'AxonHub', nav: 'group', icon: Activity },
    { id: 'slowProbe', status: 'partial', source: 'ccLoad', nav: 'setting', icon: CircleDashed },
    { id: 'costUsage', status: 'done', source: 'AxonHub', nav: 'home', icon: CheckCircle2 },
    { id: 'modelTest', status: 'done', source: 'ccLoad', nav: 'modelTest', icon: ListChecks },
    { id: 'groupAutoGenerate', status: 'done', source: 'octopus', nav: 'group', icon: CheckCircle2 },
    { id: 'protocolTransform', status: 'partial', source: 'AxonHub', nav: 'log', icon: GitBranch },
    { id: 'liveDebug', status: 'planned', source: 'ccLoad', nav: 'log', icon: TriangleAlert },
    { id: 'quotaStatus', status: 'partial', source: 'both', nav: 'group', icon: CircleDashed },
];

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

    const counts = capabilities.reduce(
        (acc, item) => {
            acc[item.status] += 1;
            return acc;
        },
        { done: 0, partial: 0, planned: 0 } satisfies Record<CapabilityStatus, number>,
    );

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
                        {capabilities.map((item) => {
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
                                                onClick={() => setActiveItem(item.nav!)}
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
