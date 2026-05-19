
'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from "motion/react"
import { useAuth } from '@/api/endpoints/user';
import { LoginForm } from '@/components/modules/login';
import { APIKeyDashboard } from '@/components/modules/apikey-dashboard';
import { ContentLoader } from '@/route/content-loader';
import { NavBar, useNavStore } from '@/components/modules/navbar';
import { useTranslations } from 'next-intl'
import Logo, { LOGO_DRAW_END_MS } from '@/components/modules/logo';
import { Toolbar } from '@/components/modules/toolbar';
import { ChannelTabSwitcher, ChannelHeaderActions } from '@/components/modules/channel/TabSwitcher';
import { ENTRANCE_VARIANTS } from '@/lib/animations/fluid-transitions';
import { useQueryClient } from '@tanstack/react-query';
import { CONTENT_MAP } from '@/route';
import { apiClient } from '@/api/client';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

const RETURNING_USER_KEY = 'octopus_visited';
const RETURNING_LOGO_MS = 300;

export function AppContainer() {
    const { isAuthenticated, isAPIKeyAuth, isLoading: authLoading } = useAuth();
    const { activeItem, direction, sidebarExpanded } = useNavStore();
    const t = useTranslations('navbar');
    const queryClient = useQueryClient();

    // Logo 动画完成状态 — 回访用户缩短动画时间
    const [logoAnimationComplete, setLogoAnimationComplete] = useState(false);
    const bootstrapStartedRef = useRef(false);

    // 首屏最早的 server-rendered loader：一旦客户端开始渲染，就淡出移除
    useEffect(() => {
        const el = document.getElementById('initial-loader');
        if (!el) return;

        el.classList.add('octo-hide');
        const timer = setTimeout(() => el.remove(), 220);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const isReturning = sessionStorage.getItem(RETURNING_USER_KEY) === '1';
        const duration = isReturning ? RETURNING_LOGO_MS : LOGO_DRAW_END_MS;
        const timer = setTimeout(() => {
            setLogoAnimationComplete(true);
            sessionStorage.setItem(RETURNING_USER_KEY, '1');
        }, duration);
        return () => clearTimeout(timer);
    }, []);

    // 后台预取数据 — 不阻塞内容渲染，React Query 缓存就绪后自动触发组件重渲染
    useEffect(() => {
        if (authLoading) return;
        if (!isAuthenticated) return;

        if (bootstrapStartedRef.current) return;
        bootstrapStartedRef.current = true;

        const prefetches: Array<Promise<unknown>> = [];

        // API Key 认证模式：预取 dashboard stats
        if (isAPIKeyAuth) {
            prefetches.push(
                queryClient.prefetchQuery({
                    queryKey: ['apikey', 'dashboard', 'stats'],
                    queryFn: async () => apiClient.get('/api/v1/apikey/stats'),
                })
            );
        } else {
            // 普通用户认证模式：预取对应页面数据
            const component = CONTENT_MAP[activeItem];
            if (component?.preload) {
                prefetches.push(component.preload());
            }

            switch (activeItem) {
                case 'home': {
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['stats', 'total'],
                            queryFn: async () => apiClient.get('/api/v1/stats/total'),
                        })
                    );
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['stats', 'daily'],
                            queryFn: async () => apiClient.get('/api/v1/stats/daily'),
                        })
                    );
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['stats', 'hourly'],
                            queryFn: async () => apiClient.get('/api/v1/stats/hourly'),
                        })
                    );
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['channels', 'list'],
                            queryFn: async () => apiClient.get('/api/v1/channel/list'),
                        })
                    );
                    break;
                }
                case 'site': {
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['sites', 'list'],
                            queryFn: async () => apiClient.get('/api/v1/site/list'),
                        })
                    );
                    break;
                }
                case 'channel': {
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['channels', 'list'],
                            queryFn: async () => apiClient.get('/api/v1/channel/list'),
                        })
                    );
                    break;
                }
                case 'modelHealth': {
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['channels', 'list'],
                            queryFn: async () => apiClient.get('/api/v1/channel/list'),
                        })
                    );
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['channels', 'model-health', '24h', null, '', 'all', 'all'],
                            queryFn: async () => apiClient.get('/api/v1/channel/model-health', {
                                time_range: '24h',
                                source: 'all',
                                quota_status: 'all',
                            }),
                        })
                    );
                    break;
                }
                case 'group': {
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['groups', 'list'],
                            queryFn: async () => apiClient.get('/api/v1/group/list'),
                        })
                    );
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['models', 'channel'],
                            queryFn: async () => apiClient.get('/api/v1/model/channel'),
                        })
                    );
                    break;
                }
                case 'modelTest': {
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['models', 'channel'],
                            queryFn: async () => apiClient.get('/api/v1/model/channel'),
                        })
                    );
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['channels', 'list'],
                            queryFn: async () => apiClient.get('/api/v1/channel/list'),
                        })
                    );
                    break;
                }
                case 'model': {
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['models', 'list'],
                            queryFn: async () => apiClient.get('/api/v1/model/list'),
                        })
                    );
                    break;
                }
                case 'traces': {
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['request-traces', { page: 1, page_size: 25, time_range: '24h', sort_by: 'time', sort_order: 'desc' }],
                            queryFn: async () => apiClient.get('/api/v1/log/traces', {
                                page: 1,
                                page_size: 25,
                                time_range: '24h',
                                sort_by: 'time',
                                sort_order: 'desc',
                            }),
                        })
                    );
                    break;
                }
                case 'setting': {
                    prefetches.push(
                        queryClient.prefetchQuery({
                            queryKey: ['apikeys', 'list'],
                            queryFn: async () => apiClient.get('/api/v1/apikey/list'),
                        })
                    );
                    break;
                }
                default:
                    break;
            }
        }

        // 后台静默运行，不阻塞渲染
        Promise.allSettled(prefetches).catch((e) => {
            logger.warn('bootstrap prefetch failed:', e);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, isAuthenticated]);

    // 加载状态 — 仅等待认证和 Logo 动画，不再等待数据预取
    const isLoading = authLoading || !logoAnimationComplete;

    // 加载页面
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Logo size={120} animate />
            </div>
        );
    }

    // API Key 认证模式 - 显示 API Key Dashboard
    if (isAPIKeyAuth) {
        return (
            <AnimatePresence mode="wait">
                <APIKeyDashboard key="apikey-dashboard" />
            </AnimatePresence>
        );
    }

    // 登录页面
    if (!isAuthenticated) {
        return (
            <AnimatePresence mode="wait">
                <LoginForm key="login" />
            </AnimatePresence>
        );
    }

    // 主界面
    return (
        <motion.div
            key="main-app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16 }}
            className={cn(
                'flex h-dvh w-full max-w-none flex-col overflow-hidden px-3 md:grid md:gap-3 md:px-4 xl:px-5',
                sidebarExpanded ? 'md:grid-cols-[14.5rem_minmax(0,1fr)]' : 'md:grid-cols-[4.75rem_minmax(0,1fr)]'
            )}
        >
            <NavBar />
            <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
                <header className="my-3 flex flex-none flex-col gap-3 px-1 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="md:hidden">
                            <Logo size={36} />
                        </div>
                        <AnimatePresence mode="wait" custom={direction}>
                            <motion.div
                                key={activeItem}
                                custom={direction}
                                variants={{
                                    initial: (direction: number) => ({
                                        y: 32 * direction,
                                        opacity: 0
                                    }),
                                    animate: {
                                        y: 0,
                                        opacity: 1
                                    },
                                    exit: (direction: number) => ({
                                        y: -32 * direction,
                                        opacity: 0
                                    })
                                }}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{ duration: 0.15 }}
                                className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-end lg:gap-4"
                            >
                                <span className="truncate text-2xl font-bold lg:text-[2rem]">{t(activeItem)}</span>
                                {activeItem === 'channel' && <ChannelTabSwitcher />}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                    <div className="flex items-center gap-2 lg:ml-auto">
                        {activeItem === 'channel' && <ChannelHeaderActions />}
                        <Toolbar />
                    </div>
                </header>
                <AnimatePresence mode="sync" initial={false}>
                    <motion.div
                        key={activeItem}
                        variants={ENTRANCE_VARIANTS.content}
                        initial="initial"
                        animate="animate"
                        exit={{
                            opacity: 0,
                            scale: 0.995,
                        }}
                        transition={{ duration: 0.12 }}
                        className="h-full min-h-0 flex-1"
                    >
                        <ContentLoader activeRoute={activeItem} />
                    </motion.div>
                </AnimatePresence>
            </main>
        </motion.div>
    );
}
