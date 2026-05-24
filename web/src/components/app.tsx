'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/api/endpoints/user';
import { LoginForm } from '@/components/pages/login';
import { APIKeyDashboard } from '@/components/pages/apikey-dashboard';
import { ContentLoader } from '@/route/content-loader';
import { AppShell } from '@/components/shared/app-shell';
import { useNavStore } from '@/stores/nav';
import { useQueryClient } from '@tanstack/react-query';
import { CONTENT_MAP } from '@/route';
import { apiClient } from '@/api/client';
import { logger } from '@/lib/logger';

const RETURNING_USER_KEY = 'octopus_visited';
const RETURNING_LOGO_MS = 300;
const LOGO_DRAW_END_MS = 1000;

export function AppContainer() {
    const { isAuthenticated, isAPIKeyAuth, isLoading: authLoading } = useAuth();
    const { activeItem } = useNavStore();
    const queryClient = useQueryClient();

    // Logo animation completion status (minimal loader delay)
    const [logoAnimationComplete, setLogoAnimationComplete] = useState(false);
    const bootstrapStartedRef = useRef(false);

    // Fade out first initial raw HTML page loader
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

    // Prefetch page data to speed up navigation transitions
    useEffect(() => {
        if (authLoading) return;
        if (!isAuthenticated) return;

        if (bootstrapStartedRef.current) return;
        bootstrapStartedRef.current = true;

        const prefetches: Array<Promise<unknown>> = [];

        if (isAPIKeyAuth) {
            prefetches.push(
                queryClient.prefetchQuery({
                    queryKey: ['apikey', 'dashboard', 'stats'],
                    queryFn: async () => apiClient.get('/api/v1/apikey/stats'),
                })
            );
        } else {
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

        Promise.allSettled(prefetches).catch((e) => {
            logger.warn('bootstrap prefetch failed:', e);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, isAuthenticated]);

    const isLoading = authLoading || !logoAnimationComplete;

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-primary">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-xl tracking-wider animate-pulse">
                    OCT
                </div>
            </div>
        );
    }

    if (isAPIKeyAuth) {
        return <APIKeyDashboard />;
    }

    if (!isAuthenticated) {
        return <LoginForm />;
    }

    return (
        <AppShell>
            <ContentLoader activeRoute={activeItem} />
        </AppShell>
    );
}
