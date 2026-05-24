'use client';

import { KeyRound, ShieldAlert, Zap, Layers, Settings } from 'lucide-react';
import {
    type SiteChannelGroup,
    type SiteChannelModel
} from '@/api/endpoints/site-channel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';

interface ChannelGridProps {
    groups: SiteChannelGroup[];
    onEditKeys: (group: SiteChannelGroup) => void;
    onCreateProjectedChannel: (group: SiteChannelGroup) => void;
    isCreatingProjected: boolean;
    onToggleProjectedChannel: (channelId: number, enabled: boolean) => void;
    togglingChannelIds: Set<number>;
    onEditRoute: (group: SiteChannelGroup, model: SiteChannelModel) => void;
    onToggleModel: (group: SiteChannelGroup, modelName: string, disabled: boolean) => void;
    togglingModelKeys: Set<string>;
}

export function ChannelGrid({
    groups,
    onEditKeys,
    onCreateProjectedChannel,
    isCreatingProjected,
    onToggleProjectedChannel,
    togglingChannelIds,
    onEditRoute,
    onToggleModel,
    togglingModelKeys
}: ChannelGridProps) {
    const getRouteTypeBadge = (routeType: string) => {
        switch (routeType) {
            case 'openai_chat':
                return <Badge className="text-[10px] bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" variant="outline">OpenAI Chat</Badge>;
            case 'openai_response':
                return <Badge className="text-[10px] bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20" variant="outline">OpenAI Response</Badge>;
            case 'anthropic':
                return <Badge className="text-[10px] bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border-purple-500/20" variant="outline">Anthropic</Badge>;
            case 'gemini':
                return <Badge className="text-[10px] bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20" variant="outline">Gemini</Badge>;
            case 'volcengine':
                return <Badge className="text-[10px] bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 border-sky-500/20" variant="outline">火山引擎</Badge>;
            case 'openai_embedding':
                return <Badge className="text-[10px] bg-slate-500/10 text-slate-500 hover:bg-slate-500/20 border-slate-500/20" variant="outline">Embedding</Badge>;
            default:
                return <Badge className="text-[10px] bg-muted text-muted-foreground" variant="outline">Unknown</Badge>;
        }
    };

    return (
        <div className="grid gap-6 grid-cols-1">
            {groups.map((group) => {
                const hasPendingKeys = group.source_keys.some(k => k.value_status === 'masked_pending');

                return (
                    <section
                        key={group.group_key}
                        className="rounded-xl border border-border bg-card p-5 space-y-4"
                    >
                        {/* Group Header */}
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/40 pb-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-semibold">{group.group_name || group.group_key}</h3>
                                    <Badge variant="secondary" className="text-[10px] h-5">
                                        分组 Key: {group.enabled_key_count} / {group.key_count}
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-1 font-mono">{group.group_key}</p>
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg h-8 text-xs"
                                onClick={() => onEditKeys(group)}
                            >
                                <KeyRound className="size-3.5 mr-1.5" />
                                管理源 Key
                            </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            {/* Source Keys List */}
                            <div className="space-y-2">
                                <span className="font-semibold text-xs text-muted-foreground">源 Key 列表</span>
                                <div className="rounded-lg border bg-muted/10 p-3 space-y-2 min-h-16">
                                    {group.source_keys.length === 0 ? (
                                        <div className="text-xs text-muted-foreground italic py-2">无可用源 Key，请同步站点或手动添加</div>
                                    ) : (
                                        group.source_keys.map((key) => (
                                            <div key={key.id} className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-0">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-mono">{key.token_masked}</span>
                                                    <span className="text-[10px] text-muted-foreground">{key.name || '未命名'}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {key.value_status === 'masked_pending' && (
                                                        <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[9px] h-5 py-0">
                                                            <ShieldAlert className="size-3 mr-1" /> 待补全
                                                        </Badge>
                                                    )}
                                                    <Badge variant={key.enabled ? 'default' : 'secondary'} className="text-[9px] h-5 py-0">
                                                        {key.enabled ? '已启用' : '已停用'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Projected Channels */}
                            <div className="space-y-2">
                                <span className="font-semibold text-xs text-muted-foreground">投影渠道</span>
                                <div className="rounded-lg border bg-muted/10 p-3 flex flex-col justify-center min-h-16">
                                    {group.projected_keys.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-2 space-y-2">
                                            <span className="text-xs text-muted-foreground">未生成投影渠道</span>
                                            <Button
                                                size="sm"
                                                className="rounded-lg h-7 text-[10px]"
                                                onClick={() => onCreateProjectedChannel(group)}
                                                disabled={isCreatingProjected || hasPendingKeys}
                                                title={hasPendingKeys ? '必须先补全脱敏的 Key 才能生成投影' : ''}
                                            >
                                                <Zap className="size-3.5 mr-1" />
                                                生成投影渠道
                                            </Button>
                                        </div>
                                    ) : (
                                        group.projected_keys.map((pKey) => (
                                            <div key={pKey.id} className="flex items-center justify-between text-xs py-1">
                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                    <span className="font-semibold truncate">{pKey.channel_name}</span>
                                                    <span className="text-[10px] text-muted-foreground font-mono truncate">{pKey.channel_key_masked}</span>
                                                    <span className="text-[10px] text-muted-foreground">总消耗: ${pKey.total_cost.toFixed(4)}</span>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <Switch
                                                        checked={pKey.enabled}
                                                        disabled={togglingChannelIds.has(pKey.channel_id)}
                                                        onCheckedChange={(checked) => onToggleProjectedChannel(pKey.channel_id, checked)}
                                                        className="scale-90"
                                                    />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Models Whitelist and Routing Table */}
                        <Accordion type="single" collapsible className="border rounded-lg bg-background">
                            <AccordionItem value="models" className="border-none">
                                <AccordionTrigger className="h-9 py-0 px-4 text-xs font-semibold hover:no-underline">
                                    <span className="flex items-center gap-1.5">
                                        <Layers className="size-3.5" />
                                        模型路由及可用性 ({group.models?.length || 0})
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent className="pt-2 px-4 pb-4 border-t border-border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="h-8 text-[11px] font-semibold">模型名称</TableHead>
                                                <TableHead className="h-8 text-[11px] font-semibold">路由类型</TableHead>
                                                <TableHead className="h-8 text-[11px] font-semibold text-center w-[90px]">可用状态</TableHead>
                                                <TableHead className="h-8 text-[11px] font-semibold text-right w-[80px]">路由配置</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(!group.models || group.models.length === 0) ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center py-4 text-xs text-muted-foreground italic">
                                                        无可配置的模型，请确保源 Key 正常并完成同步。
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                group.models.map((model) => {
                                                    const modelKey = `${group.group_key}:${model.model_name}`;
                                                    const isTogglingModel = togglingModelKeys.has(modelKey);

                                                    return (
                                                        <TableRow 
                                                            key={model.model_name} 
                                                            id={`model-row-${group.group_key}-${model.model_name}`}
                                                            className="hover:bg-muted/5 h-10"
                                                        >
                                                            <TableCell className="font-mono text-xs py-1">{model.model_name}</TableCell>
                                                            <TableCell className="py-1">{getRouteTypeBadge(model.route_type)}</TableCell>
                                                            <TableCell className="py-1 text-center">
                                                                <Switch
                                                                    checked={!model.disabled}
                                                                    disabled={isTogglingModel}
                                                                    onCheckedChange={(checked) => onToggleModel(group, model.model_name, !checked)}
                                                                    className="scale-75"
                                                                />
                                                            </TableCell>
                                                            <TableCell className="py-1 text-right">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="size-7 rounded-md"
                                                                    onClick={() => onEditRoute(group, model)}
                                                                >
                                                                    <Settings className="size-3.5" />
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </section>
                );
            })}
        </div>
    );
}
