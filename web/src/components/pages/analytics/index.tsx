'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAggregatedTrends, type Dimension, type Metric } from './use-aggregated-trends';
import { TrendChart } from './trend-chart';

export function Analytics() {
    const t = useTranslations('analytics');
    const [dimension, setDimension] = useState<Dimension>('model');
    const [metric, setMetric] = useState<Metric>('requests');

    const { data, keys, isLoading } = useAggregatedTrends(dimension, metric);

    return (
        <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted border border-border mt-1">
                        <TrendingUp className="size-5 text-foreground stroke-[1.5]" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('description')}</p>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-4 p-4 border border-border rounded-xl bg-card">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t('dimension')}</span>
                    <Select value={dimension} onValueChange={(v) => setDimension(v as Dimension)}>
                        <SelectTrigger className="w-36 h-9 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem className="text-xs" value="model">{t('dimensions.model')}</SelectItem>
                            <SelectItem className="text-xs" value="channel">{t('dimensions.channel')}</SelectItem>
                            <SelectItem className="text-xs" value="status">{t('dimensions.status')}</SelectItem>
                            <SelectItem className="text-xs" value="source">{t('dimensions.source')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t('metric')}</span>
                    <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
                        <SelectTrigger className="w-40 h-9 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem className="text-xs" value="requests">{t('metrics.requests')}</SelectItem>
                            <SelectItem className="text-xs" value="tokens">{t('metrics.tokens')}</SelectItem>
                            <SelectItem className="text-xs" value="cost">{t('metrics.cost')}</SelectItem>
                            <SelectItem className="text-xs" value="latency">{t('metrics.latency')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Chart Container */}
            <div className="rounded-xl border border-border bg-card p-6 shadow-xs min-h-[340px] flex flex-col justify-between">
                <div className="flex-1 w-100 flex items-center justify-center">
                    <TrendChart data={data} keys={keys} isLoading={isLoading} />
                </div>
            </div>
        </div>
    );
}

export default Analytics;
