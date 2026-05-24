import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { TrendingUp } from 'lucide-react';
import { FilterBar } from './FilterBar';
import { TrendChart } from './TrendChart';
import { useAggregatedTrends, type Dimension, type Metric } from './useAggregatedTrends';

export function Analytics() {
    const t = useTranslations('navbar');
    const [dimension, setDimension] = useState<Dimension>('model');
    const [metric, setMetric] = useState<Metric>('requests');

    const { data, keys, isLoading } = useAggregatedTrends(dimension, metric);

    return (
        <div className="flex h-full flex-col gap-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold flex items-center gap-2">
                        <TrendingUp className="size-5" />
                        {t('analytics')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        基于客户端日志数据的高级趋势聚合分析
                    </p>
                </div>
            </div>
            
            <FilterBar 
                dimension={dimension} 
                onDimensionChange={setDimension}
                metric={metric}
                onMetricChange={setMetric}
            />

            <div className="flex-1 rounded-xl border bg-card p-4 min-h-[400px]">
                <TrendChart data={data} keys={keys} isLoading={isLoading} />
            </div>
        </div>
    );
}
