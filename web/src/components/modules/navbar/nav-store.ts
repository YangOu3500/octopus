import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type NavItem = 'home' | 'site' | 'channel' | 'modelHealth' | 'group' | 'modelTest' | 'model' | 'traces' | 'log' | 'setting'

const NAV_ORDER: NavItem[] = ['home', 'site', 'channel', 'modelHealth', 'group', 'modelTest', 'model', 'traces', 'log', 'setting']

export type LogNavigationTarget = {
    logId?: number
    traceId?: string
    source?: string
    nonce: number
}

interface NavState {
    activeItem: NavItem
    prevItem: NavItem | null
    direction: number
    sidebarExpanded: boolean
    pendingLogTarget: LogNavigationTarget | null
    setActiveItem: (item: NavItem) => void
    setSidebarExpanded: (expanded: boolean) => void
    toggleSidebarExpanded: () => void
    openLogTarget: (target: Omit<LogNavigationTarget, 'nonce'>) => void
    clearLogTarget: (nonce?: number) => void
}

export const useNavStore = create<NavState>()(
    persist(
        (set, get) => ({
            activeItem: 'home',
            prevItem: null,
            direction: 0,
            sidebarExpanded: true,
            pendingLogTarget: null,
            setActiveItem: (item) => {
                const { activeItem } = get()
                const currentIndex = NAV_ORDER.indexOf(activeItem)
                const newIndex = NAV_ORDER.indexOf(item)
                const direction = newIndex > currentIndex ? 1 : -1

                set({
                    activeItem: item,
                    prevItem: activeItem,
                    direction
                })
            },
            setSidebarExpanded: (expanded) => {
                set({ sidebarExpanded: expanded })
            },
            toggleSidebarExpanded: () => {
                const { sidebarExpanded } = get()
                set({ sidebarExpanded: !sidebarExpanded })
            },
            openLogTarget: (target) => {
                const { activeItem } = get()
                const currentIndex = NAV_ORDER.indexOf(activeItem)
                const logIndex = NAV_ORDER.indexOf('log')

                set({
                    activeItem: 'log',
                    prevItem: activeItem,
                    direction: logIndex > currentIndex ? 1 : -1,
                    pendingLogTarget: {
                        ...target,
                        nonce: Date.now(),
                    },
                })
            },
            clearLogTarget: (nonce) => {
                const { pendingLogTarget } = get()
                if (nonce !== undefined && pendingLogTarget?.nonce !== nonce) return
                set({ pendingLogTarget: null })
            },
        }),
        {
            name: 'nav-storage',
            version: 2,
            storage: createJSONStorage(() => localStorage),
            migrate: (persistedState) => {
                const state = (persistedState ?? {}) as Partial<NavState>
                return {
                    activeItem: NAV_ORDER.includes(state.activeItem as NavItem) ? state.activeItem : 'home',
                    prevItem: NAV_ORDER.includes(state.prevItem as NavItem) ? state.prevItem : null,
                    direction: typeof state.direction === 'number' ? state.direction : 0,
                    // Reset old persisted collapsed state so upgraded users land on the expanded desktop sidebar.
                    sidebarExpanded: true,
                }
            },
            partialize: (state) => ({
                activeItem: state.activeItem,
                prevItem: state.prevItem,
                direction: state.direction,
                sidebarExpanded: state.sidebarExpanded,
            }),
        }
    )
)
