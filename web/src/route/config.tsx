import { lazyWithPreload } from './lazy-with-preload';
import { lazy, ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FlaskConical, HeartPulse, Home, Radio, Sparkles, FolderTree, Settings, Logs, Globe2, Radar, TrendingUp } from 'lucide-react';

export type LazyComponent = ReturnType<typeof lazy> & {
    preload: () => Promise<{ default: ComponentType<Record<string, never>> }>
};

export interface RouteConfig {
    id: string;
    label: string;
    icon: LucideIcon;
    component: LazyComponent;
}

const Home_Module = lazyWithPreload(() => import('@/components/pages/home').then(m => ({ default: m.Home })));
const Site_Module = lazyWithPreload(() => import('@/components/pages/site').then(m => ({ default: m.Site })));
const Channel_Module = lazyWithPreload(() => import('@/components/pages/channel').then(m => ({ default: m.Channel })));
const ModelHealth_Module = lazyWithPreload(() => import('@/components/pages/model-health').then(m => ({ default: m.ModelHealth })));
const ModelTest_Module = lazyWithPreload(() => import('@/components/pages/model-test').then(m => ({ default: m.ModelTest })));
const Group_Module = lazyWithPreload(() => import('@/components/pages/group').then(m => ({ default: m.Group })));
const Model_Module = lazyWithPreload(() => import('@/components/pages/model').then(m => ({ default: m.Model })));
const Traces_Module = lazyWithPreload(() => import('@/components/pages/traces').then(m => ({ default: m.Traces })));
const Log_Module = lazyWithPreload(() => import('@/components/pages/log').then(m => ({ default: m.Log })));
const Analytics_Module = lazyWithPreload(() => import('@/components/pages/analytics').then(m => ({ default: m.Analytics })));
const Setting_Module = lazyWithPreload(() => import('@/components/pages/settings').then(m => ({ default: m.Setting })));

export const ROUTES: RouteConfig[] = [
    { id: 'home', label: 'Home', icon: Home, component: Home_Module },
    { id: 'site', label: 'Site', icon: Globe2, component: Site_Module },
    { id: 'channel', label: 'Channel', icon: Radio, component: Channel_Module },
    { id: 'modelHealth', label: 'Model Health', icon: HeartPulse, component: ModelHealth_Module },
    { id: 'modelTest', label: 'Model Test', icon: FlaskConical, component: ModelTest_Module },
    { id: 'group', label: 'Group', icon: FolderTree, component: Group_Module },
    { id: 'model', label: 'Model', icon: Sparkles, component: Model_Module },
    { id: 'traces', label: 'Traces', icon: Radar, component: Traces_Module },
    { id: 'log', label: 'Log', icon: Logs, component: Log_Module },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp, component: Analytics_Module },
    { id: 'setting', label: 'Setting', icon: Settings, component: Setting_Module },
];

export const CONTENT_MAP = ROUTES.reduce((acc, route) => {
    acc[route.id] = route.component;
    return acc;
}, {} as Record<string, LazyComponent>);
