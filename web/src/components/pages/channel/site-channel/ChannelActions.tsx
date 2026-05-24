'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Trash, KeyRound, Settings } from 'lucide-react';
import {
    type SiteChannelGroup,
    type SiteChannelModel,
    type SiteModelRouteType,
    type SiteSourceKeyUpdateRequest,
    type SiteModelRouteUpdateRequest
} from '@/api/endpoints/site-channel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import { toast } from 'sonner';

interface SourceKeysDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    group: SiteChannelGroup | null;
    onSave: (payload: SiteSourceKeyUpdateRequest) => Promise<void>;
    isSaving: boolean;
}

type LocalKeyItem = {
    id?: number;
    enabled: boolean;
    token: string;
    token_masked: string;
    name: string;
    isNew?: boolean;
};

export function SourceKeysDialog({
    open,
    onOpenChange,
    group,
    onSave,
    isSaving
}: SourceKeysDialogProps) {
    const [prevOpen, setPrevOpen] = useState(open);
    const [prevGroup, setPrevGroup] = useState(group);
    const [keys, setKeys] = useState<LocalKeyItem[]>([]);

    if (open !== prevOpen || group !== prevGroup) {
        setPrevOpen(open);
        setPrevGroup(group);
        setKeys(
            open && group
                ? (group.source_keys ?? []).map((k) => ({
                      id: k.id,
                      enabled: k.enabled,
                      token: '',
                      token_masked: k.token_masked || '',
                      name: k.name || '',
                  }))
                : []
        );
    }

    if (!group) return null;

    const handleAddKey = () => {
        setKeys([...keys, { enabled: true, token: '', token_masked: '', name: '', isNew: true }]);
    };

    const isMaskedToken = (val: string) => val.includes('***') || val.includes('...');

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        // Validate
        for (const k of keys) {
            if (k.isNew && !k.token.trim()) {
                toast.error('新增 Key 的值不能为空');
                return;
            }
            if (!k.isNew && k.token.trim() && isMaskedToken(k.token.trim())) {
                toast.error('修改 Key 时不能填入脱敏的格式');
                return;
            }
        }

        const initialKeys = group.source_keys ?? [];

        const keys_to_add = keys
            .filter((k) => k.isNew && k.token.trim())
            .map((k) => ({
                enabled: k.enabled,
                token: k.token.trim(),
                name: k.name.trim() || undefined,
            }));

        const keys_to_update = keys
            .filter((k) => {
                if (k.isNew || !k.id) return false;
                const orig = initialKeys.find((x) => x.id === k.id);
                if (!orig) return false;
                
                const tokenChanged = k.token.trim().length > 0 && k.token.trim() !== orig.token_masked;
                const enabledChanged = k.enabled !== orig.enabled;
                const nameChanged = k.name.trim() !== (orig.name || '');
                return tokenChanged || enabledChanged || nameChanged;
            })
            .map((k) => {
                const orig = initialKeys.find((x) => x.id === k.id)!;
                return {
                    id: k.id!,
                    enabled: k.enabled,
                    token: k.token.trim().length > 0 ? k.token.trim() : undefined,
                    name: k.name.trim() !== (orig.name || '') ? k.name.trim() : undefined,
                };
            });

        const keys_to_delete = initialKeys
            .filter((orig) => !keys.some((k) => k.id === orig.id))
            .map((orig) => orig.id);

        const payload = {
            group_key: group.group_key,
            keys_to_add: keys_to_add.length > 0 ? keys_to_add : undefined,
            keys_to_update: keys_to_update.length > 0 ? keys_to_update : undefined,
            keys_to_delete: keys_to_delete.length > 0 ? keys_to_delete : undefined,
        };

        if (!payload.keys_to_add && !payload.keys_to_update && !payload.keys_to_delete) {
            onOpenChange(false);
            return;
        }

        await onSave(payload);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="size-5" />
                        管理「{group.group_name || group.group_key}」的源 Key
                    </DialogTitle>
                    <DialogDescription>
                        添加、更新或删除此分组同步的原始密钥。
                    </DialogDescription>
                </DialogHeader>

                <form className="space-y-4 py-1 text-xs" onSubmit={handleSubmit}>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {keys.length === 0 ? (
                            <div className="text-center text-muted-foreground py-4 italic">暂无 Key，点击下方按钮添加。</div>
                        ) : (
                            keys.map((k, idx) => (
                                <div key={idx} className="flex items-center gap-2 border-b border-border/40 pb-2 last:border-none">
                                    <div className="flex-1 grid gap-2 grid-cols-2">
                                        <Input
                                            value={k.isNew ? k.token : k.token || k.token_masked}
                                            onChange={(e) =>
                                                setKeys(
                                                    keys.map((x, i) =>
                                                        i === idx ? { ...x, token: e.target.value } : x
                                                    )
                                                )
                                            }
                                            placeholder={k.isNew ? "输入明文密钥 sk-..." : "留空代表不修改"}
                                            className="h-8 rounded-lg font-mono text-[11px]"
                                        />
                                        <Input
                                            value={k.name}
                                            onChange={(e) =>
                                                setKeys(
                                                    keys.map((x, i) =>
                                                        i === idx ? { ...x, name: e.target.value } : x
                                                    )
                                                )
                                            }
                                            placeholder="备注 / 名称"
                                            className="h-8 rounded-lg text-xs"
                                        />
                                    </div>
                                    <Switch
                                        checked={k.enabled}
                                        onCheckedChange={(checked) =>
                                            setKeys(
                                                keys.map((x, i) =>
                                                    i === idx ? { ...x, enabled: checked } : x
                                                )
                                            )
                                        }
                                        className="scale-90"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 rounded-lg text-destructive"
                                        onClick={() => setKeys(keys.filter((_, i) => i !== idx))}
                                    >
                                        <Trash className="size-3.5" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full rounded-lg h-8"
                        onClick={handleAddKey}
                    >
                        <Plus className="size-4 mr-1" />
                        添加 Key
                    </Button>

                    <DialogFooter className="mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="rounded-lg text-xs"
                            onClick={() => onOpenChange(false)}
                            disabled={isSaving}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            className="rounded-lg text-xs"
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

interface ModelRouteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    group: SiteChannelGroup | null;
    model: SiteChannelModel | null;
    onSave: (payload: SiteModelRouteUpdateRequest[]) => Promise<void>;
    isSaving: boolean;
}

export function ModelRouteDialog({
    open,
    onOpenChange,
    group,
    model,
    onSave,
    isSaving
}: ModelRouteDialogProps) {
    const [prevOpen, setPrevOpen] = useState(open);
    const [prevModel, setPrevModel] = useState(model);
    const [routeType, setRouteType] = useState<SiteModelRouteType>('unknown');
    const [rawPayload, setRawPayload] = useState('');

    if (open !== prevOpen || model !== prevModel) {
        setPrevOpen(open);
        setPrevModel(model);
        setRouteType(open && model ? model.route_type || 'unknown' : 'unknown');
        setRawPayload(open && model ? model.route_metadata?.route_type || '' : '');
    }

    if (!group || !model) return null;

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const payload = [
            {
                group_key: group.group_key,
                model_name: model.model_name,
                route_type: routeType,
                route_raw_payload: rawPayload.trim() || undefined,
            },
        ];

        await onSave(payload);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="size-5" />
                        配置「{model.model_name}」的路由类型
                    </DialogTitle>
                    <DialogDescription>
                        将站点模型重定向到本地最适合的转换翻译 Pipeline。
                    </DialogDescription>
                </DialogHeader>

                <form className="space-y-4 py-1 text-xs" onSubmit={handleSubmit}>
                    <div className="grid gap-1">
                        <span>模型名称</span>
                        <Input value={model.model_name} disabled className="h-8 rounded-lg text-xs" />
                    </div>

                    <div className="grid gap-1">
                        <span>路由协议</span>
                        <Select value={routeType} onValueChange={(val) => setRouteType(val as SiteModelRouteType)}>
                            <SelectTrigger className="w-full h-8 rounded-lg text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="text-xs">
                                <SelectItem value="unknown" className="text-xs">Unknown (默认自动匹配)</SelectItem>
                                <SelectItem value="openai_chat" className="text-xs">OpenAI Chat</SelectItem>
                                <SelectItem value="openai_response" className="text-xs">OpenAI Response</SelectItem>
                                <SelectItem value="anthropic" className="text-xs">Anthropic</SelectItem>
                                <SelectItem value="gemini" className="text-xs">Gemini</SelectItem>
                                <SelectItem value="volcengine" className="text-xs">火山引擎</SelectItem>
                                <SelectItem value="openai_embedding" className="text-xs">OpenAI Embedding</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-1">
                        <span>参数 Payload (JSON / 选填)</span>
                        <textarea
                            value={rawPayload}
                            onChange={(e) => setRawPayload(e.target.value)}
                            placeholder='可在此处填入特定的路由附加配置'
                            className="h-20 w-full rounded-lg border bg-background px-3 py-1.5 font-mono text-[10px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                    </div>

                    <DialogFooter className="mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="rounded-lg text-xs"
                            onClick={() => onOpenChange(false)}
                            disabled={isSaving}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            className="rounded-lg text-xs"
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
