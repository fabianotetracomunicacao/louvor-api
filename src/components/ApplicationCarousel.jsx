import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getSongFunctions } from '../utils/storage';

export function ApplicationCarousel({ onSelect }) {
    const [functions, setFunctions] = useState([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        let isMounted = true;
        getSongFunctions().then((data) => {
            if (!isMounted) return;
            if (data) {
                setFunctions(data.sort((a, b) => a.name.localeCompare(b.name)));
            }
            setLoading(false);
        });
        return () => {
            isMounted = false;
        };
    }, []);

    // Auto-scroll logic
    useEffect(() => {
        let interval;
        if (!isHovered && functions.length > 0) {
            interval = setInterval(() => {
                if (scrollRef.current) {
                    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
                    if (scrollLeft + clientWidth >= scrollWidth - 10) {
                        scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                    } else {
                        scrollRef.current.scrollBy({ left: 160, behavior: 'smooth' });
                    }
                }
            }, 3000); 
        }
        return () => clearInterval(interval);
    }, [functions, isHovered]);

    const scroll = (direction) => {
        if (scrollRef.current) {
            const amount = 200;
            if (direction === 'right') {
                const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
                if (scrollLeft + clientWidth >= scrollWidth - 10) {
                    scrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                } else {
                    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
                }
            } else {
                scrollRef.current.scrollBy({ left: -amount, behavior: 'smooth' });
            }
        }
    };

    if (loading || functions.length === 0) return null;

    return (
        <div
            className="relative flex items-center justify-center group w-full max-w-xl mx-auto"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <button
                onClick={() => scroll('left')}
                className="absolute left-0 z-10 p-1.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-full shadow-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:scale-110 transition -ml-5 border border-slate-200 dark:border-slate-700"
            >
                <ChevronLeft size={18} />
            </button>

            <div
                ref={scrollRef}
                className="flex gap-3 overflow-hidden py-3 px-1 scroll-smooth w-full"
            >
                {functions.map(func => (
                    <button
                        key={func.id}
                        onClick={() => onSelect(func.name)}
                        className="flex-shrink-0 flex items-center px-4 py-1.5 rounded-xl text-[10px] font-black bg-white/20 dark:bg-white/5 backdrop-blur-xl text-slate-900 dark:text-white border border-white/40 dark:border-white/10 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-white/40 dark:hover:bg-white/10 transition-all shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] hover:shadow-xl whitespace-nowrap uppercase tracking-widest"
                    >
                        {func.name}
                    </button>
                ))}
            </div>

            <button
                onClick={() => scroll('right')}
                className="absolute right-0 z-10 p-1.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-full shadow-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:scale-110 transition -mr-5 border border-slate-200 dark:border-slate-700"
            >
                <ChevronRight size={18} />
            </button>
        </div>
    );
}
