'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Trash, RefreshCw, X } from 'lucide-react';
import {
    type Channel,
    ChannelType,
    AutoGroupType,
    type BaseUrl,
    type CustomHeader,
    type ChannelKey,
    useFetchModel,
    type CreateChannelRequest,
    type UpdateChannelRequest
} from '@/api/endpoints/channel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '@/components/ui/accordion';
import { toast } from 'sonner';

interface ChannelFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingChannel: Channel | null;
    onSave: (payload: CreateChannelRequest | UpdateChannelRequest) => Promise<void>;
    isSaving: boolean;
}

export function ChannelFormDialog({
    open,
    onOpenChange,
    editingChannel,
    onSave,
    isSaving
}: ChannelFormDialogProps) {
    const fetchModel = useFetchModel();

    // Form states
    const [name, setName] = useState('');
    const [type, setType] = useState<ChannelType>(ChannelType.OpenAIChat);
    const [baseUrls, setBaseUrls] = useState<BaseUrl[]>([{ url: '', delay: 0 }]);
    const [keys, setKeys] = useState<Array<Partial<ChannelKey>>>([{ enabled: true, channel_key: '', remark: '' }]);
    const [customHeaders, setCustomHeaders] = useState<CustomHeader[]>([]);
    const [autoGroup, setAutoGroup] = useState<AutoGroupType>(AutoGroupType.None);
    const [channelProxy, setChannelProxy] = useState('');
    const [matchRegex, setMatchRegex] = useState('');
    const [paramOverride, setParamOverride] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [proxy, setProxy] = useState(false);
    const [autoSync, setAutoSync] = useState(true);

    // Model list states
    const [autoModels, setAutoModels] = useState<string[]>([]);
    const [customModels, setCustomModels] = useState<string[]>([]);
    const [newModelInput, setNewModelInput] = useState('');

    const [prevOpen, setPrevOpen] = useState(open);
    const [prevEditingChannel, setPrevEditingChannel] = useState(editingChannel);

    if (open !== prevOpen || editingChannel !== prevEditingChannel) {
        setPrevOpen(open);
        setPrevEditingChannel(editingChannel);
        if (open) {
            if (editingChannel) {
                setName(editingChannel.name);
                setType(editingChannel.type);
                setBaseUrls(editingChannel.base_urls?.length ? editingChannel.base_urls.map(u => ({ ...u })) : [{ url: '', delay: 0 }]);
                setKeys(editingChannel.keys?.length ? editingChannel.keys.map(k => ({ ...k })) : [{ enabled: true, channel_key: '', remark: '' }]);
                setCustomHeaders(editingChannel.custom_header?.map(h => ({ ...h })) || []);
                setAutoGroup(editingChannel.auto_group ?? AutoGroupType.None);
                setChannelProxy(editingChannel.channel_proxy ?? '');
                setMatchRegex(editingChannel.match_regex ?? '');
                setParamOverride(editingChannel.param_override ?? '');
                setEnabled(editingChannel.enabled);
                setProxy(editingChannel.proxy);
                setAutoSync(editingChannel.auto_sync);
                setAutoModels(editingChannel.model ? editingChannel.model.split(',').filter(Boolean) : []);
                setCustomModels(editingChannel.custom_model ? editingChannel.custom_model.split(',').filter(Boolean) : []);
            } else {
                setName('');
                setType(ChannelType.OpenAIChat);
                setBaseUrls([{ url: '', delay: 0 }]);
                setKeys([{ enabled: true, channel_key: '', remark: '' }]);
                setCustomHeaders([]);
                setAutoGroup(AutoGroupType.None);
                setChannelProxy('');
                setMatchRegex('');
                setParamOverride('');
                setEnabled(true);
                setProxy(false);
                setAutoSync(true);
                setAutoModels([]);
                setCustomModels([]);
            }
            setNewModelInput('');
        }
    }

    const handleRefreshModels = async () => {
        const primaryUrl = baseUrls[0]?.url.trim();
        const primaryKey = keys.find(k => k.enabled && k.channel_key?.trim())?.channel_key?.trim();

        if (!primaryUrl || !primaryKey) {
            toast.error('请先配置首个 Base URL 以及至少一个启用的 API Key');
            return;
        }

        fetchModel.mutate(
            {
                type,
                base_urls: baseUrls.filter(u => u.url.trim()),
                keys: keys.filter(k => k.channel_key?.trim()).map(k => ({ enabled: !!k.enabled, channel_key: k.channel_key!.trim() })),
                proxy,
                channel_proxy: channelProxy.trim() || null,
                match_regex: matchRegex.trim() || null,
                custom_header: customHeaders.filter(h => h.header_key.trim()),
            },
            {
                onSuccess: (data) => {
                    if (data && data.length > 0) {
                        const merged = Array.from(new Set([...autoModels, ...data]));
                        setAutoModels(merged);
                        toast.success('模型列表同步成功');
                    } else {
                        toast.warning('未拉取到任何模型列表');
                    }
                },
                onError: (err) => {
                    toast.error(`获取模型失败: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        );
    };

    const handleAddCustomModel = () => {
        const val = newModelInput.trim();
        if (val && !customModels.includes(val) && !autoModels.includes(val)) {
            setCustomModels([...customModels, val]);
        }
        setNewModelInput('');
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!name.trim()) {
            toast.error('请输入渠道名称');
            return;
        }

        const validUrls = baseUrls.map(u => ({ ...u, url: u.url.trim() })).filter(u => u.url);
        if (validUrls.length === 0) {
            toast.error('请配置至少一个 Base URL');
            return;
        }

        const validKeys = keys.map(k => ({ ...k, channel_key: k.channel_key?.trim() })).filter(k => k.channel_key);
        if (validKeys.length === 0) {
            toast.error('请配置至少一个 API Key');
            return;
        }

        const modelStr = autoModels.join(',');
        const customModelStr = customModels.join(',');

        if (!modelStr && !customModelStr) {
            toast.error('模型范围不能为空，请点击“刷新”同步或手动添加');
            return;
        }

        let payload: CreateChannelRequest | UpdateChannelRequest;
        if (editingChannel) {
            // Diff keys for updates
            const initialKeys = editingChannel.keys ?? [];
            const keys_to_add = validKeys
                .filter(k => !k.id)
                .map(k => ({ enabled: !!k.enabled, channel_key: k.channel_key!, remark: k.remark || '' }));
            
            const keys_to_update = validKeys
                .filter(k => {
                    if (!k.id) return false;
                    const orig = initialKeys.find(x => x.id === k.id);
                    return orig && (orig.channel_key !== k.channel_key || orig.enabled !== k.enabled || orig.remark !== (k.remark || ''));
                })
                .map(k => ({ id: k.id!, enabled: !!k.enabled, channel_key: k.channel_key!, remark: k.remark || '' }));

            const keys_to_delete = initialKeys
                .filter(orig => !validKeys.some(k => k.id === orig.id))
                .map(orig => orig.id);

            payload = {
                id: editingChannel.id,
                name: name.trim(),
                type,
                base_urls: validUrls,
                model: modelStr,
                custom_model: customModelStr,
                proxy,
                auto_sync: autoSync,
                auto_group: autoGroup,
                custom_header: customHeaders.filter(h => h.header_key.trim()),
                channel_proxy: channelProxy.trim() || null,
                param_override: paramOverride.trim() || null,
                match_regex: matchRegex.trim() || null,
                enabled,
                keys_to_add,
                keys_to_update,
                keys_to_delete
            };
        } else {
            payload = {
                name: name.trim(),
                type,
                base_urls: validUrls,
                keys: validKeys.map(k => ({ enabled: !!k.enabled, channel_key: k.channel_key!, remark: k.remark || '' })),
                model: modelStr,
                custom_model: customModelStr,
                proxy,
                auto_sync: autoSync,
                auto_group: autoGroup,
                custom_header: customHeaders.filter(h => h.header_key.trim()),
                channel_proxy: channelProxy.trim() || null,
                param_override: paramOverride.trim() || null,
                match_regex: matchRegex.trim() || null,
                enabled
            };
        }

        await onSave(payload);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl rounded-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{editingChannel ? '编辑渠道' : '新增渠道'}</DialogTitle>
                    <DialogDescription>配置手动连接的上游模型渠道接口和 API 密钥范围。</DialogDescription>
                </DialogHeader>

                <form className="space-y-4 py-1 text-xs" onSubmit={handleSubmit}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-1.5">
                            <span className="font-medium">渠道名称</span>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="例如：主通道 OpenAI"
                                className="h-9 rounded-lg text-xs"
                            />
                        </div>

                        <div className="grid gap-1.5">
                            <span className="font-medium">渠道类型</span>
                            <Select value={String(type)} onValueChange={(val) => setType(Number(val) as ChannelType)}>
                                <SelectTrigger className="w-full h-9 rounded-lg text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="text-xs">
                                    <SelectItem value={String(ChannelType.OpenAIChat)} className="text-xs">OpenAI Chat</SelectItem>
                                    <SelectItem value={String(ChannelType.OpenAIResponse)} className="text-xs">OpenAI Response</SelectItem>
                                    <SelectItem value={String(ChannelType.Anthropic)} className="text-xs">Anthropic</SelectItem>
                                    <SelectItem value={String(ChannelType.Gemini)} className="text-xs">Gemini</SelectItem>
                                    <SelectItem value={String(ChannelType.Volcengine)} className="text-xs">火山引擎</SelectItem>
                                    <SelectItem value={String(ChannelType.OpenAIEmbedding)} className="text-xs">OpenAI Embedding</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Base URLs */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="font-medium">Base URLs ({baseUrls.length})</span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-lg h-7 px-2 text-[10px]"
                                onClick={() => setBaseUrls([...baseUrls, { url: '', delay: 0 }])}
                            >
                                <Plus className="size-3 mr-1" /> Add URL
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {baseUrls.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <Input
                                        value={item.url}
                                        onChange={(e) => setBaseUrls(baseUrls.map((u, i) => i === idx ? { ...u, url: e.target.value } : u))}
                                        placeholder="https://api.openai.com/v1"
                                        className="h-8 rounded-lg text-xs flex-1"
                                    />
                                    <Input
                                        type="number"
                                        value={item.delay || ''}
                                        onChange={(e) => setBaseUrls(baseUrls.map((u, i) => i === idx ? { ...u, delay: Number(e.target.value) } : u))}
                                        placeholder="延迟延迟(ms)"
                                        className="h-8 rounded-lg text-xs w-24"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg text-destructive"
                                        onClick={() => setBaseUrls(baseUrls.filter((_, i) => i !== idx))}
                                        disabled={baseUrls.length <= 1}
                                    >
                                        <Trash className="size-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Keys */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="font-medium">API Keys ({keys.length})</span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-lg h-7 px-2 text-[10px]"
                                onClick={() => setKeys([...keys, { enabled: true, channel_key: '', remark: '' }])}
                            >
                                <Plus className="size-3 mr-1" /> Add Key
                            </Button>
                        </div>
                        <div className="space-y-2 max-h-[160px] overflow-y-auto">
                            {keys.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 pr-1">
                                    <Input
                                        value={item.channel_key || ''}
                                        onChange={(e) => setKeys(keys.map((k, i) => i === idx ? { ...k, channel_key: e.target.value } : k))}
                                        placeholder="sk-..."
                                        className="h-8 rounded-lg text-xs flex-1 font-mono"
                                    />
                                    <Input
                                        value={item.remark || ''}
                                        onChange={(e) => setKeys(keys.map((k, i) => i === idx ? { ...k, remark: e.target.value } : k))}
                                        placeholder="备注"
                                        className="h-8 rounded-lg text-xs w-28"
                                    />
                                    <Switch
                                        checked={!!item.enabled}
                                        onCheckedChange={(checked) => setKeys(keys.map((k, i) => i === idx ? { ...k, enabled: checked } : k))}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg text-destructive"
                                        onClick={() => setKeys(keys.filter((_, i) => i !== idx))}
                                        disabled={keys.length <= 1}
                                    >
                                        <Trash className="size-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Models Area */}
                    <div className="space-y-2 rounded-xl border p-4 bg-muted/10">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs">模型范围 ({autoModels.length + customModels.length})</span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px]"
                                onClick={handleRefreshModels}
                                disabled={fetchModel.isPending}
                            >
                                <RefreshCw className={cn('size-3 mr-1', fetchModel.isPending && 'animate-spin')} />
                                刷新列表
                            </Button>
                        </div>
                        <div className="relative">
                            <Input
                                value={newModelInput}
                                onChange={(e) => setNewModelInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddCustomModel();
                                    }
                                }}
                                placeholder="输入自定义模型并回车添加"
                                className="h-8 pr-12 rounded-lg text-xs"
                            />
                            {newModelInput.trim() && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 px-1.5 text-[10px]"
                                    onClick={handleAddCustomModel}
                                >
                                    添加
                                </Button>
                            )}
                        </div>
                        <div className="rounded-lg border bg-background/50 p-2 min-h-12 max-h-32 overflow-y-auto">
                            {autoModels.length === 0 && customModels.length === 0 ? (
                                <div className="text-center text-muted-foreground py-2 italic">请点击刷新获取模型，或手动添加</div>
                            ) : (
                                <div className="flex flex-wrap gap-1">
                                    {autoModels.map((m) => (
                                        <Badge key={m} variant="secondary" className="text-[10px] h-5 py-0">
                                            {m}
                                            <X className="size-3 ml-1 cursor-pointer" onClick={() => setAutoModels(autoModels.filter(x => x !== m))} />
                                        </Badge>
                                    ))}
                                    {customModels.map((m) => (
                                        <Badge key={m} className="text-[10px] h-5 py-0 bg-primary/80">
                                            {m}
                                            <X className="size-3 ml-1 cursor-pointer" onClick={() => setCustomModels(customModels.filter(x => x !== m))} />
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Advanced Accordion */}
                    <Accordion type="single" collapsible className="border rounded-xl">
                        <AccordionItem value="advanced" className="border-none">
                            <AccordionTrigger className="h-9 py-0 px-4 text-xs font-semibold hover:no-underline">
                                高级设置
                            </AccordionTrigger>
                            <AccordionContent className="pt-4 px-4 pb-4 space-y-4 border-t border-border">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="grid gap-1">
                                        <span>自动分组</span>
                                        <Select value={String(autoGroup)} onValueChange={(val) => setAutoGroup(Number(val) as AutoGroupType)}>
                                            <SelectTrigger className="w-full h-8 rounded-lg text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={String(AutoGroupType.None)} className="text-xs">不自动分组</SelectItem>
                                                <SelectItem value={String(AutoGroupType.Fuzzy)} className="text-xs">模糊匹配</SelectItem>
                                                <SelectItem value={String(AutoGroupType.Exact)} className="text-xs">精确匹配</SelectItem>
                                                <SelectItem value={String(AutoGroupType.Regex)} className="text-xs">正则匹配</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-1">
                                        <span>匹配正则</span>
                                        <Input
                                            value={matchRegex}
                                            onChange={(e) => setMatchRegex(e.target.value)}
                                            placeholder="例如：^gpt-.*"
                                            className="h-8 rounded-lg text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="grid gap-1">
                                        <span>渠道代理</span>
                                        <Input
                                            value={channelProxy}
                                            onChange={(e) => setChannelProxy(e.target.value)}
                                            placeholder="socks5://127.0.0.1:7890"
                                            className="h-8 rounded-lg text-xs"
                                        />
                                    </div>
                                    <div className="grid gap-1">
                                        <div className="flex items-center justify-between">
                                            <span>自定义 Header</span>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-6 px-1 text-[10px]"
                                                onClick={() => setCustomHeaders([...customHeaders, { header_key: '', header_value: '' }])}
                                            >
                                                添加 Header
                                            </Button>
                                        </div>
                                        <div className="space-y-1.5 max-h-24 overflow-y-auto">
                                            {customHeaders.map((h, i) => (
                                                <div key={i} className="flex items-center gap-1.5">
                                                    <Input
                                                        value={h.header_key}
                                                        onChange={(e) => setCustomHeaders(customHeaders.map((x, idx) => idx === i ? { ...x, header_key: e.target.value } : x))}
                                                        placeholder="Key"
                                                        className="h-7 rounded-md text-xs flex-1"
                                                    />
                                                    <Input
                                                        value={h.header_value}
                                                        onChange={(e) => setCustomHeaders(customHeaders.map((x, idx) => idx === i ? { ...x, header_value: e.target.value } : x))}
                                                        placeholder="Value"
                                                        className="h-7 rounded-md text-xs flex-1"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-7 rounded-md text-destructive"
                                                        onClick={() => setCustomHeaders(customHeaders.filter((_, idx) => idx !== i))}
                                                    >
                                                        <Trash className="size-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-1">
                                    <span>参数覆盖 (JSON 格式)</span>
                                    <textarea
                                        value={paramOverride}
                                        onChange={(e) => setParamOverride(e.target.value)}
                                        placeholder='{"temperature": 0.5}'
                                        className="h-20 w-full rounded-lg border bg-background px-3 py-1.5 font-mono text-[10px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>

                    <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl bg-muted/20 border">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <Switch checked={enabled} onCheckedChange={setEnabled} className="scale-90" />
                            <span>启用渠道</span>
                        </label>
                        <div className="flex items-center gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Switch checked={proxy} onCheckedChange={setProxy} className="scale-90" />
                                <span>使用代理</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Switch checked={autoSync} onCheckedChange={setAutoSync} className="scale-90" />
                                <span>自动同步</span>
                            </label>
                        </div>
                    </div>

                    <DialogFooter className="mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="rounded-lg h-9 text-xs"
                            onClick={() => onOpenChange(false)}
                            disabled={isSaving}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            className="rounded-lg h-9 text-xs"
                            disabled={isSaving}
                        >
                            {isSaving ? '保存中...' : '确认保存'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
