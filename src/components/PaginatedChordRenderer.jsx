import React, { useState, useLayoutEffect, useRef } from 'react';
import { Info } from 'lucide-react';

// Helpers
// 1mm = ~3.78px
const MM_TO_PX = 3.7795275591;
const A4_HEIGHT_MM = 292; // Reduced from 297 for safety
const PADDING_Y_MM = 20; // 10mm top + 10mm bottom
// Available content height in MM
const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - PADDING_Y_MM;
// Safety buffer to ensure we break layouts early rather than late
const SAFETY_BUFFER_PX = 0;

export function PaginatedChordRenderer({ content, fontSize, tabFontSize, lineSpacing, letterSpacing = 0, title, artist, transposition, originalKey, isPlaylist, columnCount = 1, displayMode = 'full', isInternet = false }) {
    const lines = React.useMemo(() => {
        if (!content) return [];

        const rawLines = content.split('\n');

        // Block State
        let activeBlockLabel = null;
        let isTab = false;

        // PASS 1: Build allLines — includes EVERY line (tabs + blanks) with metadata
        const allLines = [];
        rawLines.forEach((line, rawIndex) => {
            const trimmed = line.trim();

            // Tab Control markers — not added as lines, just toggle state
            if (trimmed === '{sot}' || trimmed === '{start_of_tab}') { isTab = true; return; }
            if (trimmed === '{eot}' || trimmed === '{end_of_tab}') { isTab = false; return; }

            // Tag Block Start
            const tagStartMatch = trimmed.match(/^\{tag:\s*(.*?)\}$/i);
            if (tagStartMatch) {
                activeBlockLabel = tagStartMatch[1];
                return;
            }

            // Tag Block End
            if (trimmed === '{endtag}') {
                activeBlockLabel = null;
                return;
            }

            // Implicit Tab Detection
            const isImplicitTab = /^[A-Ga-g]\|/.test(trimmed) && (trimmed.match(/-/g) || []).length > 2;

            const lineObj = {
                rawIndex,
                text: line,
                isBold: false,
                isTab: isTab || isImplicitTab,
                blockLabel: activeBlockLabel
            };

            allLines.push(lineObj);
        });

        // PASS 2: If tabs are suppressed, remove blank lines sandwiched between tab lines.
        // We work on allLines (which still contains tab lines) so we can correctly look up neighbors.
        let filteredLines = allLines;
        if (displayMode === 'no_tabs' || displayMode === 'only_tabs') {
            filteredLines = allLines.filter((lineObj, i) => {
                // Non-blank lines are always kept at this stage
                if (lineObj.text.trim() !== '') return true;

                // Find nearest real (non-blank) neighbor before this line
                let prevIsTab = true; // default to tab if no real neighbor exists
                for (let j = i - 1; j >= 0; j--) {
                    if (allLines[j].text.trim() === '') continue;
                    prevIsTab = allLines[j].isTab;
                    break;
                }

                // Find nearest real (non-blank) neighbor after this line
                let nextIsTab = true; // default to tab if no real neighbor exists
                for (let j = i + 1; j < allLines.length; j++) {
                    if (allLines[j].text.trim() === '') continue;
                    nextIsTab = allLines[j].isTab;
                    break;
                }

                // Suppress this blank if it's sandwiched between tab sections
                return !(prevIsTab && nextIsTab);
            });
        }

        // PASS 3: Apply displayMode filter (remove actual tab or non-tab lines)
        const finalLines = filteredLines.filter(lineObj => {
            if (lineObj.isTab) return displayMode !== 'no_tabs';
            return displayMode !== 'only_tabs';
        });

        // Add block metadata based on the final visible lines
        return finalLines.map((lineObj, i) => {
            if (!lineObj.blockLabel) {
                return { ...lineObj, block: null };
            }
            
            const prev = finalLines[i - 1];
            const next = finalLines[i + 1];
            
            const isStart = !prev || prev.blockLabel !== lineObj.blockLabel;
            const isEnd = !next || next.blockLabel !== lineObj.blockLabel;
            
            return {
                ...lineObj,
                block: {
                    label: lineObj.blockLabel,
                    isStart,
                    isEnd
                }
            };
        });

    }, [content, displayMode]); // Re-calc if displayMode changes


    return (
        <PaginationManager
            lines={lines}
            fontSize={fontSize}
            tabFontSize={tabFontSize}
            lineSpacing={lineSpacing}
            letterSpacing={letterSpacing}
            title={title}
            artist={artist}
            transposition={transposition}
            originalKey={originalKey}
            isPlaylist={isPlaylist}
            columnCount={columnCount}
            isInternet={isInternet}
        />
    );
}

function PaginationManager({ lines, fontSize, tabFontSize, lineSpacing, letterSpacing, title, artist, transposition, originalKey, isPlaylist, columnCount, isInternet }) {
    const [measuredHeights, setMeasuredHeights] = useState({});
    const [ready, setReady] = useState(false);

    // Group lines into pages and columns
    const pages = React.useMemo(() => {
        if (!ready) return [];

        const _pages = [];
        // Structure: { col0: [], col1: [] }
        let currentPage = { col0: [], col1: [] };

        let currentColumn = 0; // 0 or 1
        let currentHeight = 0;

        // Max allow height in pixels
        const MAX_HEIGHT = (CONTENT_HEIGHT_MM * MM_TO_PX) - SAFETY_BUFFER_PX;

        // Header height calculation
        const headerH = measuredHeights['HEADER'] || 0;

        // Start Page 0, Column 0 with header height
        // NOTE: If using 2 columns, Header typically spans full width at the top,
        // so effectively both columns start 'below' the header.
        // However, physically in the DOM, Col 0 and Col 1 are usually below the Header div.
        // So Header takes Y space, remaining available height for columns is (MAX - Header).

        // Let's refine limits per page logic:
        // Page 0 Available Height = MAX_HEIGHT - headerH.
        // Page 1+ Available Height = MAX_HEIGHT.

        const getAvailableHeight = (isPageZero) => {
            return isPageZero ? (MAX_HEIGHT - headerH) : MAX_HEIGHT;
        };

        lines.forEach((lineObj, index) => {
            const h = measuredHeights[index] || 0;
            const availableHeight = getAvailableHeight(_pages.length === 0);

            // If adding this line exceeds available height...
            if (currentHeight + h > availableHeight) {
                // Determine next step based on columns
                if (columnCount === 2 && currentColumn === 0) {
                    // Switch to Column 1 on SAME page
                    currentColumn = 1;
                    currentHeight = 0; // Column 1 starts fresh (header is above both)
                } else {
                    // Page Full (either single col full, or 2nd col full)
                    // Push current page
                    _pages.push(currentPage);

                    // Start New Page
                    currentPage = { col0: [], col1: [] };
                    currentColumn = 0;
                    currentHeight = 0;
                }
            }

            // Add line to current column
            if (currentColumn === 0) {
                currentPage.col0.push({ line: lineObj, index });
            } else {
                currentPage.col1.push({ line: lineObj, index });
            }

            currentHeight += h;
        });

        if (currentPage.col0.length > 0 || currentPage.col1.length > 0) {
            _pages.push(currentPage);
        }

        return _pages;

    }, [lines, measuredHeights, ready, columnCount]); // Re-calc when columnCount changes

    // Responsive Scaling Logic
    const [scale, setScale] = useState(1);

    React.useEffect(() => {
        const handleResize = () => {
            const pagePixelWidth = 210 * MM_TO_PX; // ~794px
            const padding = 32; // Safety margin
            const availableWidth = window.innerWidth - padding;

            // Only scale down, never up
            const newScale = Math.min(1, availableWidth / pagePixelWidth);
            setScale(newScale);
        };

        handleResize(); // Initial
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const pageHeightPx = 297 * MM_TO_PX;
    const scaledHeight = pageHeightPx * scale;
    const heightDifference = pageHeightPx - scaledHeight;

    return (
        <>
            {/* Measuring Layer - Width based on Column Count */}
            {/* If 2 Cols, Measure with ~half width to simulate wrapping correctly */}
            <Measurer
                lines={lines}
                fontSize={fontSize}
                tabFontSize={tabFontSize}
                lineSpacing={lineSpacing}
                letterSpacing={letterSpacing}
                title={title}
                artist={artist}
                transposition={transposition}
                originalKey={originalKey}
                isPlaylist={isPlaylist}
                columnCount={columnCount}
                on={(heights) => {
                    setMeasuredHeights(heights);
                    setReady(true);
                }}
            />

            {/* Hardcoded Print Overrides to ensure JS Scaling doesn't affect Print */}
            <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 0;
                    }
                    body {
                        margin: 0;
                    }
                    .active-page {
                        transform: none !important;
                        margin: 0 !important;
                        margin-bottom: 0 !important;
                        box-shadow: none !important;
                        width: 210mm !important;
                        height: 297mm !important;
                        page-break-after: always !important;
                        break-after: page !important;
                    }
                }
            `}</style>

            {/* Visible Pages */}
            <div className="flex flex-col gap-8 print:block print:gap-0 items-center w-full">
                {pages.map((page, pageIndex) => (
                    <div
                        key={pageIndex}
                        className="active-page bg-white w-[210mm] h-[297mm] shadow-2xl px-[10mm] pt-[10mm] pb-[10mm] relative font-sans overflow-hidden print:shadow-none print:w-full print:h-full print:break-after-page print:m-0 print:!transform-none print:!mb-0 flex flex-col origin-top transition-transform duration-200"
                        style={{
                            fontSize: `${fontSize}pt`,
                            transform: `scale(${scale})`,
                            marginBottom: scale < 1 ? `-${heightDifference}px` : '0px'
                        }}
                    >
                        {/* Internet Warning Banner (Display Only, typically not included in official LouvorPlay prints if possible, but user asked to be "on top of page") */}
                        {isInternet && pageIndex === 0 && (
                            <div className="w-full py-2 px-4 bg-red-50 border-b border-red-100 flex items-center justify-center gap-2 mb-4">
                                <Info size={14} className="text-red-500 flex-shrink-0" />
                                <span className="text-[10px] font-bold text-red-600 leading-tight">
                                    Cifras direto da internet podem conter erros pois não passaram pela revisão criteriosa do LouvorPlay.
                                </span>
                            </div>
                        )}

                        {/* Header on Page 0 */}
                        {pageIndex === 0 && (
                            <div className="w-full flex-none">
                                <div className="flex justify-between items-start mb-6 border-b-2 border-slate-900 pb-2">
                                    {/* Left Side: Title & Artist */}
                                    <div>
                                        <h1 className="text-3xl font-bold uppercase tracking-tight leading-none text-slate-900">{title}</h1>
                                        <p className="text-lg text-slate-600 font-semibold mt-1">{artist}</p>
                                    </div>

                                    {/* Right Side: Logo & Keys */}
                                    <div className="flex flex-col items-end gap-2">
                                        <img src="/logo_official.png" alt="LouvorPlay" className="h-8 object-contain select-none" />
                                        <div className="flex flex-row items-center gap-3">
                                            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider bg-slate-50 border border-slate-100 px-2 py-1 rounded">
                                                Original: <strong className="text-slate-600">{originalKey}</strong>
                                            </div>
                                            <div className="text-sm font-mono text-slate-700 border border-slate-300 px-2 py-0.5 rounded bg-slate-50 shadow-sm">
                                                {isPlaylist ? "Meu: " : "Tom: "} <strong className="text-black">{transposition}</strong>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Columns Container */}
                        <div className={`flex-1 grid ${columnCount === 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-0 content-start items-start w-full`}>
                            {/* Column 0 */}
                            <div className={`w-full ${columnCount === 2 ? 'pr-6 border-r border-slate-200' : ''}`}>
                                {page.col0.map((item, i) => (
                                    <div key={`${pageIndex}-0-${i}`} className="w-full">
                                        <LineRenderer
                                            line={item.line.text}
                                            isBold={item.line.isBold}
                                            isTab={item.line.isTab}
                                            block={item.line.block} // Pass block data
                                            fontSize={fontSize}
                                            tabFontSize={tabFontSize}
                                            lineSpacing={lineSpacing}
                                            letterSpacing={letterSpacing}
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Column 1 (Only if count > 1) */}
                            {columnCount === 2 && (
                                <div className="w-full pl-6">
                                    {page.col1.map((item, i) => (
                                        <div key={`${pageIndex}-1-${i}`} className="w-full">
                                            <LineRenderer
                                                line={item.line.text}
                                                isBold={item.line.isBold}
                                                isTab={item.line.isTab}
                                                block={item.line.block} // Pass block data
                                                fontSize={fontSize}
                                                tabFontSize={tabFontSize}
                                                lineSpacing={lineSpacing}
                                                letterSpacing={letterSpacing}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="absolute bottom-4 left-0 w-full text-center text-[8px] text-slate-400 print:text-slate-600 uppercase tracking-widest font-mono opacity-60">
                            LOUVORPLAY.COM.BR POR IDE!PORTODATERRA
                        </div>

                        <div className="absolute bottom-4 right-8 text-xs text-slate-400 print:text-slate-600 z-10">
                            {pageIndex + 1} / {pages.length}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

// Helper Comp to measure everything once
function Measurer({ lines, fontSize, tabFontSize, lineSpacing, letterSpacing, title, artist, transposition, originalKey, isPlaylist, columnCount, on }) {
    const refs = useRef({});

    useLayoutEffect(() => {
        const heights = {};

        // Measure Lines
        lines.forEach((_, i) => {
            if (refs.current[i]) {
                const rect = refs.current[i].getBoundingClientRect();
                // Since we use paddingTop in LineRenderer, rect.height INCLUDES the spacing.
                heights[i] = rect.height;
            }
        });

        // Measure Header
        if (refs.current['HEADER']) {
            const hRect = refs.current['HEADER'].getBoundingClientRect();

            const style = window.getComputedStyle(refs.current['HEADER']);
            const marginBottom = parseFloat(style.marginBottom) || 0;
            const marginTop = parseFloat(style.marginTop) || 0;
            // Also need to account for paddingBottom of the header (pb-2 = 0.5rem) if not included in bbox height?
            // BBox height includes padding. It does not include margin.

            heights['HEADER'] = hRect.height + marginBottom + marginTop;
        }

        on(heights);
    }, [lines, fontSize, tabFontSize, lineSpacing, letterSpacing, title, columnCount]);

    // Determine width for measurement: Full page width OR Half page width (minus gap)
    // A4 width = 210mm. Padding = 10mm * 2 = 20mm. Max Content Width = 190mm.
    // If 2 columns: Gap ~12mm (2*6mm padding). (190 - 12) / 2 = 89mm.
    // Let's use 88mm to be safe and ensure wrapping happens in measurer BEFORE it happens in view.
    const measureWidth = columnCount === 2 ? 'w-[88mm]' : 'w-[190mm]';

    return (
        <div className="fixed top-0 left-0 -z-50 opacity-0 pointer-events-none font-sans" style={{ fontSize: `${fontSize}pt` }}>
            {/* Header Measure - Always full width of container, but we need to limit container to A4 printable area width for accuracy */}
            <div className="w-[190mm]">
                <div ref={el => refs.current['HEADER'] = el} className="flex justify-between items-start mb-6 border-b-2 border-slate-900 pb-2">
                    {/* Left Side: Title & Artist */}
                    <div>
                        <h1 className="text-3xl font-bold uppercase tracking-tight leading-none text-slate-900">{title}</h1>
                        <p className="text-lg text-slate-600 font-semibold mt-1">{artist}</p>
                    </div>

                    {/* Right Side: Logo & Keys */}
                    <div className="flex flex-col items-end gap-2">
                        <img src="/logo.png" alt="Cifras TetraCom" className="h-8 object-contain select-none" />
                        <div className="flex flex-col items-end gap-1">
                            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                                Original: <strong className="text-slate-600">{originalKey}</strong>
                            </div>
                            <div className="text-sm font-mono text-slate-700 border border-slate-300 px-2 py-0.5 rounded bg-slate-50 shadow-sm">
                                {isPlaylist ? "Meu: " : "Tom: "} <strong className="text-black">{transposition}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Lines Measure - Constrained width based on column count */}
            <div className={measureWidth}>
                {lines.map((line, i) => (
                    <div
                        key={i}
                        ref={el => refs.current[i] = el}
                        className="w-full"
                    >
                        <LineRenderer line={line.text} isBold={line.isBold} isTab={line.isTab} block={line.block} fontSize={fontSize} tabFontSize={tabFontSize} lineSpacing={lineSpacing} letterSpacing={letterSpacing} />
                    </div>
                ))}
            </div>
        </div>
    )
}

function LineRenderer({ line, isBold, isTab, block, fontSize, tabFontSize, lineSpacing, letterSpacing }) {
    if (!line && line !== '') return null;

    let content = null;

    // 1. Detect if the line is ONLY a section/comment header like {c: Refrão}
    const sectionMatch = line.trim().match(/^\{(?:c|comment):\s*(.*?)\}$/i);
    if (sectionMatch) {
        const title = sectionMatch[1];
        content = (
            <div 
                className="mt-2 mb-1 -ml-1 pl-2 border-l-2 border-blue-500 select-none group"
                style={{ lineHeight: 1.1 }}
            >
                <div className="flex items-center gap-2">
                    <span 
                        className="font-black tracking-tighter uppercase text-slate-500"
                        style={{ fontSize: `${fontSize * 0.55}pt` }}
                    >
                        {title}
                    </span>
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-slate-200 to-transparent opacity-50"></div>
                </div>
            </div>
        );
    }
    // 2. Handle Tab Rendering
    else if (isTab) {
        const parts = line.split(/(\[.*?\])/);
        const effectiveTabSize = tabFontSize || Math.max(fontSize * 0.7, 6);

        content = (
            <div
                className="font-mono whitespace-pre text-slate-700 font-bold leading-none"
                style={{
                    fontSize: `${effectiveTabSize}pt`,
                    lineHeight: lineSpacing * 0.5,
                    marginBottom: 0,
                    minHeight: `${effectiveTabSize * 0.8}pt`
                }}
            >
                {line.length === 0 ? ' ' : parts.map((part, i) => {
                    if (part.startsWith('[') && part.endsWith(']')) {
                        return (
                            <span key={i} className="text-[var(--chord-color-light)] font-bold" style={{ fontSize: `${effectiveTabSize}pt` }}>
                                {part.slice(1, -1)}
                            </span>
                        );
                    }
                    return <span key={i}>{part}</span>;
                })}
            </div>
        );
    }
    // 3. Handle Empty Lines
    else if (!line.trim()) {
        content = <div style={{ height: `${fontSize * lineSpacing}pt` }}>&nbsp;</div>;
    }
    // 4. Normal Chord + Text Line (Grid Segment Model)
    else {
        const parts = line.split(/(\[.*?\])/);
        const plainText = parts.filter((part, i) => !part.startsWith('[')).join('');
        const isChordOnlyLine = !plainText.trim();
        const hasChords = parts.some(p => p.startsWith('[') && p.endsWith(']'));

        const segments = [];
        let currentChord = null;
        parts.forEach(part => {
            if (part.startsWith('[') && part.endsWith(']')) {
                if (currentChord) segments.push({ chord: currentChord, text: '' });
                currentChord = part.slice(1, -1);
            } else {
                segments.push({ chord: currentChord, text: part || '' });
                currentChord = null;
            }
        });
        if (currentChord) segments.push({ chord: currentChord, text: '' });

        const chordHeight = '1.4em';
        const lyricHeight = '1.2em';

        // Stateful bold tracking
        let isBoldCurrent = isBold;

        content = (
            <div
                className="flex flex-wrap items-end relative w-full"
                style={{
                    minHeight: hasChords && !isChordOnlyLine ? `calc(${chordHeight} + ${lyricHeight})` : 'auto',
                    lineHeight: 1,
                    letterSpacing: `${letterSpacing}px`,
                    marginBottom: isChordOnlyLine ? `${((lineSpacing || 1) * 0.2).toFixed(2)}em` : `${((lineSpacing || 1) * 0.4).toFixed(2)}em`
                }}
            >
                {segments.map((seg, i) => {
                    const { chord, text } = seg;

                    if (isChordOnlyLine) {
                        return chord ? (
                            <span
                                key={i}
                                className="text-[var(--chord-color-light)] font-bold whitespace-pre relative leading-none px-1 py-0.5 bg-slate-50 rounded-sm mx-0.5 border border-slate-100 shadow-sm"
                                style={{ fontSize: `${fontSize * 0.85}pt` }}
                            >
                                {chord}
                            </span>
                        ) : (
                            <span key={i} className="whitespace-pre leading-none">{text}</span>
                        );
                    }

                    return (
                        <div 
                            key={i} 
                            className="inline-grid grid-rows-[auto_auto] items-end min-w-max"
                            style={{ gridTemplateRows: `${chordHeight} ${lyricHeight}` }}
                        >
                            <div className="row-start-1 leading-none self-end pb-1 pr-1">
                                {chord && (
                                    <span
                                        className="text-[var(--chord-color-light)] font-bold whitespace-nowrap inline-block origin-left"
                                        style={{ fontSize: `${fontSize * 0.95}pt` }}
                                    >
                                        {chord}
                                    </span>
                                )}
                            </div>
                            <div className="row-start-2 leading-none self-end whitespace-pre min-h-[1em]">
                                {text ? (
                                    text.split('*').map((frag, j, arr) => {
                                        const isFragmentBold = isBoldCurrent;
                                        if (j < arr.length - 1) isBoldCurrent = !isBoldCurrent;
                                        const subFragments = frag.split(/(\{(?:c|comment):.*?\})/gi);
                                        return subFragments.map((subFrag, k) => {
                                            const tagMatch = subFrag.match(/^\{(?:c|comment):\s*(.*?)\}$/i);
                                            if (tagMatch) {
                                                return (
                                                    <span key={`${j}-${k}`} className="inline-block bg-blue-100 text-blue-800 text-[0.6em] italic px-1.5 py-0.5 rounded mx-1 align-middle font-normal" style={{ lineHeight: '1.2' }}>{tagMatch[1]}</span>
                                                );
                                            }
                                            if (!subFrag) return null;
                                            return isFragmentBold ? <strong key={`${j}-${k}`} className="font-bold">{subFrag}</strong> : <span key={`${j}-${k}`}>{subFrag}</span>;
                                        });
                                    })
                                ) : (
                                    <span className="opacity-0 select-none">&nbsp;</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    if (block) {
        return (
            <div className={`relative border-l-2 border-blue-500 pl-3 ml-1 rounded-bl-sm ${block.isStart ? 'mt-4 pt-2' : ''} ${block.isEnd ? 'mb-4' : ''}`}>
                {block.isStart && (
                    <div
                        className="absolute -top-3.5 -left-[2px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded text-[0.6em] italic border border-blue-200 shadow-sm"
                        style={{ lineHeight: 1.2 }}
                    >
                        {block.label}
                    </div>
                )}
                {content}
            </div>
        );
    }

    return content;
}
