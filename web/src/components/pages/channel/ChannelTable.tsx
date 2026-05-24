'use client';

import { useTranslations } from 'next-intl';
import { Pencil, Trash2, Link2, KeyRound, Layers3, Activity } from 'lucide-react';
import {
    type Channel,
    ChannelType
} from '@/api/endpoints/channel';
import { type StatsMetricsFormatted } from '@/api/endpoints/stats';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui/tooltip';

interface ChannelTableProps {
    channels: Array<{ raw: Channel; formatted: StatsMetricsFormatted }>;
    onEdit: (channel: Channel) => void;
    onDelete: (id: number) => void;
    onToggle: (id: number, enabled: boolean) => void;
    togglingIds: Set<number>;
}

export function ChannelTable({
    channels,
    onEdit,
    onDelete,
    onToggle,
    togglingIds
}: ChannelTableProps) {
    const t = useTranslations() as unknown as (key: string, values?: Record<string, string | number>) => string;

    const getChannelTypeLabel = (type: ChannelType) => {
        switch (type) {
            case ChannelType.OpenAIChat:
                return t('channel.form.typeOpenAIChat') || 'OpenAI Chat';
            case ChannelType.OpenAIResponse:
                return t('channel.form.typeOpenAIResponse') || 'OpenAI Response';
            case ChannelType.Anthropic:
                return t('channel.form.typeAnthropic') || 'Anthropic';
            case ChannelType.Gemini:
                return t('channel.form.typeGemini') || 'Gemini';
            case ChannelType.Volcengine:
                return t('channel.form.typeVolcengine') || 'Volcengine';
            case ChannelType.OpenAIEmbedding:
                return t('channel.form.typeOpenAIEmbedding') || 'OpenAI Embedding';
            default:
                return 'Unknown';
        }
    };

    return (
        <TooltipProvider>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/30">
                        <TableRow>
                            <TableHead className="w-[180px] h-10 text-xs font-semibold">名称</TableHead>
                            <TableHead className="w-[120px] h-10 text-xs font-semibold">类型</TableHead>
                            <TableHead className="h-10 text-xs font-semibold">上游接口 / 凭证</TableHead>
                            <TableHead className="w-[220px] h-10 text-xs font-semibold">模型范围</TableHead>
                            <TableHead className="w-[160px] h-10 text-xs font-semibold">使用统计</TableHead>
                            <TableHead className="w-[90px] h-10 text-xs font-semibold text-center">状态</TableHead>
                            <TableHead className="w-[100px] h-10 text-xs font-semibold text-right">操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {channels.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-xs text-muted-foreground italic">
                                    暂无渠道数据。
                                </TableCell>
                            </TableRow>
                        ) : (
                            channels.map(({ raw: channel, formatted }) => {
                                const activeKeys = channel.keys?.filter((k) => k.enabled).length ?? 0;
                                const totalKeys = channel.keys?.length ?? 0;
                                const models = channel.model ? channel.model.split(',').filter(Boolean) : [];
                                const customModels = channel.custom_model ? channel.custom_model.split(',').filter(Boolean) : [];
                                const totalModels = models.length + customModels.length;

                                return (
                                    <TableRow 
                                        key={channel.id} 
                                        id={`channel-row-${channel.id}`}
                                        className="hover:bg-muted/10 h-14"
                                    >
                                        <TableCell className="font-medium text-xs max-w-[180px] truncate py-2" title={channel.name}>
                                            {channel.name}
                                        </TableCell>
                                        <TableCell className="py-2">
                                            <Badge variant="outline" className="text-[10px] py-0 h-5">
                                                {getChannelTypeLabel(channel.type)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-2">
                                            <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                                                <div className="flex items-center gap-1">
                                                    <Link2 className="size-3 shrink-0" />
                                                    <span className="truncate max-w-[240px]" title={channel.base_urls?.[0]?.url}>
                                                        {channel.base_urls?.[0]?.url || '直连上游'}
                                                        {channel.base_urls && channel.base_urls.length > 1 && ` (+${channel.base_urls.length - 1})`}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <KeyRound className="size-3 shrink-0" />
                                                    <span>
                                                        激活密钥: {activeKeys} / {totalKeys}
                                                    </span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2">
                                            <div className="flex items-center gap-1.5">
                                                <Layers3 className="size-3.5 text-muted-foreground shrink-0" />
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span className="text-xs font-mono text-foreground cursor-help underline decoration-dotted">
                                                            {totalModels} 个模型
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-[320px] p-2.5 rounded-lg border bg-popover text-popover-foreground shadow-md text-[11px] font-mono leading-relaxed max-h-[200px] overflow-y-auto">
                                                        {totalModels === 0 ? (
                                                            <span>未配置模型</span>
                                                        ) : (
                                                            <div className="flex flex-col gap-1">
                                                                {models.map((m) => (
                                                                    <div key={m} className="flex items-center justify-between">
                                                                        <span className="text-emerald-500 font-semibold">{m}</span>
                                                                        <span className="text-muted-foreground text-[10px]">自动</span>
                                                                    </div>
                                                                ))}
                                                                {customModels.map((m) => (
                                                                    <div key={m} className="flex items-center justify-between">
                                                                        <span className="text-blue-500 font-semibold">{m}</span>
                                                                        <span className="text-muted-foreground text-[10px]">自定义</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2">
                                            <div className="flex flex-col gap-1 text-[10px] font-mono text-muted-foreground">
                                                <div className="flex items-center gap-1">
                                                    <Activity className="size-3 text-emerald-500" />
                                                    <span>成功: {formatted.request_success.formatted.value}{formatted.request_success.formatted.unit} / {formatted.request_count.formatted.value}{formatted.request_count.formatted.unit}</span>
                                                </div>
                                                <div>费用: ${formatted.total_cost.formatted.value}{formatted.total_cost.formatted.unit.replace('$', '')}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-2 text-center">
                                            <Switch
                                                checked={channel.enabled}
                                                disabled={togglingIds.has(channel.id)}
                                                onCheckedChange={(checked) => onToggle(channel.id, checked)}
                                                className="scale-90"
                                            />
                                        </TableCell>
                                        <TableCell className="py-2 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                                    onClick={() => onEdit(channel)}
                                                    title="编辑"
                                                >
                                                    <Pencil className="size-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => onDelete(channel.id)}
                                                    title="删除"
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </TooltipProvider>
    );
}
