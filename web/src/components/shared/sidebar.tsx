'use client';

import { useNavStore, type NavItem } from "@/stores/nav";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSettingStore } from "@/stores/setting";
import { ROUTES } from "@/route/config";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen, Sun, Moon, Languages } from "lucide-react";

export function Sidebar() {
    const t = useTranslations('navbar');
    const { activeItem, setActiveItem, sidebarExpanded, toggleSidebarExpanded } = useNavStore();
    const { theme, setTheme } = useTheme();
    const { locale, setLocale } = useSettingStore();

    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
    const toggleLocale = () => setLocale(locale === 'en' ? 'zh_hans' : 'en');
    const ToggleIcon = sidebarExpanded ? PanelLeftClose : PanelLeftOpen;

    return (
        <aside
            className={cn(
                "hidden md:flex flex-col border-r border-border bg-card text-card-foreground h-screen sticky top-0 transition-[width] duration-150 z-20 shrink-0",
                sidebarExpanded ? "w-60" : "w-16"
            )}
        >
            {/* Top Brand Logo */}
            <div className="flex h-14 items-center px-4 border-b border-border gap-3 overflow-hidden">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-sm tracking-wider">
                    OCT
                </div>
                {sidebarExpanded && (
                    <div className="flex flex-col min-w-0 select-none">
                        <span className="text-xs font-bold uppercase tracking-wider truncate">{t('brand')}</span>
                        <span className="text-[10px] text-muted-foreground truncate">{t('shellHint')}</span>
                    </div>
                )}
            </div>

            {/* Navigation Menu */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {ROUTES.map((route) => {
                    const isActive = activeItem === route.id;
                    return (
                        <button
                            key={route.id}
                            type="button"
                            onClick={() => setActiveItem(route.id as NavItem)}
                            className={cn(
                                "flex items-center w-full gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group outline-none",
                                isActive
                                    ? "bg-primary text-primary-foreground font-semibold"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                            title={!sidebarExpanded ? t(route.id) : undefined}
                        >
                            <route.icon className="h-4 w-4 shrink-0" />
                            {sidebarExpanded && (
                                <span className="truncate">{t(route.id)}</span>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Bottom Actions Footer */}
            <div className="p-3 border-t border-border space-y-1">
                <div className={cn("flex gap-1", sidebarExpanded ? "flex-row justify-between items-center" : "flex-col items-center")}>
                    <button
                        type="button"
                        onClick={toggleTheme}
                        title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted outline-none transition-colors"
                    >
                        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                    
                    <button
                        type="button"
                        onClick={toggleLocale}
                        title="Switch Language"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted outline-none transition-colors"
                    >
                        <Languages className="h-4 w-4" />
                    </button>

                    <button
                        type="button"
                        onClick={toggleSidebarExpanded}
                        title={sidebarExpanded ? t('collapse') : t('expand')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted outline-none transition-colors"
                    >
                        <ToggleIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
