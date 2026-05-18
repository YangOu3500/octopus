import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NavItem = 'home' | 'site' | 'channel' | 'group' | 'modelTest' | 'model' | 'traces' | 'log' | 'setting'

const NAV_ORDER: NavItem[] = ['home', 'site', 'channel', 'group', 'modelTest', 'model', 'traces', 'log', 'setting']

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
    pendingLogTarget: LogNavigationTarget | null
    setActiveItem: (item: NavItem) => void
    openLogTarget: (target: Omit<LogNavigationTarget, 'nonce'>) => void
    clearLogTarget: (nonce?: number) => void
}

export const useNavStore = create<NavState>()(
    persist(
        (set, get) => ({
            activeItem: 'home',
            prevItem: null,
            direction: 0,
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
            partialize: (state) => ({
                activeItem: state.activeItem,
                prevItem: state.prevItem,
                direction: state.direction,
            }),
        }
    )
)
