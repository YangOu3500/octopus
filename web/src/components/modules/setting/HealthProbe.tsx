'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    Activity,
    FileWarning,
    Gauge,
    Hash,
    HeartPulse,
    HelpCircle,
    MessageSquare,
    Network,
    Percent,
    Send,
    ShieldAlert,
    Shuffle,
    Thermometer,
    Timer,
    type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHealthCooldownPolicy, useSettingList, useSetSetting, SettingKey } from '@/api/endpoints/setting';
import { toast } from '@/components/common/Toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/animate-ui/components/animate/tooltip';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

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
    [SettingKey.ProbePrompt]: '鍙洖澶?OK',
    [SettingKey.ProbeMaxTokens]: '8',
    [SettingKey.ProbeTemperature]: '0',
    [SettingKey.ProbeJitterRatio]: '0.25',
    [SettingKey.ProbeStreamEnabled]: 'false',
};

function FieldHint({ hint }: { hint: string }) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <HelpCircle className="size-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent>{hint}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

function SectionShell({
    icon: Icon,
    title,
    subtitle,
    action,
    children,
}: {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary">
                        <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">{title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
                    </div>
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            <div className="mt-4 space-y-4">{children}</div>
        </section>
    );
}

function FieldCard({
    field,
    value,
    onChange,
    onCommit,
}: {
    field: FieldConfig;
    value: string;
    onChange: (value: string) => void;
    onCommit: () => void;
}) {
    const Icon = field.icon;

    return (
        <label className="rounded-md border border-border/70 bg-background/40 p-3 transition-colors hover:border-primary/20 hover:bg-background/70">
            <div className="flex items-start gap-2">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border border-border/70 bg-card text-muted-foreground">
                    <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{field.label}</span>
                        <FieldHint hint={field.hint} />
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{field.hint}</div>
                </div>
            </div>
            <Input
                type={field.inputMode === 'text' ? 'text' : 'number'}
                min={field.min}
                max={field.max}
                step={field.step}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onCommit}
                className="mt-3 h-9 rounded-md"
            />
        </label>
    );
}

function SwitchCard({
    icon: Icon,
    label,
    hint,
    checked,
    onCheckedChange,
}: {
    icon: LucideIcon;
    label: string;
    hint: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-3 transition-colors hover:border-primary/20 hover:bg-background/70">
            <div className="flex min-w-0 items-start gap-2">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border border-border/70 bg-card text-muted-foreground">
                    <Icon className="size-3.5" />
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{label}</span>
                        <FieldHint hint={hint} />
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</div>
                </div>
            </div>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}

function SelectCard({
    icon: Icon,
    label,
    hint,
    value,
    onValueChange,
    children,
}: {
    icon: LucideIcon;
    label: string;
    hint: string;
    value: string;
    onValueChange: (value: string) => void;
    children: ReactNode;
}) {
    return (
        <div className="rounded-md border border-border/70 bg-background/40 p-3 transition-colors hover:border-primary/20 hover:bg-background/70">
            <div className="flex items-start gap-2">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border border-border/70 bg-card text-muted-foreground">
                    <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{label}</span>
                        <FieldHint hint={hint} />
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</div>
                </div>
            </div>
            <Select value={value} onValueChange={onValueChange}>
                <SelectTrigger className="mt-3 h-9 rounded-md">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>{children}</SelectContent>
            </Select>
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
            const setting = settings.find((item) => item.key === key);
            if (setting) nextValues[key] = setting.value;
        }
        queueMicrotask(() => setValues(nextValues));
        initialValues.current = nextValues;

        const nextHealthScoreEnabled = settings.find((item) => item.key === SettingKey.HealthScoreEnabled)?.value === 'true';
        const nextChannelConcurrencyEnabled = settings.find((item) => item.key === SettingKey.ChannelConcurrencyEnabled)?.value === 'true';
        const nextProbeEnabled = settings.find((item) => item.key === SettingKey.ProbeEnabled)?.value === 'true';

        queueMicrotask(() => setHealthScoreEnabled(nextHealthScoreEnabled));
        queueMicrotask(() => setChannelConcurrencyEnabled(nextChannelConcurrencyEnabled));
        queueMicrotask(() => setProbeEnabled(nextProbeEnabled));

        initialHealthScoreEnabled.current = nextHealthScoreEnabled;
        initialChannelConcurrencyEnabled.current = nextChannelConcurrencyEnabled;
        initialProbeEnabled.current = nextProbeEnabled;
    }, [settings]);

    const handleValueChange = (key: string, value: string) => {
        setValues((previous) => ({ ...previous, [key]: value }));
    };

    const handleValueSave = (key: string, value: string) => {
        const initialValue = initialValues.current[key] ?? '';
        if (value === initialValue) return;

        setSetting.mutate(
            { key, value },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialValues.current = { ...initialValues.current, [key]: value };
                },
                onError: () => {
                    setValues((previous) => ({ ...previous, [key]: initialValue }));
                },
            },
        );
    };

    const handleSelectSave = (key: string, value: string) => {
        setValues((previous) => ({ ...previous, [key]: value }));
        handleValueSave(key, value);
    };

    const handleSwitchSave = (key: string, checked: boolean) => {
        const value = checked ? 'true' : 'false';
        const initialValue = initialValues.current[key] ?? 'false';
        if (value === initialValue) return;

        setValues((previous) => ({ ...previous, [key]: value }));
        setSetting.mutate(
            { key, value },
            {
                onSuccess: () => {
                    toast.success(t('saved'));
                    initialValues.current = { ...initialValues.current, [key]: value };
                },
                onError: () => {
                    setValues((previous) => ({ ...previous, [key]: initialValue }));
                },
            },
        );
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
            },
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
            },
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
            },
        );
    };

    const renderFieldCard = (field: FieldConfig) => (
        <FieldCard
            key={field.key}
            field={field}
            value={values[field.key] ?? ''}
            onChange={(value) => handleValueChange(field.key, value)}
            onCommit={() => handleValueSave(field.key, values[field.key] ?? '')}
        />
    );

    const renderSwitchCard = (field: SwitchConfig) => (
        <SwitchCard
            key={field.key}
            icon={field.icon}
            label={field.label}
            hint={field.hint}
            checked={(values[field.key] ?? 'false') === 'true'}
            onCheckedChange={(checked) => handleSwitchSave(field.key, checked)}
        />
    );

    const formatSeconds = (seconds: number) => {
        if (seconds >= 60 && seconds % 60 === 0) {
            return t('healthProbe.cooldown.minutes', { value: seconds / 60 });
        }
        return t('healthProbe.cooldown.seconds', { value: seconds });
    };

    const reasonLabel = (reason: string) => t(`healthProbe.cooldown.reasons.${reason}`);
    const scopeLabel = (scope: string) => t(`healthProbe.cooldown.scopes.${scope}`);
    const cooldownSummary = {
        total: cooldownPolicies.length,
        retryAfter: cooldownPolicies.filter((policy) => policy.uses_retry_after).length,
        modelScoped: cooldownPolicies.filter((policy) => policy.model_scoped).length,
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
                <div className="space-y-4">
                    <SectionShell
                        icon={HeartPulse}
                        title={t('healthProbe.health.title')}
                        subtitle={t('healthProbe.health.subtitle')}
                        action={<Switch checked={healthScoreEnabled} onCheckedChange={handleHealthScoreChange} />}
                    >
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                            {healthFields.map(renderFieldCard)}
                        </div>
                    </SectionShell>

                    <SectionShell
                        icon={Network}
                        title={t('healthProbe.channelConcurrency.title')}
                        subtitle={t('healthProbe.channelConcurrency.subtitle')}
                        action={<Switch checked={channelConcurrencyEnabled} onCheckedChange={handleChannelConcurrencyChange} />}
                    >
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
                            <SelectCard
                                icon={Network}
                                label={t('healthProbe.channelConcurrency.mode.label')}
                                hint={t('healthProbe.channelConcurrency.mode.hint')}
                                value={values[SettingKey.ChannelConcurrencyMode] ?? 'local'}
                                onValueChange={(value) => handleSelectSave(SettingKey.ChannelConcurrencyMode, value)}
                            >
                                <SelectItem value="local">{t('healthProbe.channelConcurrency.mode.local')}</SelectItem>
                                <SelectItem value="database">{t('healthProbe.channelConcurrency.mode.database')}</SelectItem>
                            </SelectCard>
                            {channelConcurrencyFields.map(renderFieldCard)}
                        </div>
                    </SectionShell>

                    <SectionShell
                        icon={Timer}
                        title={t('healthProbe.stream.title')}
                        subtitle={t('healthProbe.stream.subtitle')}
                    >
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
                            {streamFields.map(renderFieldCard)}
                            {streamSwitchFields.map(renderSwitchCard)}
                        </div>
                    </SectionShell>
                </div>

                <div className="space-y-4">
                    <SectionShell
                        icon={ShieldAlert}
                        title={t('healthProbe.cooldown.title')}
                        subtitle={t('healthProbe.cooldown.subtitle')}
                    >
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div className="rounded-md border border-border/70 bg-background/40 px-3 py-2.5">
                                <div className="text-xs text-muted-foreground">{t('healthProbe.cooldown.summary.total', { value: cooldownSummary.total })}</div>
                                <div className="mt-1 text-lg font-semibold tabular-nums">{cooldownSummary.total}</div>
                            </div>
                            <div className="rounded-md border border-border/70 bg-background/40 px-3 py-2.5">
                                <div className="text-xs text-muted-foreground">{t('healthProbe.cooldown.summary.retryAfter', { value: cooldownSummary.retryAfter })}</div>
                                <div className="mt-1 text-lg font-semibold tabular-nums">{cooldownSummary.retryAfter}</div>
                            </div>
                            <div className="rounded-md border border-border/70 bg-background/40 px-3 py-2.5">
                                <div className="text-xs text-muted-foreground">{t('healthProbe.cooldown.summary.modelScoped', { value: cooldownSummary.modelScoped })}</div>
                                <div className="mt-1 text-lg font-semibold tabular-nums">{cooldownSummary.modelScoped}</div>
                            </div>
                        </div>

                        <Accordion type="multiple" className="space-y-2">
                            {cooldownPolicies.map((policy) => (
                                <AccordionItem key={policy.reason} value={policy.reason} className="overflow-hidden rounded-md border border-border/70 bg-background/30">
                                    <AccordionTrigger className="items-center px-3 py-2.5 hover:no-underline hover:bg-background/60">
                                        <div className="flex min-w-0 flex-1 items-center gap-3">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium text-card-foreground">{reasonLabel(policy.reason)}</div>
                                                <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{policy.reason}</div>
                                            </div>
                                            <div className="hidden flex-wrap gap-1 xl:flex">
                                                <Badge variant="secondary">{formatSeconds(policy.base_seconds)}</Badge>
                                                <Badge variant="outline">{t('healthProbe.cooldown.max', { value: formatSeconds(policy.max_seconds) })}</Badge>
                                                <Badge variant="outline">{policy.scopes.map((scope) => scopeLabel(scope)).join(' / ')}</Badge>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="border-t border-border/60 px-3 pb-3 pt-3">
                                        <div className="flex flex-wrap gap-1">
                                            {policy.scopes.map((scope) => (
                                                <Badge key={`${policy.reason}-${scope}`} variant="outline">
                                                    {scopeLabel(scope)}
                                                </Badge>
                                            ))}
                                            {policy.uses_retry_after ? (
                                                <Badge variant="secondary">{t('healthProbe.cooldown.retryAfter')}</Badge>
                                            ) : null}
                                            {policy.exponential_backoff ? (
                                                <Badge variant="outline">{t('healthProbe.cooldown.exponential')}</Badge>
                                            ) : null}
                                            {policy.model_scoped ? (
                                                <Badge variant="outline">{t('healthProbe.cooldown.modelScoped')}</Badge>
                                            ) : null}
                                            {policy.cleared_on_success ? (
                                                <Badge variant="outline">{t('healthProbe.cooldown.clearedOnSuccess')}</Badge>
                                            ) : null}
                                        </div>

                                        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                                            <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2">
                                                <div>{t('healthProbe.cooldown.columns.scope')}</div>
                                                <div className="mt-1 font-medium text-foreground">
                                                    {policy.scopes.map((scope) => scopeLabel(scope)).join(' / ')}
                                                </div>
                                            </div>
                                            <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2">
                                                <div>{t('healthProbe.cooldown.columns.lifecycle')}</div>
                                                <div className="mt-1 font-medium text-foreground">
                                                    {policy.model_scoped ? t('healthProbe.cooldown.modelScoped') : t('healthProbe.cooldown.notModelScoped')}
                                                </div>
                                                <div className="mt-1">
                                                    {policy.cleared_on_success ? t('healthProbe.cooldown.clearedOnSuccess') : t('healthProbe.cooldown.notClearedOnSuccess')}
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>

                        <div className="text-xs text-muted-foreground">{t('healthProbe.cooldown.note')}</div>
                    </SectionShell>

                    <SectionShell
                        icon={Activity}
                        title={t('healthProbe.probe.title')}
                        subtitle={t('healthProbe.probe.subtitle')}
                        action={<Switch checked={probeEnabled} onCheckedChange={handleProbeChange} />}
                    >
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {probeFields.map(renderFieldCard)}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {probeSwitchFields.map(renderSwitchCard)}
                        </div>
                    </SectionShell>
                </div>
            </div>
        </div>
    );
}
