'use client';

import { useState, type FormEvent } from 'react';
import {
    type Site as SiteRecord,
    type SiteAccount,
    SiteCredentialType,
    SitePlatform
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

export type SiteAccountFormState = {
    site_id: number;
    name: string;
    credential_type: SiteCredentialType;
    username: string;
    password: string;
    access_token: string;
    api_key: string;
    refresh_token: string;
    token_expires_at: string;
    platform_user_id: string;
    account_proxy: string;
    enabled: boolean;
    auto_sync: boolean;
    auto_checkin: boolean;
    random_checkin: boolean;
    checkin_interval_hours: number;
    checkin_random_window_minutes: number;
};

const CREDENTIAL_LABELS: Record<string, string> = {
    username_password: '用户名密码',
    api_key: 'API Key',
    access_token: 'Access Token',
};

function defaultCredentialType(platform: SitePlatform): SiteCredentialType {
    switch (platform) {
        case SitePlatform.Sub2API:
            return SiteCredentialType.AccessToken;
        case SitePlatform.OpenAI:
        case SitePlatform.Claude:
        case SitePlatform.Gemini:
            return SiteCredentialType.APIKey;
        default:
            return SiteCredentialType.UsernamePassword;
    }
}

function credentialOptions(platform: SitePlatform) {
    switch (platform) {
        case SitePlatform.Sub2API:
            return [SiteCredentialType.AccessToken, SiteCredentialType.APIKey];
        case SitePlatform.OpenAI:
        case SitePlatform.Claude:
        case SitePlatform.Gemini:
            return [SiteCredentialType.APIKey, SiteCredentialType.AccessToken];
        default:
            return [
                SiteCredentialType.UsernamePassword,
                SiteCredentialType.APIKey,
                SiteCredentialType.AccessToken,
            ];
    }
}

export function createEmptyAccountForm(site: SiteRecord): SiteAccountFormState {
    return {
        site_id: site.id,
        name: '',
        credential_type: defaultCredentialType(site.platform),
        username: '',
        password: '',
        access_token: '',
        api_key: '',
        refresh_token: '',
        token_expires_at: '',
        platform_user_id: '',
        account_proxy: '',
        enabled: true,
        auto_sync: true,
        auto_checkin: true,
        random_checkin: false,
        checkin_interval_hours: 24,
        checkin_random_window_minutes: 120,
    };
}

export function createAccountForm(account: SiteAccount): SiteAccountFormState {
    return {
        site_id: account.site_id,
        name: account.name,
        credential_type: account.credential_type,
        username: account.username ?? '',
        password: account.password ?? '',
        access_token: account.access_token ?? '',
        api_key: account.api_key ?? '',
        refresh_token: account.refresh_token ?? '',
        token_expires_at: account.token_expires_at > 0 ? String(account.token_expires_at) : '',
        platform_user_id: account.platform_user_id ? String(account.platform_user_id) : '',
        account_proxy: account.account_proxy ?? '',
        enabled: account.enabled,
        auto_sync: account.auto_sync,
        auto_checkin: account.auto_checkin,
        random_checkin: account.random_checkin,
        checkin_interval_hours: account.checkin_interval_hours,
        checkin_random_window_minutes: account.checkin_random_window_minutes,
    };
}

function parseTokenExpiresAtInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
        return 0;
    }

    if (/^\d+$/.test(trimmed)) {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error('token_expires_at 必须是正整数时间戳');
        }
        return parsed < 1_000_000_000_000 ? Math.trunc(parsed * 1000) : Math.trunc(parsed);
    }

    const parsed = Date.parse(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('token_expires_at 必须是时间戳或可解析时间');
    }
    return Math.trunc(parsed);
}

export type SiteAccountSavePayload = Omit<SiteAccountFormState, 'token_expires_at' | 'platform_user_id'> & {
    token_expires_at: number;
    platform_user_id: number | null;
};

interface AccountFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accountSite: SiteRecord | null;
    editingAccount: SiteAccount | null;
    onSave: (payload: SiteAccountSavePayload) => Promise<void>;
    isSaving: boolean;
}

export function AccountFormDialog({
    open,
    onOpenChange,
    accountSite,
    editingAccount,
    onSave,
    isSaving
}: AccountFormDialogProps) {
    const [prevOpen, setPrevOpen] = useState(open);
    const [prevAccountSite, setPrevAccountSite] = useState(accountSite);
    const [prevEditingAccount, setPrevEditingAccount] = useState(editingAccount);
    const [form, setForm] = useState<SiteAccountFormState | null>(null);

    if (open !== prevOpen || accountSite !== prevAccountSite || editingAccount !== prevEditingAccount) {
        setPrevOpen(open);
        setPrevAccountSite(accountSite);
        setPrevEditingAccount(editingAccount);
        setForm(open && accountSite ? (editingAccount ? createAccountForm(editingAccount) : createEmptyAccountForm(accountSite)) : null);
    }

    if (!accountSite || !form) return null;

    const currentPlatform = accountSite.platform;
    const currentCredentialOptions = credentialOptions(currentPlatform);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!form.name.trim()) {
            toast.error('请输入账号名称');
            return;
        }

        if (form.credential_type === SiteCredentialType.UsernamePassword) {
            if (!form.username.trim() || !form.password.trim()) {
                toast.error('用户名和密码不能为空');
                return;
            }
        }
        if (form.credential_type === SiteCredentialType.AccessToken && !form.access_token.trim()) {
            toast.error('请输入 Access Token');
            return;
        }
        if (form.credential_type === SiteCredentialType.APIKey && !form.api_key.trim()) {
            toast.error('请输入 API Key');
            return;
        }

        if (form.auto_checkin && form.random_checkin) {
            if (!Number.isFinite(form.checkin_interval_hours) || form.checkin_interval_hours < 1 || form.checkin_interval_hours > 720) {
                toast.error('最小签到间隔必须在 1 到 720 小时之间');
                return;
            }
            if (!Number.isFinite(form.checkin_random_window_minutes) || form.checkin_random_window_minutes < 0 || form.checkin_random_window_minutes > 1440) {
                toast.error('随机延迟窗口必须在 0 到 1440 分钟之间');
                return;
            }
        }

        const parsedPlatformUserID = form.platform_user_id.trim()
            ? Number(form.platform_user_id.trim())
            : null;
        if (parsedPlatformUserID !== null && (!Number.isInteger(parsedPlatformUserID) || parsedPlatformUserID <= 0)) {
            toast.error('Platform User ID 必须是大于 0 的整数');
            return;
        }

        let parsedTokenExpiresAt = 0;
        try {
            parsedTokenExpiresAt = parseTokenExpiresAtInput(form.token_expires_at);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
            return;
        }

        const trimmedAccessToken = form.credential_type === SiteCredentialType.AccessToken ? form.access_token.trim() : '';
        const trimmedAPIKey = form.credential_type === SiteCredentialType.APIKey ? form.api_key.trim() : '';

        const payload = {
            site_id: form.site_id,
            name: form.name.trim(),
            credential_type: form.credential_type,
            username: form.username.trim(),
            password: form.password.trim(),
            access_token: trimmedAccessToken,
            api_key: trimmedAPIKey,
            refresh_token: form.refresh_token.trim(),
            token_expires_at: parsedTokenExpiresAt,
            platform_user_id: parsedPlatformUserID,
            account_proxy: form.account_proxy.trim(),
            enabled: form.enabled,
            auto_sync: form.auto_sync,
            auto_checkin: form.auto_checkin,
            random_checkin: form.random_checkin,
            checkin_interval_hours: Math.max(1, Math.trunc(form.checkin_interval_hours || 24)),
            checkin_random_window_minutes: Math.max(0, Math.trunc(form.checkin_random_window_minutes || 0)),
        };

        await onSave(payload);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl rounded-2xl">
                <DialogHeader>
                    <DialogTitle>{editingAccount ? '编辑账号' : '新增账号'}</DialogTitle>
                    <DialogDescription>
                        为站点「{accountSite.name}」配置访问凭证和自动同步、签到规则。
                    </DialogDescription>
                </DialogHeader>

                <form className="space-y-4 py-1" onSubmit={handleSubmit}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-1.5 text-xs">
                            <span className="font-medium">账号名称</span>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm(c => c ? { ...c, name: e.target.value } : null)}
                                placeholder="例如：主账号"
                                className="h-9 rounded-lg text-xs"
                            />
                        </div>

                        <div className="grid gap-1.5 text-xs">
                            <span className="font-medium">凭证类型</span>
                            <Select
                                value={form.credential_type}
                                onValueChange={(val) => setForm(c => c ? {
                                    ...c,
                                    credential_type: val as SiteCredentialType
                                } : null)}
                            >
                                <SelectTrigger className="w-full h-9 rounded-lg text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {currentCredentialOptions.map((opt) => (
                                        <SelectItem key={opt} value={opt} className="text-xs">
                                            {CREDENTIAL_LABELS[opt] || opt}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {form.credential_type === SiteCredentialType.UsernamePassword && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="grid gap-1.5 text-xs">
                                <span className="font-medium">用户名</span>
                                <Input
                                    value={form.username}
                                    onChange={(e) => setForm(c => c ? { ...c, username: e.target.value } : null)}
                                    placeholder="Username"
                                    className="h-9 rounded-lg text-xs"
                                />
                            </div>
                            <div className="grid gap-1.5 text-xs">
                                <span className="font-medium">密码</span>
                                <Input
                                    type="password"
                                    value={form.password}
                                    onChange={(e) => setForm(c => c ? { ...c, password: e.target.value } : null)}
                                    placeholder="Password"
                                    className="h-9 rounded-lg text-xs"
                                />
                            </div>
                        </div>
                    )}

                    {form.credential_type === SiteCredentialType.AccessToken && (
                        <div className="grid gap-1.5 text-xs">
                            <span className="font-medium">Access Token</span>
                            <Input
                                value={form.access_token}
                                onChange={(e) => setForm(c => c ? { ...c, access_token: e.target.value } : null)}
                                placeholder="AccessToken"
                                className="h-9 rounded-lg text-xs"
                            />
                        </div>
                    )}

                    {form.credential_type === SiteCredentialType.APIKey && (
                        <div className="grid gap-1.5 text-xs">
                            <span className="font-medium">API Key</span>
                            <Input
                                value={form.api_key}
                                onChange={(e) => setForm(c => c ? { ...c, api_key: e.target.value } : null)}
                                placeholder="sk-..."
                                className="h-9 rounded-lg text-xs"
                            />
                        </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-1.5 text-xs">
                            <span className="font-medium">Refresh Token</span>
                            <Input
                                value={form.refresh_token}
                                onChange={(e) => setForm(c => c ? { ...c, refresh_token: e.target.value } : null)}
                                placeholder="可选：用于刷新 Access Token"
                                className="h-9 rounded-lg text-xs"
                            />
                        </div>
                        <div className="grid gap-1.5 text-xs">
                            <span className="font-medium">凭证过期时间</span>
                            <Input
                                value={form.token_expires_at}
                                onChange={(e) => setForm(c => c ? { ...c, token_expires_at: e.target.value } : null)}
                                placeholder="可选：时间戳或 YYYY-MM-DD"
                                className="h-9 rounded-lg text-xs"
                            />
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="grid gap-1.5 text-xs">
                            <span className="font-medium">Platform User ID</span>
                            <Input
                                value={form.platform_user_id}
                                onChange={(e) => setForm(c => c ? { ...c, platform_user_id: e.target.value } : null)}
                                placeholder="可选：站点平台的数字用户 ID"
                                className="h-9 rounded-lg text-xs"
                            />
                        </div>
                        <div className="grid gap-1.5 text-xs">
                            <span className="font-medium">账号代理</span>
                            <Input
                                value={form.account_proxy}
                                onChange={(e) => setForm(c => c ? { ...c, account_proxy: e.target.value } : null)}
                                placeholder="可选：socks5://127.0.0.1:7890"
                                className="h-9 rounded-lg text-xs"
                            />
                        </div>
                    </div>

                    <div className="grid gap-3 grid-cols-3">
                        <div className="flex items-center justify-between rounded-xl border p-2.5 bg-muted/20">
                            <div>
                                <div className="text-xs font-medium">启用账号</div>
                            </div>
                            <Switch
                                checked={form.enabled}
                                onCheckedChange={(checked) => setForm(c => c ? { ...c, enabled: checked } : null)}
                            />
                        </div>

                        <div className="flex items-center justify-between rounded-xl border p-2.5 bg-muted/20">
                            <div>
                                <div className="text-xs font-medium">自动同步</div>
                            </div>
                            <Switch
                                checked={form.auto_sync}
                                onCheckedChange={(checked) => setForm(c => c ? { ...c, auto_sync: checked } : null)}
                            />
                        </div>

                        <div className="flex items-center justify-between rounded-xl border p-2.5 bg-muted/20">
                            <div>
                                <div className="text-xs font-medium">自动签到</div>
                            </div>
                            <Switch
                                checked={form.auto_checkin}
                                onCheckedChange={(checked) => setForm(c => c ? { ...c, auto_checkin: checked } : null)}
                            />
                        </div>
                    </div>

                    {form.auto_checkin && (
                        <div className="rounded-xl border p-3.5 space-y-3 bg-muted/10">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-medium">随机延迟签到</div>
                                    <div className="text-[10px] text-muted-foreground">随机等待一段时间以规避探测</div>
                                </div>
                                <Switch
                                    checked={form.random_checkin}
                                    onCheckedChange={(checked) => setForm(c => c ? { ...c, random_checkin: checked } : null)}
                                />
                            </div>

                            {form.random_checkin && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="grid gap-1.5 text-xs">
                                        <span className="font-medium">最小签到间隔（小时）</span>
                                        <Input
                                            type="number"
                                            value={form.checkin_interval_hours}
                                            onChange={(e) => setForm(c => c ? {
                                                ...c,
                                                checkin_interval_hours: Number(e.target.value)
                                            } : null)}
                                            min={1}
                                            max={720}
                                            className="h-8 rounded-lg text-xs"
                                        />
                                    </div>
                                    <div className="grid gap-1.5 text-xs">
                                        <span className="font-medium">随机波动窗口（分钟）</span>
                                        <Input
                                            type="number"
                                            value={form.checkin_random_window_minutes}
                                            onChange={(e) => setForm(c => c ? {
                                                ...c,
                                                checkin_random_window_minutes: Number(e.target.value)
                                            } : null)}
                                            min={0}
                                            max={1440}
                                            className="h-8 rounded-lg text-xs"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

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
