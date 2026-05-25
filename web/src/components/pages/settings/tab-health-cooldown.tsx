'use client';

import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { type HealthCooldownPolicy } from '@/api/endpoints/setting';

interface CooldownPoliciesProps {
    cooldownPolicies: HealthCooldownPolicy[];
}

export function CooldownPolicies({ cooldownPolicies }: CooldownPoliciesProps) {
    const t = useTranslations('setting');

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
        <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <ShieldAlert className="size-4 text-primary" />
                    <div>
                        <h3 className="text-sm font-semibold text-foreground/80">{t('healthProbe.cooldown.title')}</h3>
                        <p className="text-[11px] text-muted-foreground">{t('healthProbe.cooldown.subtitle')}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl bg-card border border-border p-4 shadow-2xs">
                <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-border bg-background p-2 text-center">
                        <div className="text-[10px] text-muted-foreground truncate">{t('healthProbe.cooldown.summary.total', { value: '' })}</div>
                        <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-foreground/90">{cooldownSummary.total}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-2 text-center">
                        <div className="text-[10px] text-muted-foreground truncate">{t('healthProbe.cooldown.summary.retryAfter', { value: '' })}</div>
                        <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-foreground/90">{cooldownSummary.retryAfter}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-2 text-center">
                        <div className="text-[10px] text-muted-foreground truncate">{t('healthProbe.cooldown.summary.modelScoped', { value: '' })}</div>
                        <div className="mt-0.5 text-sm font-bold font-mono tabular-nums text-foreground/90">{cooldownSummary.modelScoped}</div>
                    </div>
                </div>

                <div className="max-h-72 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                    <Accordion type="multiple" className="space-y-2">
                        {cooldownPolicies.map((policy) => (
                            <AccordionItem key={policy.reason} value={policy.reason} className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                                <AccordionTrigger className="items-center px-3 py-2.5 hover:no-underline hover:bg-muted/40">
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                        <div className="min-w-0 text-left">
                                            <div className="truncate text-xs font-semibold text-foreground/90">{reasonLabel(policy.reason)}</div>
                                            <div className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">{policy.reason}</div>
                                        </div>
                                        <div className="hidden flex-wrap gap-1 xl:flex ml-auto mr-4">
                                            <Badge variant="secondary" className="text-[9px] rounded-md font-normal">{formatSeconds(policy.base_seconds)}</Badge>
                                            <Badge variant="outline" className="text-[9px] rounded-md font-normal border-border/80">{t('healthProbe.cooldown.max', { value: formatSeconds(policy.max_seconds) })}</Badge>
                                            <Badge variant="outline" className="text-[9px] rounded-md font-normal border-border/80">{policy.scopes.map((scope) => scopeLabel(scope)).join(' / ')}</Badge>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="border-t border-border/45 px-3 pb-3 pt-2 text-[11px]">
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {policy.scopes.map((scope) => (
                                            <Badge key={`${policy.reason}-${scope}`} variant="outline" className="text-[9px] rounded-md font-normal border-border/60">
                                                {scopeLabel(scope)}
                                            </Badge>
                                        ))}
                                        {policy.uses_retry_after && (
                                            <Badge variant="secondary" className="text-[9px] rounded-md font-normal">{t('healthProbe.cooldown.retryAfter')}</Badge>
                                        )}
                                        {policy.exponential_backoff && (
                                            <Badge variant="outline" className="text-[9px] rounded-md font-normal border-border/60">{t('healthProbe.cooldown.exponential')}</Badge>
                                        )}
                                        {policy.model_scoped && (
                                            <Badge variant="outline" className="text-[9px] rounded-md font-normal border-border/60">{t('healthProbe.cooldown.modelScoped')}</Badge>
                                        )}
                                        {policy.cleared_on_success && (
                                            <Badge variant="outline" className="text-[9px] rounded-md font-normal border-border/60">{t('healthProbe.cooldown.clearedOnSuccess')}</Badge>
                                        )}
                                    </div>

                                    <div className="grid gap-2 text-[10px] text-muted-foreground sm:grid-cols-2">
                                        <div className="rounded-lg border border-border/75 bg-background px-3 py-2">
                                            <div>{t('healthProbe.cooldown.columns.scope')}</div>
                                            <div className="mt-1 font-semibold text-foreground/80">
                                                {policy.scopes.map((scope) => scopeLabel(scope)).join(' / ')}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-border/75 bg-background px-3 py-2">
                                            <div>{t('healthProbe.cooldown.columns.lifecycle')}</div>
                                            <div className="mt-1 font-semibold text-foreground/80">
                                                {policy.model_scoped ? t('healthProbe.cooldown.modelScoped') : t('healthProbe.cooldown.notModelScoped')}
                                            </div>
                                            <div className="mt-0.5">
                                                {policy.cleared_on_success ? t('healthProbe.cooldown.clearedOnSuccess') : t('healthProbe.cooldown.notClearedOnSuccess')}
                                            </div>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>

                <div className="text-[10px] text-muted-foreground leading-normal">{t('healthProbe.cooldown.note')}</div>
            </div>
        </section>
    );
}
