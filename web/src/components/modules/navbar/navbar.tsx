'use client'

import { motion } from 'motion/react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useTranslations } from 'next-intl'
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
                'group grid w-full items-center rounded-2xl border py-2.5 pl-2.5 pr-3 text-left transition-all duration-200',
                expanded ? 'grid-cols-[2.25rem_minmax(0,1fr)] gap-3' : 'grid-cols-[2.25rem_0fr] gap-0',
                isActive
                    ? 'border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                    : 'border-transparent text-sidebar-foreground/75 hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
            )}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
        >
            <span
                className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors',
                    isActive
                        ? 'border-sidebar-primary-foreground/15 bg-sidebar-primary-foreground/10'
                        : 'border-sidebar-border/70 bg-background/70 group-hover:border-sidebar-border'
                )}
            >
                <route.icon className="size-4" strokeWidth={2} />
            </span>
            <span
                className={cn(
                    'min-w-0 overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-200',
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

    return (
        <motion.aside
            aria-label="Main Navigation"
            className={cn(
                'hidden md:flex md:sticky md:top-3 md:h-[calc(100dvh-1.5rem)] md:flex-col md:overflow-hidden md:rounded-[1.5rem] md:border md:border-sidebar-border md:bg-sidebar/95 md:p-3 md:text-sidebar-foreground md:shadow-sm',
                sidebarExpanded ? 'md:w-[15rem]' : 'md:w-[5.25rem]'
            )}
            variants={ENTRANCE_VARIANTS.navbar}
            initial="initial"
            animate="animate"
        >
            <div className={cn('mb-3 flex gap-2', sidebarExpanded ? 'items-center justify-between' : 'flex-col items-center')}>
                <div className={cn('flex min-w-0 items-center gap-2', !sidebarExpanded && 'justify-center')}>
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sidebar-border bg-background/80">
                        <Logo size={24} />
                    </div>
                    {sidebarExpanded ? (
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-sidebar-foreground">{t('brand')}</div>
                            <div className="truncate text-xs text-sidebar-foreground/55">{t('shellHint')}</div>
                        </div>
                    ) : null}
                </div>

                <button
                    type="button"
                    onClick={toggleSidebarExpanded}
                    className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sidebar-border/70 bg-background/70 text-sidebar-foreground/70 transition-colors hover:border-sidebar-border hover:text-sidebar-foreground"
                    title={sidebarExpanded ? t('collapse') : t('expand')}
                    aria-label={sidebarExpanded ? t('collapse') : t('expand')}
                >
                    <ToggleIcon className="size-4" />
                </button>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto pr-0.5">
                {ROUTES.map((route) => (
                    <DesktopNavItem key={route.id} item={route.id as NavItem} expanded={sidebarExpanded} />
                ))}
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
