import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchChordData, getChordData } from '../utils/chords';
import { ChordDiagram } from './ChordDiagram';
import { KeyboardChordDiagram } from './KeyboardChordDiagram';
import { getKeyboardChord } from '../utils/keyboardChords';
import { Portal } from './Portal';
import { useData } from '../contexts/DataContext';

// Simple Parser/Renderer
// Simple Parser/Renderer
// Simple Parser/Renderer
export function ChordProRenderer({ content, fontSize = 12, tabFontSize = null, lineSpacing = 1, letterSpacing = 0, displayMode = 'full' }) {
    const { defaultInstrument } = useData();
    const [activeChord, setActiveChord] = useState(null);
    const [variationIndex, setVariationIndex] = useState(0);
    const [viewInstrument, setViewInstrument] = useState('guitar'); // 'guitar' or 'keyboard'

    // Reset variation and instrument when active chord changes
    useEffect(() => {
        setVariationIndex(0);
        setViewInstrument(defaultInstrument || 'guitar');
    }, [activeChord, defaultInstrument]);

    const [activeChordData, setActiveChordData] = useState(null);

    useEffect(() => {
        let isMounted = true;

        async function loadChord() {
            // Try sync first (cache/local) to avoid flicker
            const syncData = getChordData(activeChord);
            if (syncData) {
                if (isMounted) setActiveChordData(syncData);
                return;
            }

            // Fallback to async
            const data = await fetchChordData(activeChord);
            if (isMounted) setActiveChordData(data);
        }

        loadChord();

        return () => { isMounted = false; };
    }, [activeChord]);

    const currentPosition = activeChordData?.positions?.[variationIndex];
    const totalVariations = activeChordData?.positions?.length || 0;

    const nextVariation = () => {
        setVariationIndex(prev => (prev + 1) % totalVariations);
    };

    const prevVariation = () => {
        setVariationIndex(prev => (prev - 1 + totalVariations) % totalVariations);
    };

    if (!content) return null;

    // Split by newline to preserve all lines, including empty ones
    const lines = content.split('\n');

    // PRE-PROCESSING: Group lines into Blocks
    // Types: 'line' | 'tab' | 'tagged_block'
    const blocks = [];
    let currentBlock = null;
    let isTabBlock = false;

    lines.forEach((line, originalIndex) => {
        const trimmed = line.trim();

        // 1. Tab Detection (Start)
        if (trimmed === '{sot}' || trimmed === '{start_of_tab}') {
            isTabBlock = true;
            return;
        }
        // 2. Tab Detection (End)
        if (trimmed === '{eot}' || trimmed === '{end_of_tab}') {
            isTabBlock = false;
            return;
        }

        // 3. Tag Block Detection (Start) -> {tag: Label}
        const tagStartMatch = trimmed.match(/^\{tag:\s*(.*?)\}$/i);
        if (tagStartMatch) {
            // Close previous block if any (though tags shouldn't nest in this simple parser)
            if (currentBlock) {
                blocks.push(currentBlock);
            }
            // Start new Tagged Block
            currentBlock = {
                type: 'tagged_block',
                label: tagStartMatch[1],
                lines: []
            };
            return;
        }

        // 4. Tag Block Detection (End) -> {endtag}
        if (trimmed === '{endtag}') {
            if (currentBlock && currentBlock.type === 'tagged_block') {
                blocks.push(currentBlock);
                currentBlock = null;
            }
            return;
        }

        // 5. Implicit Tab Check
        const isImplicitTab = /^[A-Ga-g]\|/.test(trimmed) && (trimmed.match(/-/g) || []).length > 2;

        // 6. Content Handling
        if (isTabBlock || isImplicitTab) {
            // If we are inside a Tagged Block, text/tabs go INSIDE it
            if (currentBlock && currentBlock.type === 'tagged_block') {
                currentBlock.lines.push({ type: 'tab', content: line });
            } else {
                // Standalone Tab Line (wrapped in simple block or just a line type)
                // To keep order, we push as a 'tab' item to the top level blocks list
                blocks.push({ type: 'tab', content: line });
            }
        } else {
            // Standard Line
            if (currentBlock && currentBlock.type === 'tagged_block') {
                currentBlock.lines.push({ type: 'line', content: line, originalIndex });
            } else {
                blocks.push({ type: 'line', content: line, originalIndex });
            }
        }
    });

    // Push trailing open block if exists (auto-close)
    if (currentBlock) {
        blocks.push(currentBlock);
    }

    // POST-PROCESSING: When tabs are hidden, suppress blank lines that are adjacent
    // to tab blocks (i.e. blank lines that appear between tablature sections or
    // immediately before/after them with no real content in between).
    let filteredBlocks = blocks;
    if (displayMode === 'no_tabs' || displayMode === 'only_tabs') {
        // Build a set of indices that are tab-type blocks (will be hidden)
        const isHiddenIndex = blocks.map(b => b.type === 'tab');

        filteredBlocks = blocks.filter((block, i) => {
            // Keep non-blank lines always
            if (block.type !== 'line' || block.content?.trim() !== '') return true;

            // This is a blank line. Suppress it if both the nearest non-blank
            // blocks on each side are tab blocks (i.e. there's no real content
            // between two tab sections).
            const prevNonBlank = (() => {
                for (let j = i - 1; j >= 0; j--) {
                    if (blocks[j].type !== 'line' || blocks[j].content?.trim() !== '') return blocks[j];
                }
                return null;
            })();
            const nextNonBlank = (() => {
                for (let j = i + 1; j < blocks.length; j++) {
                    if (blocks[j].type !== 'line' || blocks[j].content?.trim() !== '') return blocks[j];
                }
                return null;
            })();

            const prevIsTab = !prevNonBlank || prevNonBlank.type === 'tab';
            const nextIsTab = !nextNonBlank || nextNonBlank.type === 'tab';

            // Suppress if sandwiched between tab blocks (or at edge of tab group)
            return !(prevIsTab && nextIsTab);
        });
    }

    // RENDERER
    return (
        <div className="font-sans text-slate-900 dark:text-slate-100" style={{ fontSize: `${fontSize}pt` }}>
            {filteredBlocks.map((block, index) => {
                // RENDER: Tagged Block
                if (block.type === 'tagged_block') {
                    return (
                        <div key={index} className="relative mt-4 mb-4 ml-1 pl-3 border-l-2 border-blue-500 dark:border-blue-400 rounded-bl-sm">
                            {/* Floating Label */}
                            <div
                                className="absolute -top-3.5 -left-[2px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-100 font-semibold px-2 py-0.5 rounded text-[0.6em] italic border border-blue-200 dark:border-blue-800 shadow-sm"
                                style={{ lineHeight: 1.2 }}
                            >
                                {block.label}
                            </div>

                            {/* Inner Lines */}
                            <div className="pt-2">
                                {block.lines.map((innerLine, i) => {
                                    if (innerLine.type === 'tab') {
                                        return renderTabLine(innerLine.content, fontSize, tabFontSize, lineSpacing, displayMode, i);
                                    }
                                    return (
                                        <LineRenderer
                                            key={i}
                                            line={innerLine.content}
                                            originalIndex={innerLine.originalIndex}
                                            fontSize={fontSize}
                                            lineSpacing={lineSpacing}
                                            letterSpacing={letterSpacing}
                                            onChordClick={setActiveChord}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                }

                // RENDER: Standalone Tab
                if (block.type === 'tab') {
                    return renderTabLine(block.content, fontSize, tabFontSize, lineSpacing, displayMode, index);
                }

                // RENDER: Standard Line
                if (block.type === 'line') {
                    if (displayMode === 'only_tabs') return null;
                    return (
                        <LineRenderer
                            key={index}
                            line={block.content}
                            originalIndex={block.originalIndex}
                            fontSize={fontSize}
                            lineSpacing={lineSpacing}
                            letterSpacing={letterSpacing}
                            onChordClick={setActiveChord}
                        />
                    );
                }

                return null;
            })}


            {/* Chord Diagram Overlay */}
            {activeChord && (
                <Portal>
                    <div
                        className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
                        onClick={() => setActiveChord(null)}
                    >
                        {/* Backdrop with Blur */}
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />

                        {/* Modal Content Wrapper with Gradient Border */}
                        <div className="relative p-[2px] rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-2xl animate-in fade-in zoom-in duration-200">
                            <div
                                className="bg-white dark:bg-slate-900 px-8 py-6 rounded-2xl flex flex-col items-center gap-5 min-w-[260px] relative"
                                onClick={e => e.stopPropagation()}
                            >
                                {/* Close Button - Strictly positioned */}
                                <button
                                    className="absolute top-3 right-3 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    onClick={() => setActiveChord(null)}
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>

                                {/* Title & Navigation */}
                                <div className="mt-2 text-center w-full">
                                    <div className="flex items-center justify-between px-4">
                                        <button
                                            onClick={prevVariation}
                                            disabled={totalVariations <= 1 || viewInstrument === 'keyboard'}
                                            className={`p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition ${totalVariations <= 1 || viewInstrument === 'keyboard' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                                        >
                                            <ChevronLeft size={24} className="text-slate-400 dark:text-slate-500" />
                                        </button>

                                        <div className="flex flex-col items-center">
                                            <h3
                                                className="text-4xl font-extrabold tracking-tight"
                                                style={{ color: 'var(--chord-color-light)' }}
                                            >
                                                {activeChord}
                                            </h3>
                                            {totalVariations > 1 && viewInstrument === 'guitar' && (
                                                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
                                                    Variação {variationIndex + 1} de {totalVariations}
                                                </span>
                                            )}
                                            {viewInstrument === 'keyboard' && (
                                                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
                                                    Teclado (Padrão)
                                                </span>
                                            )}
                                        </div>

                                        <button
                                            onClick={nextVariation}
                                            disabled={totalVariations <= 1 || viewInstrument === 'keyboard'}
                                            className={`p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition ${totalVariations <= 1 || viewInstrument === 'keyboard' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                                        >
                                            <ChevronRight size={24} className="text-slate-400 dark:text-slate-500" />
                                        </button>
                                    </div>
                                </div>

                                {/* Instrument Toggle */}
                                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mt-2">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setViewInstrument('guitar'); }}
                                        className={`px-3 py-1 rounded-md text-xs font-bold uppercase transition ${viewInstrument === 'guitar' ? 'bg-white dark:bg-slate-700 shadow text-purple-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        Violão
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setViewInstrument('keyboard'); }}
                                        className={`px-3 py-1 rounded-md text-xs font-bold uppercase transition ${viewInstrument === 'keyboard' ? 'bg-white dark:bg-slate-700 shadow text-purple-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    >
                                        Teclado
                                    </button>
                                </div>

                                {/* Diagram */}
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                    {viewInstrument === 'keyboard' ? (
                                        <KeyboardChordDiagram activeKeys={getKeyboardChord(activeChord)} />
                                    ) : (
                                        <ChordDiagram chordData={currentPosition} />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
    );
}

// Helper for rendering tab lines
function renderTabLine(line, fontSize, tabFontSize, lineSpacing, displayMode, key) {
    if (displayMode === 'no_tabs') return null;

    const parts = line.split(/(\[.*?\])/);
    // Use explicit tabFontSize or fallback to 70% of base font size
    const effectiveTabSize = tabFontSize || Math.max(fontSize * 0.7, 6);

    return (
        <div
            key={key}
            className="font-mono whitespace-pre text-slate-700 dark:text-slate-100 font-bold leading-none"
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
                        <span key={i} className="text-[var(--chord-color-light)] dark:text-[var(--chord-color-dark)] font-bold" style={{ fontSize: `${effectiveTabSize}pt` }}>
                            {part.slice(1, -1)}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </div>
    );
}

function LineRenderer({ line, originalIndex, fontSize, lineSpacing, letterSpacing, onChordClick }) {
    // Handle explicit empty lines with a spacer
    if (!line.trim()) {
        return <div style={{ height: `${fontSize * lineSpacing}pt` }}>&nbsp;</div>;
    }

    // 1. Detect if the line is ONLY a section/comment header like {c: Refrão} or {comment: Solo}
    const sectionMatch = line.trim().match(/^\{(?:c|comment):\s*(.*?)\}$/i);
    if (sectionMatch) {
        const title = sectionMatch[1];
        return (
            <div 
                className="mt-2 mb-1 -ml-1 pl-2 border-l-2 border-blue-500 dark:border-blue-400 select-none group"
                style={{ lineHeight: 1.1 }}
            >
                <div className="flex items-center gap-2">
                    <span 
                        className="font-black tracking-tighter uppercase text-slate-500 dark:text-slate-400"
                        style={{ fontSize: `${fontSize * 0.55}pt` }}
                    >
                        {title}
                    </span>
                    <div className="h-[2px] flex-1 bg-gradient-to-r from-slate-200 dark:from-slate-800 to-transparent opacity-50 group-hover:opacity-100 transition-opacity"></div>
                </div>
            </div>
        );
    }

    const cleanLine = line;

    // Split chords first
    const parts = cleanLine.split(/(\[.*?\])/);

    // Check if the line is "Chord Only" (no meaningful text content)
    const plainText = parts.filter((part, i) => !part.startsWith('[')).join('');
    const isChordOnlyLine = !plainText.trim();

    // 2. Group into musical segments (Chord + following Text)
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

    // Base spacing values (internal layout)
    const chordHeight = '1.4em';
    const lyricHeight = '1.2em';
    const hasChords = segments.some(s => s.chord);
    let isBoldCurrent = false;

    return (
        <div
            className="flex flex-wrap items-end relative w-full"
            data-line-index={originalIndex}
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
                            className="text-[var(--chord-color-light)] dark:text-[var(--chord-color-dark)] font-bold whitespace-pre relative leading-none px-1 py-0.5 cursor-pointer hover:underline bg-slate-50 dark:bg-slate-900/50 rounded-sm mx-0.5 border border-slate-100 dark:border-slate-800 shadow-sm"
                            style={{ fontSize: `${fontSize * 0.85}pt` }}
                            onClick={() => onChordClick && onChordClick(chord)}
                        >
                            {chord}
                        </span>
                    ) : (
                        <span key={i} className="whitespace-pre leading-none">{text}</span>
                    );
                }

                // Normal Chord + Text segment using CSS Grid
                return (
                    <div 
                        key={i} 
                        className="inline-grid grid-rows-[auto_auto] items-end min-w-max group"
                        style={{ gridTemplateRows: `${chordHeight} ${lyricHeight}` }}
                    >
                        {/* Row 1: Chord */}
                        <div className="row-start-1 leading-none self-end pb-1 pr-1">
                            {chord && (
                                <span
                                    className="text-[var(--chord-color-light)] dark:text-[var(--chord-color-dark)] font-bold whitespace-nowrap cursor-pointer hover:underline select-none transition-transform group-hover:scale-105 inline-block origin-left"
                                    onClick={() => onChordClick && onChordClick(chord)}
                                    style={{ fontSize: `${fontSize * 0.95}pt` }}
                                >
                                    {chord}
                                </span>
                            )}
                        </div>

                        {/* Row 2: Text/Lyric */}
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
                                                <span
                                                    key={`${j}-${k}`}
                                                    className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 text-[0.6em] italic px-1.5 py-0.5 rounded mx-1 align-middle font-normal"
                                                    style={{ lineHeight: '1.2' }}
                                                >
                                                    {tagMatch[1]}
                                                </span>
                                            );
                                        }
                                        if (!subFrag) return null;
                                        return isFragmentBold
                                            ? <strong key={`${j}-${k}`} className="font-bold">{subFrag}</strong>
                                            : <span key={`${j}-${k}`}>{subFrag}</span>;
                                    });
                                })
                            ) : (
                                // Ensure the grid has a minimal width of a space if text is empty
                                <span className="opacity-0 select-none">&nbsp;</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
