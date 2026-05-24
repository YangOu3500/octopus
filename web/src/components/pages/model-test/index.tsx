'use client';

import { useTranslations } from 'next-intl';

export function ModelTest() {
    const t = useTranslations('navbar');
    const s = useTranslations('stubs');

    return (
        <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('modelTest')}</h1>
                <p className="text-sm text-muted-foreground">{s('description.modelTest')}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xs">
                <p className="text-sm text-muted-foreground">{s('comingSoon', { phase: 5 })}</p>
            </div>
        </div>
    );
}
