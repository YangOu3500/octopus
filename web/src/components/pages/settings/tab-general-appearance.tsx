'use client';

import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Sun, Moon, Monitor, Languages } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettingStore, type Locale } from '@/stores/setting';

export function SettingAppearance() {
    const t = useTranslations('setting');
    const { theme, setTheme } = useTheme();
    const { locale, setLocale } = useSettingStore();

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 px-1 pb-1">
                <Sun className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground/80">{t('appearance')}</h3>
            </div>

            <div className="flex flex-col divide-y divide-border/40 rounded-2xl bg-card border border-border px-4 shadow-2xs">
                {/* 主题 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        {theme === 'dark' ? <Moon className="h-4 w-4 text-muted-foreground shrink-0" /> : <Sun className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <span className="text-sm font-medium text-foreground/90">{t('theme.label')}</span>
                    </div>
                    <Select value={theme} onValueChange={setTheme}>
                        <SelectTrigger className="w-48 rounded-xl bg-background">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="light" className="rounded-xl">
                                <span className="flex items-center gap-2 text-xs">
                                    <Sun className="size-3.5" />
                                    {t('theme.light')}
                                </span>
                            </SelectItem>
                            <SelectItem value="dark" className="rounded-xl">
                                <span className="flex items-center gap-2 text-xs">
                                    <Moon className="size-3.5" />
                                    {t('theme.dark')}
                                </span>
                            </SelectItem>
                            <SelectItem value="system" className="rounded-xl">
                                <span className="flex items-center gap-2 text-xs">
                                    <Monitor className="size-3.5" />
                                    {t('theme.system')}
                                </span>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* 语言 */}
                <div className="flex items-center justify-between gap-4 py-3">
                    <div className="flex items-center gap-3">
                        <Languages className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground/90">{t('language.label')}</span>
                    </div>
                    <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                        <SelectTrigger className="w-48 rounded-xl bg-background">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="zh_hans" className="rounded-xl text-xs">{t('language.zh_hans')}</SelectItem>
                            <SelectItem value="zh_hant" className="rounded-xl text-xs">{t('language.zh_hant')}</SelectItem>
                            <SelectItem value="en" className="rounded-xl text-xs">{t('language.en')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
    );
}
