import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type Dimension, type Metric } from './useAggregatedTrends';

export function FilterBar({
    dimension,
    onDimensionChange,
    metric,
    onMetricChange,
}: {
    dimension: Dimension;
    onDimensionChange: (v: Dimension) => void;
    metric: Metric;
    onMetricChange: (v: Metric) => void;
}) {
    return (
        <div className="flex items-center gap-4 p-4 border rounded-xl bg-card">
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">分析维度</span>
                <Select value={dimension} onValueChange={(v) => onDimensionChange(v as Dimension)}>
                    <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="model">模型</SelectItem>
                        <SelectItem value="channel">渠道</SelectItem>
                        <SelectItem value="status">状态</SelectItem>
                        <SelectItem value="source">来源</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">指标</span>
                <Select value={metric} onValueChange={(v) => onMetricChange(v as Metric)}>
                    <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="requests">请求数</SelectItem>
                        <SelectItem value="tokens">Tokens消耗</SelectItem>
                        <SelectItem value="cost">成本金额</SelectItem>
                        <SelectItem value="latency">平均耗时</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
