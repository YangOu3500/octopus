'use client';

export function ModelTest() {
    return (
        <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Model Test</h1>
                <p className="text-sm text-muted-foreground">Test models, streams and latencies directly.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-xs">
                <p className="text-sm text-muted-foreground">Model test workbench will be implemented in Phase 5.</p>
            </div>
        </div>
    );
}
