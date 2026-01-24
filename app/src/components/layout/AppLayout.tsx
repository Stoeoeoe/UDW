import React, { ReactNode } from 'react';
import clsx from 'clsx';

interface AppLayoutProps {
    topBar: ReactNode;
    leftPanel: ReactNode;
    rightPanel: ReactNode;
    viewport: ReactNode;
    leftPanelOpen?: boolean;
    rightPanelOpen?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
    topBar,
    leftPanel,
    rightPanel,
    viewport,
    leftPanelOpen = true,
    rightPanelOpen = true,
}) => {
    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-900 text-slate-200 font-sans select-none">
            {/* Top Bar Area */}
            <div className="h-12 border-b border-slate-800 bg-slate-900 z-20 flex-shrink-0">
                {topBar}
            </div>

            {/* Main Workspace Area */}
            <div className="flex flex-1 overflow-hidden min-h-0">

                {/* Left Panel */}
                <div
                    className={clsx(
                        "flex-shrink-0 bg-slate-900 border-r border-slate-800 transition-all duration-200 ease-in-out",
                        leftPanelOpen ? "w-80" : "w-0 border-r-0"
                    )}
                >
                    <div className="h-full w-80 overflow-hidden flex flex-col">
                        {leftPanel}
                    </div>
                </div>

                {/* Viewport (Center) */}
                <div className="flex-1 bg-slate-950 relative z-0 overflow-hidden shadow-inner flex flex-col">
                    {viewport}
                </div>

                {/* Right Panel */}
                <div
                    className={clsx(
                        "flex-shrink-0 bg-slate-900 border-l border-slate-800 transition-all duration-200 ease-in-out",
                        rightPanelOpen ? "w-80" : "w-0 border-l-0"
                    )}
                >
                    <div className="h-full w-80 overflow-hidden flex flex-col">
                        {rightPanel}
                    </div>
                </div>

            </div>

            {/* Optional Status Bar (future) */}
            <div className="h-6 bg-slate-900 border-t border-slate-800 flex items-center px-2 text-xs text-slate-500 z-20 flex-shrink-0">
                <span>Ready</span>
            </div>
        </div>
    );
};
