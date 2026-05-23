'use client'

import { motion, AnimatePresence } from 'motion/react'
import { PanelLeftClose, PanelLeftOpen, Sun, Moon, Languages, Monitor } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useSettingStore, type Locale } from '@/stores/setting'
import Logo from '@/components/modules/logo'
import { cn } from '@/lib/utils'
import { useNavStore, type NavItem } from './nav-store'
import { ROUTES } from '@/route/config'
import { usePreload } from '@/route/use-preload'
import { ENTRANCE_VARIANTS } from '@/lib/animations/fluid-transitions'

type NavRoute = (typeof ROUTES)[number]

function getRoute(item: NavItem): NavRoute {
    const route = ROUTES.find((entry) => entry.id === item)
    if (!route) {
        throw new Error(`missing route config: ${item}`)
    }
    return route
}

function DesktopNavItem({
    item,
    expanded,
}: {
    item: NavItem
    expanded: boolean
}) {
    const t = useTranslations('navbar')
    const { activeItem, setActiveItem } = useNavStore()
    const { preload } = usePreload()
    const route = getRoute(item)
    const isActive = activeItem === item

    return (
        <motion.button
            type="button"
            onClick={() => setActiveItem(item)}
            onMouseEnter={() => preload(item)}
            title={expanded ? undefined : t(item)}
            className={cn(
                'group grid w-full items-center rounded-xl border py-2 pl-2 pr-3 text-left transition-all duration-300 relative overflow-hidden',
                expanded ? 'grid-cols-[2.25rem_minmax(0,1fr)] gap-3' : 'grid-cols-[2.25rem_0fr] gap-0',
                isActive
                    ? 'border-primary/20 bg-gradient-to-r from-primary/15 to-secondary/5 text-primary shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_0_12px_rgba(var(--primary),0.08)]'
                    : 'border-transparent text-sidebar-foreground/70 hover:border-sidebar-border/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )}
            whileHover={{ y: -0.5 }}
            whileTap={{ scale: 0.98 }}
        >
            {isActive && (
                <span className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-r bg-primary shadow-[0_0_8px_oklch(var(--primary))]" />
            )}
            <span
                className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-300',
                    isActive
                        ? 'border-primary/30 bg-primary/10 text-primary shadow-[0_0_8px_oklch(var(--primary)/0.25)]'
                        : 'border-sidebar-border/40 bg-background/40 group-hover:border-sidebar-border group-hover:bg-background/80'
                )}
            >
                <route.icon className="size-3.5" strokeWidth={2} />
            </span>
            <span
                className={cn(
                    'min-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold tracking-wide transition-all duration-200',
                    expanded ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-1 opacity-0'
                )}
            >
                {t(item)}
            </span>
        </motion.button>
    )
}

function DesktopSidebar() {
    const t = useTranslations('navbar')
    const sidebarExpanded = useNavStore((state) => state.sidebarExpanded)
    const toggleSidebarExpanded = useNavStore((state) => state.toggleSidebarExpanded)
    const ToggleIcon = sidebarExpanded ? PanelLeftClose : PanelLeftOpen
    const { theme, setTheme } = useTheme()
    const { locale, setLocale } = useSettingStore()

    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')
    const toggleLocale = () => setLocale(locale === 'en' ? 'zh_hans' : 'en')

    return (
        <motion.aside
            aria-label="Main Navigation"
            className={cn(
                'hidden md:flex md:sticky md:top-3 md:h-[calc(100dvh-1.5rem)] md:flex-col md:overflow-hidden md:rounded-2xl md:border md:border-sidebar-border/40 md:bg-sidebar/35 md:p-3 md:text-sidebar-foreground md:shadow-[0_8px_32px_rgba(0,0,0,0.15)] md:backdrop-blur-xl transition-[width] duration-300',
                sidebarExpanded ? 'md:w-[17rem]' : 'md:w-[5.5rem]'
            )}
            variants={ENTRANCE_VARIANTS.navbar}
            initial="initial"
            animate="animate"
        >
            <div className={cn('mb-6 flex min-w-0 items-center gap-2.5', !sidebarExpanded && 'flex-col justify-center')}>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sidebar-border/40 bg-background/50 backdrop-blur-md shadow-sm">
                    <Logo size={22} />
                </div>
                {sidebarExpanded ? (
                    <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold tracking-wider uppercase text-sidebar-foreground">{t('brand')}</div>
                        <div className="truncate text-[11px] font-semibold text-sidebar-foreground/50">{t('shellHint')}</div>
                    </div>
                ) : null}
            </div>

            <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5 scrollbar-thin">
                {ROUTES.map((route) => (
                    <DesktopNavItem key={route.id} item={route.id as NavItem} expanded={sidebarExpanded} />
                ))}
            </div>
            <div className="mt-4 pt-4 border-t border-sidebar-border/50 flex flex-col gap-2">
                <div className={cn("flex", sidebarExpanded ? "flex-row items-center gap-2" : "flex-col items-center gap-2")}>
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className={cn(
                            "flex shrink-0 items-center justify-center rounded-xl border border-sidebar-border/50 bg-background/30 text-sidebar-foreground/75 transition-all duration-200 hover:border-primary/30 hover:bg-background/80 hover:text-foreground",
                            sidebarExpanded ? "h-10 flex-1" : "size-10"
                        )}
                        title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    >
                        {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={toggleLocale}
                        className={cn(
                            "flex shrink-0 items-center justify-center rounded-xl border border-sidebar-border/50 bg-background/30 text-sidebar-foreground/75 transition-all duration-200 hover:border-primary/30 hover:bg-background/80 hover:text-foreground",
                            sidebarExpanded ? "h-10 flex-1" : "size-10"
                        )}
                        title="Switch Language"
                    >
                        <Languages className="size-4" />
                    </button>
                    <button
                        type="button"
                        onClick={toggleSidebarExpanded}
                        className={cn(
                            "flex shrink-0 items-center justify-center rounded-xl border border-sidebar-border/50 bg-background/30 text-sidebar-foreground/75 transition-all duration-200 hover:border-primary/30 hover:bg-background/80 hover:text-foreground",
                            sidebarExpanded ? "h-10 px-3 flex-[2] gap-2" : "size-10"
                        )}
                        title={sidebarExpanded ? t('collapse') : t('expand')}
                    >
                        <ToggleIcon className="size-4" />
                        {sidebarExpanded && <span className="text-xs font-semibold">{t('collapse')}</span>}
                    </button>
                </div>
            </div>
        </motion.aside>
    )
}

function MobileDock() {
    const { activeItem, setActiveItem } = useNavStore()
    const { preload } = usePreload()

    return (
        <motion.nav
            aria-label="Main Navigation"
            className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-[1.5rem] border border-sidebar-border bg-sidebar/95 p-2 text-sidebar-foreground shadow-sm md:hidden"
            variants={ENTRANCE_VARIANTS.navbar}
            initial="initial"
            animate="animate"
        >
            {ROUTES.map((route, index) => {
                const isActive = activeItem === route.id
                return (
                    <motion.button
                        key={route.id}
                        type="button"
                        onClick={() => setActiveItem(route.id as NavItem)}
                        onMouseEnter={() => preload(route.id)}
                        className={cn(
                            'relative rounded-2xl p-2.5',
                            isActive
                                ? 'text-sidebar-primary-foreground'
                                : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/60'
                        )}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{
                            opacity: 1,
                            scale: 1,
                            transition: {
                                delay: index * 0.04,
                                duration: 0.25,
                            },
                        }}
                        whileTap={{ scale: 0.94 }}
                    >
                        {isActive ? (
                            <motion.div
                                layoutId="navbar-mobile-indicator"
                                className="absolute inset-0 rounded-2xl bg-sidebar-primary"
                                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                            />
                        ) : null}
                        <span className="relative z-10">
                            <route.icon className="size-4" strokeWidth={2} />
                        </span>
                    </motion.button>
                )
            })}
        </motion.nav>
    )
}

export function NavBar() {
    return (
        <>
            <DesktopSidebar />
            <MobileDock />
        </>
    )
}
