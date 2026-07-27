import React from 'react';

/**
 * LiquidLoader Component
 * Standard loader for page and section loading in LouvorPlay.
 */
export function LiquidLoader({ fullScreen = false, text = 'LouvorPlay' }) {
    const loaderContent = (
        <div className="liquid-loader">
            <div className="flex flex-col items-center mb-1">
                <img 
                    src="/logo_official.png" 
                    alt="LouvorPlay" 
                    className="h-10 md:h-12 w-auto object-contain drop-shadow-md select-none animate-pulse" 
                />
            </div>

            <div className="loader-track">
                <div className="liquid-fill"></div>
            </div>
        </div>
    );

    if (fullScreen) {
        return (
            <div className="min-h-[60vh] w-full flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/50 transition-colors">
                {loaderContent}
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center p-6 w-full">
            {loaderContent}
        </div>
    );
}

export default LiquidLoader;
