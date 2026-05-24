'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Trash } from 'lucide-react';
import {
    type Site as SiteRecord,
    SitePlatform,
    type CustomHeader
} from '@/api/endpoints/site';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { toast } from 'sonner';

export type SiteFormState = {
    name: string;
    platform: SitePlatform | '';
    base_url: string;
    enabled: boolean;
    proxy: boolean;
    site_proxy: string;
    use_system_proxy: boolean;
    external_checkin_url: string;
    is_pinned: boolean;
    sort_order: number;
    global_weight: number;
    custom_header: CustomHeader[];
};

const AUTO_DETECT_VALUE = '__auto__';

const PLATFORM_LABELS: Record<string, string> = {
    metapi: 'MetAPI',
    allapihub: 'All API Hub',
    newapi: 'New API',
    donehub: 'DoneHub',
    sub2api: 'Sub2API',
    openai: 'OpenAI',
    claude: 'Claude',
    gemini: 'Gemini',
};

export function createEmptySiteForm(): SiteFormState {
    return {
        name: '',
        platform: '',
        base_url: '',
        enabled: true,
        proxy: false,
        site_proxy: '',
        use_system_proxy: false,
        external_checkin_url: '',
        is_pinned: false,
        sort_order: 0,
        global_weight: 1,
        custom_header: [],
    };
}

export function createSiteForm(site: SiteRecord): SiteFormState {
    return {
        name: site.name,
        platform: site.platform,
        base_url: site.base_url,
        enabled: site.enabled,
        proxy: site.proxy,
        site_proxy: site.site_proxy ?? '',
        use_system_proxy: site.use_system_proxy ?? false,
        external_checkin_url: site.external_checkin_url ?? '',
        is_pinned: site.is_pinned ?? false,
        sort_order: site.sort_order ?? 0,
        global_weight: site.global_weight ?? 1,
        custom_header: (site.custom_header ?? []).map((item) => ({ ...item })),
    };
}

interface SiteFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingSite: SiteRecord | null;
    onSave: (form: SiteFormState) => Promise<void>;
    isSaving: boolean;
    onDetectPlatform: (url: string) => Promise<{ platform: string }>;
    isDetecting: boolean;
}

export function SiteFormDialog({
    open,
    onOpenChange,
    editingSite,
    onSave,
    isSaving,
    onDetectPlatform,
    isDetecting
}: SiteFormDialogProps) {
    const [prevOpen, setPrevOpen] = useState(open);
    const [prevEditingSite, setPrevEditingSite] = useState(editingSite);
    const [form, setForm] = useState<SiteFormState | null>(null);

    if (open !== prevOpen || editingSite !== prevEditingSite) {
        setPrevOpen(open);
        setPrevEditingSite(editingSite);
        setForm(open ? (editingSite ? createSiteForm(editingSite) : createEmptySiteForm()) : null);
    }

    if (!form) return null;

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!form.name.trim()) {
            toast.error('请输入站点名称');
            return;
        }
        if (!form.base_url.trim()) {
            toast.error('请输入站点地址');
            return;
        }

        let platform = form.platform;
        if (!platform && !editingSite) {
            try {
                const detected = await onDetectPlatform(form.base_url.trim());
                platform = detected.platform as SitePlatform;
                toast.success(`自动检测到平台：${PLATFORM_LABELS[platform] ?? platform}`);
            } catch {
                toast.error('无法自动检测平台类型，请手动选择');
                return;
            }
        }

        if (!platform) {
            toast.error('请选择平台类型');
            return;
        }

        const trimmedHeaders = (form.custom_header || [])
            .map((item) => ({
                header_key: item.header_key.trim(),
                header_value: item.header_value.trim(),
            }))
            .filter((item) => item.header_key || item.header_value);

        const invalidHeader = trimmedHeaders.find(
            (item) => !item.header_key || !item.header_value
        );
        if (invalidHeader) {
            toast.error('自定义 Header 的键和值都不能为空');
            return;
        }

        await onSave({
            ...form,
            platform,
            custom_header: trimmedHeaders,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl rounded-2xl">
                <DialogHeader>
                    <DialogTitle>{editingSite ? '编辑站点' : '新增站点'}</DialogTitle>
                    <DialogDescription>
                        配置站点平台、代理和自定义 Header。站点账号会基于这里的基础信息进行同步。
                    </DialogDescription>
                </DialogHeader>

                <form className="space-y-4 py-2" onSubmit={handleSubmit}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-1.5 text-xs">
                            <span className="font-medium">站点名称</span>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm(c => c ? { ...c, name: e.target.value } : null)}
                                placeholder="例如：主站 OneAPI"
                                className="h-9 rounded-lg text-xs"
                            />
                        </div>

                        <div className="grid gap-1.5 text-xs">
                            <span className="font-medium">平台类型</span>
                            <Select
                                value={form.platform || AUTO_DETECT_VALUE}
                                onValueChange={(val) => setForm(c => c ? {
                                    ...c,
                                    platform: val === AUTO_DETECT_VALUE ? '' : (val as SitePlatform)
                                } : null)}
                            >
                                <SelectTrigger className="w-full h-9 rounded-lg text-xs">
                                    <SelectValue placeholder="自动检测" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={AUTO_DETECT_VALUE} className="text-xs">自动检测</SelectItem>
                                    {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                                        <SelectItem key={value} value={value} className="text-xs">
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid gap-1.5 text-xs">
                        <span className="font-medium">站点地址</span>
                        <Input
                            value={form.base_url}
                            onChange={(e) => setForm(c => c ? { ...c, base_url: e.target.value } : null)}
                            placeholder="https://example.com"
                            className="h-9 rounded-lg text-xs"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="flex items-center justify-between rounded-xl border p-3 bg-muted/20">
                            <div>
                                <div className="text-xs font-medium">启用站点</div>
                                <div className="text-[10px] text-muted-foreground">停用后不再投影托管渠道</div>
                            </div>
                            <Switch
                                checked={form.enabled}
                                onCheckedChange={(checked) => setForm(c => c ? { ...c, enabled: checked } : null)}
                            />
                        </div>

                        <div className="flex items-center justify-between rounded-xl border p-3 bg-muted/20">
                            <div>
                                <div className="text-xs font-medium">站点代理</div>
                                <div className="text-[10px] text-muted-foreground">请求时走站点级代理</div>
                            </div>
                            <Switch
                                checked={form.proxy}
                                onCheckedChange={(checked) => setForm(c => c ? { ...c, proxy: checked } : null)}
                            />
                        </div>

                        <div className="flex items-center justify-between rounded-xl border p-3 bg-muted/20">
                            <div>
                                <div className="text-xs font-medium">系统代理</div>
                                <div className="text-[10px] text-muted-foreground">无专用代理时用全局代理</div>
                            </div>
                            <Switch
                                checked={form.use_system_proxy}
                                onCheckedChange={(checked) => setForm(c => c ? { ...c, use_system_proxy: checked } : null)}
                            />
                        </div>
                    </div>

                    <div className="grid gap-1.5 text-xs">
                        <span className="font-medium">站点级代理</span>
                        <Input
                            value={form.site_proxy}
                            onChange={(e) => setForm(c => c ? { ...c, site_proxy: e.target.value } : null)}
                            placeholder="可选：例如 socks5://127.0.0.1:7890"
                            className="h-9 rounded-lg text-xs"
                        />
                    </div>

                    <div className="grid gap-1.5 text-xs">
                        <span className="font-medium">手动签到 URL</span>
                        <Input
                            value={form.external_checkin_url}
                            onChange={(e) => setForm(c => c ? { ...c, external_checkin_url: e.target.value } : null)}
                            placeholder="可选：例如 https://example.com/signin"
                            className="h-9 rounded-lg text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">
                            配置后可在站点总览中一键打开此页面进行手动签到，适用于有验证码等无法自动化签到的场景。
                        </span>
                    </div>

                    <div className="space-y-2.5 rounded-xl border p-4 bg-muted/10">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-xs font-medium">自定义 Header</div>
                                <div className="text-[10px] text-muted-foreground">会透传到站点接口请求，可用于附加鉴权或租户信息</div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-lg h-7 text-xs"
                                onClick={() => setForm(c => c ? {
                                    ...c,
                                    custom_header: [...c.custom_header, { header_key: '', header_value: '' }]
                                } : null)}
                            >
                                <Plus className="size-3.5 mr-1" />
                                添加 Header
                            </Button>
                        </div>

                        {form.custom_header.length === 0 ? (
                            <div className="text-xs text-muted-foreground italic">暂无自定义 Header</div>
                        ) : (
                            <div className="space-y-2 max-h-[160px] overflow-y-auto">
                                {form.custom_header.map((item, idx) => (
                                    <div key={idx} className="grid gap-2 grid-cols-[1fr_1fr_auto]">
                                        <Input
                                            value={item.header_key}
                                            onChange={(e) => setForm(c => c ? {
                                                ...c,
                                                custom_header: c.custom_header.map((h, i) => i === idx ? { ...h, header_key: e.target.value } : h)
                                            } : null)}
                                            placeholder="Header Key"
                                            className="h-8 rounded-lg text-xs"
                                        />
                                        <Input
                                            value={item.header_value}
                                            onChange={(e) => setForm(c => c ? {
                                                ...c,
                                                custom_header: c.custom_header.map((h, i) => i === idx ? { ...h, header_value: e.target.value } : h)
                                            } : null)}
                                            placeholder="Header Value"
                                            className="h-8 rounded-lg text-xs"
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8 rounded-lg text-destructive"
                                            onClick={() => setForm(c => c ? {
                                                ...c,
                                                custom_header: c.custom_header.filter((_, i) => i !== idx)
                                            } : null)}
                                        >
                                            <Trash className="size-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
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
                            disabled={isSaving || isDetecting}
                        >
                            {isSaving ? '保存中...' : isDetecting ? '平台检测中...' : '确认保存'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
