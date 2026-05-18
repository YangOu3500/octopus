'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, FileWarning, Gauge, Hash, HeartPulse, HelpCircle, MessageSquare, Network, Percent, Send, ShieldAlert, Shuffle, Thermometer, Timer, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHealthCooldownPolicy, useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { toast } from '@/components/common/Toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/animate-ui/components/animate/tooltip';
import { Badge } from '@/components/ui/badge';

type RuntimeSettingKey = typeof SettingKey[keyof typeof SettingKey];

type FieldConfig = {
    key: RuntimeSettingKey;
    icon: LucideIcon;
    label: string;
    hint: string;
    inputMode?: 'numeric' | 'decimal' | 'text';
    min?: string;
    max?: string;
    step?: string;
};

type SwitchConfig = {
    key: RuntimeSettingKey;
    icon: LucideIcon;
    label: string;
    hint: string;
};

const defaultValues: Record<string, string> = {
    [SettingKey.HealthScoreWindowMinutes]: '60',
    [SettingKey.HealthMinConfidentSample]: '10',
    [SettingKey.SuccessRatePenaltyWeight]: '70',
    [SettingKey.EmptyResponsePenaltyWeight]: '25',
    [SettingKey.LatencyPenaltyWeight]: '8',
    [SettingKey.ChannelConcurrencyMode]: 'local',
    [SettingKey.ChannelConcurrencyMax]: '1',
    [SettingKey.ChannelConcurrencyQueueMS]: '1000',
    [SettingKey.ChannelConcurrencyLeaseMS]: '120000',
    [SettingKey.StreamFirstValidTimeout]: '15',
    [SettingKey.StreamFirstValidMaxBuffer]: '65536',
    [SettingKey.StreamEmptyDoneAsFailure]: 'true',
    [SettingKey.StreamInvalidSSEAsFailure]: 'true',
    [SettingKey.ProbeSiteMinInterval]: '30',
    [SettingKey.ProbeModelMinInterval]: '12',
    [SettingKey.ProbeMaxConcurrency]: '1',
    [SettingKey.ProbeDailyMaxRequests]: '20',
    [SettingKey.ProbePrompt]: '只回复 OK',
    [SettingKey.ProbeMaxTokens]: '8',
    [SettingKey.ProbeTemperature]: '0',
    [SettingKey.ProbeJitterRatio]: '0.25',
    [SettingKey.ProbeStreamEnabled]: 'false',
};

function SettingRow({
    icon: Icon,
    label,
    hint,
    children,
}: {
    icon: LucideIcon;
    label: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 text-sm font-medium">{label}</span>
                {hint && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <HelpCircle className="size-4 shrink-0 cursor-help text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                                {hint}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
            {children}
        </div>
    );
}

export function SettingHealthProbe() {
    const t = useTranslations('setting');
    const { data: settings } = useSettingList();
    const { data: cooldownPolicies = [] } = useHealthCooldownPolicy();
    const setSetting = useSetSetting();

    const [values, setValues] = useState<Record<string, string>>(defaultValues);
    const [healthScoreEnabled, setHealthScoreEnabled] = useState(false);
    const [channelConcurrencyEnabled, setChannelConcurrencyEnabled] = useState(false);
    const [probeEnabled, setProbeEnabled] = useState(false);

    const initialValues = useRef<Record<string, string>>(defaultValues);
    const initialHealthScoreEnabled = useRef(false);
    const initialChannelConcurrencyEnabled = useRef(false);
    const initialProbeEnabled = useRef(false);

    const healthFields: FieldConfig[] = [
        {
            key: SettingKey.HealthScoreWindowMinutes,
            icon: Timer,
            label: t('healthProbe.health.window.label'),
            hint: t('healthProbe.health.window.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.HealthMinConfidentSample,
            icon: Hash,
            label: t('healthProbe.health.sample.label'),
            hint: t('healthProbe.health.sample.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.SuccessRatePenaltyWeight,
            icon: Percent,
            label: t('healthProbe.health.failureWeight.label'),
            hint: t('healthProbe.health.failureWeight.hint'),
            inputMode: 'numeric',
            min: '0',
        },
        {
            key: SettingKey.EmptyResponsePenaltyWeight,
            icon: Activity,
            label: t('healthProbe.health.emptyWeight.label'),
            hint: t('healthProbe.health.emptyWeight.hint'),
            inputMode: 'numeric',
            min: '0',
        },
        {
            key: SettingKey.LatencyPenaltyWeight,
            icon: Gauge,
            label: t('healthProbe.health.latencyWeight.label'),
            hint: t('healthProbe.health.latencyWeight.hint'),
            inputMode: 'numeric',
            min: '0',
        },
    ];

    const probeFields: FieldConfig[] = [
        {
            key: SettingKey.ProbeSiteMinInterval,
            icon: Timer,
            label: t('healthProbe.probe.siteInterval.label'),
            hint: t('healthProbe.probe.siteInterval.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ProbeModelMinInterval,
            icon: Timer,
            label: t('healthProbe.probe.modelInterval.label'),
            hint: t('healthProbe.probe.modelInterval.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ProbeMaxConcurrency,
            icon: Send,
            label: t('healthProbe.probe.concurrency.label'),
            hint: t('healthProbe.probe.concurrency.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ProbeDailyMaxRequests,
            icon: Hash,
            label: t('healthProbe.probe.dailyBudget.label'),
            hint: t('healthProbe.probe.dailyBudget.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ProbePrompt,
            icon: MessageSquare,
            label: t('healthProbe.probe.prompt.label'),
            hint: t('healthProbe.probe.prompt.hint'),
            inputMode: 'text',
        },
        {
            key: SettingKey.ProbeMaxTokens,
            icon: Hash,
            label: t('healthProbe.probe.maxTokens.label'),
            hint: t('healthProbe.probe.maxTokens.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ProbeTemperature,
            icon: Thermometer,
            label: t('healthProbe.probe.temperature.label'),
            hint: t('healthProbe.probe.temperature.hint'),
            inputMode: 'decimal',
            min: '0',
            max: '2',
            step: '0.1',
        },
        {
            key: SettingKey.ProbeJitterRatio,
            icon: Shuffle,
            label: t('healthProbe.probe.jitter.label'),
            hint: t('healthProbe.probe.jitter.hint'),
            inputMode: 'decimal',
            min: '0',
            max: '1',
            step: '0.05',
        },
    ];

    const channelConcurrencyFields: FieldConfig[] = [
        {
            key: SettingKey.ChannelConcurrencyMax,
            icon: Hash,
            label: t('healthProbe.channelConcurrency.max.label'),
            hint: t('healthProbe.channelConcurrency.max.hint'),
            inputMode: 'numeric',
            min: '1',
        },
        {
            key: SettingKey.ChannelConcurrencyQueueMS,
            icon: Timer,
            label: t('healthProbe.channelConcurrency.queue.label'),
            hint: t('healthProbe.channelConcurrency.queue.hint'),
            inputMode: 'numeric',
            min: '0',
        },
        {
            key: SettingKey.ChannelConcurrencyLeaseMS,
            icon: Timer,
            label: t('healthProbe.channelConcurrency.lease.label'),
            hint: t('healthProbe.channelConcurrency.lease.hint'),
            inputMode: 'numeric',
            min: '1',
        },
    ];

    const probeSwitchFields: SwitchConfig[] = [
        {
            key: SettingKey.ProbeStreamEnabled,
            icon: Activity,
            label: t('healthProbe.probe.stream.label'),
            hint: t('healthProbe.probe.stream.hint'),
        },
    ];

    const streamFields: FieldConfig[] = [
        {
            key: SettingKey.StreamFirstValidTimeout,
            icon: Timer,
            label: t('healthProbe.stream.timeout.label'),
            hint: t('healthProbe.stream.timeout.hint'),
            inputMode: 'numeric',
            min: '0',
        },
        {
            key: SettingKey.StreamFirstValidMaxBuffer,
            icon: Hash,
            label: t('healthProbe.stream.buffer.label'),
            hint: t('healthProbe.stream.buffer.hint'),
            inputMode: 'numeric',
            min: '1',
        },
    ];

    const streamSwitchFields: SwitchConfig[] = [
        {
            key: SettingKey.StreamEmptyDoneAsFailure,
            icon: Activity,
            label: t('healthProbe.stream.emptyDone.label'),
            hint: t('healthProbe.stream.emptyDone.hint'),
        },
        {
            key: SettingKey.StreamInvalidSSEAsFailure,
            icon: FileWarning,
            label: t('healthProbe.stream.invalidSSE.label'),
            hint: t('healthProbe.stream.invalidSSE.hint'),
        },
    ];

    useEffect(() => {
        if (!settings) return;

        const nextValues = { ...defaultValues };
        for (const key of Object.keys(defaultValues)) {
            const setting = settings.find(s => s.key === key);
            if (setting) {
                nextValues[key] = setting.value;
            }
        }
        queueMicrotask(() => setValues(nextValues));
        initialValues.current = nextValues;

        const healthScore = settings.find(s => s.key === SettingKey.HealthScoreEnabled);
        const nextHealthScoreEnabled = healthScore?.value === 'true';
        queueMicrotask(() => setHealthScoreEnabled(nextHealthScoreEnabled));
        initialHealthScoreEnabled.current = nextHealthScoreEnabled;

        const channelConcurrency = settings.find(s => s.key === SettingKey.ChannelConcurrencyEnabled);
        const nextChannelConcurrencyEnabled = channelConcurrency?.value === 'true';
        queueMicrotask(() => setChannelConcurrencyEnabled(nextChannelConcurrencyEnabled));
        initialChannelConcurrencyEnabled.current = nextChannelConcurrencyEnabled;

        const probe = settings.find(s => s.key === SettingKey.ProbeEnabled);
        const nextProbeEnabled = probe?.value === 'true';
        queueMicrotask(() => setProbeEnabled(nextProbeEnabled));
        initialProbeEnabled.current = nextProbeEnabled;
    }, [settings]);

    const handleValueChange = (key: string, value: string) => {
        setValues(prev => ({ ...prev, [key]: value }));
    };

    const handleValueSave = (key: string, value: string) => {
        const initialValue = initialValues.current[key] ?? '';
        if (value === initialValue) return;

        setSetting.mutate({ key, value }, {
            onSuccess: () => {
                toast.success(t('saved'));
                initialValues.current = { ...initialValues.current, [key]: value };
            },
            onError: () => {
                setValues(prev => ({ ...prev, [key]: initialValue }));
            },
        });
    };

    const handleSelectSave = (key: string, value: string) => {
        setValues(prev => ({ ...prev, [key]: value }));
        handleValueSave(key, value);
    };

    const handleSwitchSave = (key: string, checked: boolean) => {
        const value = checked ? 'true' : 'false';
        const initialValue = initialValues.current[key] ?? 'false';
        if (value === initialValue) return;
        setValues(prev => ({ ...prev, [key]: value }));
        setSetting.mutate({ key, value }, {
            onSuccess: () => {
                toast.success(t('saved'));
                initialValues.current = { ...initialValues.current, [key]: value };
            },
            onError: () => {
                setValues(prev => ({ ...prev, [key]: initialValue }));
            },
        });
    };

    const handleHealthScoreChange = (checked: boolean) => {
        setHealthScoreEnabled(checked);
        setSetting.mutate(
            { key: SettingKey.HealthScoreEnabled, value: checked ? 'true' : 'false' },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialHealthScoreEnabled.current = checked;
                },
                onError: () => setHealthScoreEnabled(initialHealthScoreEnabled.current),
            }
        );
    };

    const handleChannelConcurrencyChange = (checked: boolean) => {
        setChannelConcurrencyEnabled(checked);
        setSetting.mutate(
            { key: SettingKey.ChannelConcurrencyEnabled, value: checked ? 'true' : 'false' },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialChannelConcurrencyEnabled.current = checked;
                },
                onError: () => setChannelConcurrencyEnabled(initialChannelConcurrencyEnabled.current),
            }
        );
    };

    const handleProbeChange = (checked: boolean) => {
        setProbeEnabled(checked);
        setSetting.mutate(
            { key: SettingKey.ProbeEnabled, value: checked ? 'true' : 'false' },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialProbeEnabled.current = checked;
                },
                onError: () => setProbeEnabled(initialProbeEnabled.current),
            }
        );
    };

    const renderField = (field: FieldConfig) => (
        <SettingRow key={field.key} icon={field.icon} label={field.label} hint={field.hint}>
            <Input
                type={field.inputMode === 'text' ? 'text' : 'number'}
                min={field.min}
                max={field.max}
                step={field.step}
                value={values[field.key] ?? ''}
                onChange={(e) => handleValueChange(field.key, e.target.value)}
                onBlur={() => handleValueSave(field.key, values[field.key] ?? '')}
                className="w-full rounded-xl sm:w-48"
            />
        </SettingRow>
    );

    const renderSwitchField = (field: SwitchConfig) => (
        <SettingRow key={field.key} icon={field.icon} label={field.label} hint={field.hint}>
            <Switch
                checked={(values[field.key] ?? 'false') === 'true'}
                onCheckedChange={(checked) => handleSwitchSave(field.key, checked)}
            />
        </SettingRow>
    );

    const formatSeconds = (seconds: number) => {
        if (seconds >= 60 && seconds % 60 === 0) {
            return t('healthProbe.cooldown.minutes', { value: seconds / 60 });
        }
        return t('healthProbe.cooldown.seconds', { value: seconds });
    };

    const reasonLabel = (reason: string) => t(`healthProbe.cooldown.reasons.${reason}`);
    const scopeLabel = (scope: string) => t(`healthProbe.cooldown.scopes.${scope}`);

    return (
        <div className="rounded-3xl border border-border bg-card p-6 space-y-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-card-foreground">
                <HeartPulse className="h-5 w-5" />
                {t('healthProbe.title')}
            </h2>

            <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Gauge className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                            <div className="text-sm font-medium">{t('healthProbe.health.title')}</div>
                            <div className="text-xs text-muted-foreground">{t('healthProbe.health.subtitle')}</div>
                        </div>
                    </div>
                    <Switch checked={healthScoreEnabled} onCheckedChange={handleHealthScoreChange} />
                </div>
                <div className="space-y-4">
                    {healthFields.map(renderField)}
                </div>
            </div>

            <div className="border-t border-border pt-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Network className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                            <div className="text-sm font-medium">{t('healthProbe.channelConcurrency.title')}</div>
                            <div className="text-xs text-muted-foreground">{t('healthProbe.channelConcurrency.subtitle')}</div>
                        </div>
                    </div>
                    <Switch checked={channelConcurrencyEnabled} onCheckedChange={handleChannelConcurrencyChange} />
                </div>
                <div className="space-y-4">
                    <SettingRow icon={Network} label={t('healthProbe.channelConcurrency.mode.label')} hint={t('healthProbe.channelConcurrency.mode.hint')}>
                        <Select
                            value={values[SettingKey.ChannelConcurrencyMode] ?? 'local'}
                            onValueChange={(value) => handleSelectSave(SettingKey.ChannelConcurrencyMode, value)}
                        >
                            <SelectTrigger className="w-full rounded-xl sm:w-48">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="local">{t('healthProbe.channelConcurrency.mode.local')}</SelectItem>
                                <SelectItem value="database">{t('healthProbe.channelConcurrency.mode.database')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </SettingRow>
                    {channelConcurrencyFields.map(renderField)}
                </div>
            </div>

            <div className="border-t border-border pt-5 space-y-4">
                <div className="flex min-w-0 items-center gap-3">
                    <ShieldAlert className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                        <div className="text-sm font-medium">{t('healthProbe.cooldown.title')}</div>
                        <div className="text-xs text-muted-foreground">{t('healthProbe.cooldown.subtitle')}</div>
                    </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[680px] text-left text-xs">
                        <thead className="bg-muted/40 text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 font-medium">{t('healthProbe.cooldown.columns.reason')}</th>
                                <th className="px-3 py-2 font-medium">{t('healthProbe.cooldown.columns.scope')}</th>
                                <th className="px-3 py-2 font-medium">{t('healthProbe.cooldown.columns.base')}</th>
                                <th className="px-3 py-2 font-medium">{t('healthProbe.cooldown.columns.backoff')}</th>
                                <th className="px-3 py-2 font-medium">{t('healthProbe.cooldown.columns.lifecycle')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cooldownPolicies.map(policy => (
                                <tr key={policy.reason} className="border-t border-border align-top">
                                    <td className="px-3 py-2">
                                        <div className="font-medium text-card-foreground">{reasonLabel(policy.reason)}</div>
                                        <div className="font-mono text-[11px] text-muted-foreground">{policy.reason}</div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-1">
                                            {policy.scopes.map(scope => (
                                                <Badge key={`${policy.reason}-${scope}`} variant="outline">
                                                    {scopeLabel(scope)}
                                                </Badge>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        <div>{formatSeconds(policy.base_seconds)}</div>
                                        <div>{t('healthProbe.cooldown.max', { value: formatSeconds(policy.max_seconds) })}</div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-1">
                                            {policy.uses_retry_after && (
                                                <Badge variant="secondary">{t('healthProbe.cooldown.retryAfter')}</Badge>
                                            )}
                                            {policy.exponential_backoff && (
                                                <Badge variant="outline">{t('healthProbe.cooldown.exponential')}</Badge>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        <div>{policy.model_scoped ? t('healthProbe.cooldown.modelScoped') : t('healthProbe.cooldown.notModelScoped')}</div>
                                        <div>{policy.cleared_on_success ? t('healthProbe.cooldown.clearedOnSuccess') : t('healthProbe.cooldown.notClearedOnSuccess')}</div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="text-xs text-muted-foreground">{t('healthProbe.cooldown.note')}</div>
            </div>

            <div className="border-t border-border pt-5 space-y-4">
                <div className="flex min-w-0 items-center gap-3">
                    <Timer className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                        <div className="text-sm font-medium">{t('healthProbe.stream.title')}</div>
                        <div className="text-xs text-muted-foreground">{t('healthProbe.stream.subtitle')}</div>
                    </div>
                </div>
                <div className="space-y-4">
                    {streamFields.map(renderField)}
                    {streamSwitchFields.map(renderSwitchField)}
                </div>
            </div>

            <div className="border-t border-border pt-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <Activity className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                            <div className="text-sm font-medium">{t('healthProbe.probe.title')}</div>
                            <div className="text-xs text-muted-foreground">{t('healthProbe.probe.subtitle')}</div>
                        </div>
                    </div>
                    <Switch checked={probeEnabled} onCheckedChange={handleProbeChange} />
                </div>
                <div className="space-y-4">
                    {probeFields.map(renderField)}
                    {probeSwitchFields.map(renderSwitchField)}
                </div>
            </div>
        </div>
    );
}
