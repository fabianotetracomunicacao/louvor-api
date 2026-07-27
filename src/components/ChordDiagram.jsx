import React from 'react';

export function ChordDiagram({ chordData }) {
    if (!chordData) return <div style={{ padding: 10, color: 'red' }}>Acorde não encontrado</div>;

    const { frets, barres } = chordData;
    // frets: [E, A, D, G, B, e]
    // -1 = mute (x), 0 = open (o), 1+ = fret number

    const width = 120;
    const height = 140;
    const gridX = 20;
    const gridY = 30;
    const stringGap = 16;
    const fretGap = 20;

    // Determine base fret
    let baseFret = 1;
    const distinctFrets = frets.filter(f => f > 0);
    const hasOpenString = frets.some(f => f === 0);

    // Only shift base fret if NO open strings and lowest fret is > 2
    if (!hasOpenString && distinctFrets.length > 0) {
        const minFret = Math.min(...distinctFrets);
        if (minFret > 2) {
            baseFret = minFret;
        }
    }

    // Grid Labels (Strings)
    const strings = [0, 1, 2, 3, 4, 5]; // E A D G B e

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            {/* Defs for gradients/shadows */}
            <defs>
                <filter id="dot-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.3" />
                </filter>
            </defs>

            {/* Base Fret Label if > 1 */}
            {baseFret > 1 && (
                <text x={0} y={gridY + 12} fontSize="14" fontWeight="bold" className="fill-slate-500 dark:fill-slate-400" style={{ fontVariantNumeric: 'tabular-nums' }}>{baseFret}ª</text>
            )}

            {/* Frets (Horizontal Lines) */}
            {[0, 1, 2, 3, 4].map(i => (
                <line
                    key={`fret-${i}`}
                    x1={gridX}
                    y1={gridY + (i * fretGap)}
                    x2={gridX + (5 * stringGap)}
                    y2={gridY + (i * fretGap)}
                    strokeWidth={i === 0 && baseFret === 1 ? 4 : 1.5} // Thicker nut
                    strokeLinecap="round"
                    className={i === 0 && baseFret === 1 ? "stroke-slate-800 dark:stroke-slate-200" : "stroke-slate-300 dark:stroke-slate-600"}
                />
            ))}

            {/* Strings (Vertical Lines) */}
            {strings.map(i => (
                <line
                    key={`str-${i}`}
                    x1={gridX + (i * stringGap)}
                    y1={gridY}
                    x2={gridX + (i * stringGap)}
                    y2={gridY + (4 * fretGap)}
                    strokeWidth="1.5"
                    className="stroke-slate-300 dark:stroke-slate-600"
                />
            ))}

            {/* Barres */}
            {barres && barres.map((barre, i) => {
                const relativeFret = (barre.fret || 1) - (baseFret || 1) + 1;
                if (relativeFret < 1 || isNaN(relativeFret)) return null;

                const barreFrom = typeof barre.from === 'number' ? barre.from : 0;
                const barreTo = typeof barre.to === 'number' ? barre.to : 0;
                const rectX = gridX + (barreFrom * stringGap) - 6;
                const rectY = gridY + (relativeFret * fretGap) - 14;
                const rectWidth = (barreTo - barreFrom) * stringGap + 12;

                if (isNaN(rectX) || isNaN(rectY) || isNaN(rectWidth) || rectWidth <= 0) return null;

                return (
                    <rect
                        key={`barre-${i}`}
                        x={rectX}
                        y={rectY}
                        width={rectWidth}
                        height={10}
                        rx={5}
                        className="fill-slate-800 dark:fill-slate-100"
                        filter="url(#dot-shadow)"
                    />
                );
            })}

            {/* Finger Positions / Markers */}
            {frets.map((fret, stringIndex) => {
                const xPos = gridX + (stringIndex * stringGap);

                if (fret === -1) {
                    // Mute (X)
                    return (
                        <text
                            key={`mute-${stringIndex}`}
                            x={xPos}
                            y={gridY - 8}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="bold"
                            className="fill-slate-400 dark:fill-slate-500"
                        >
                            ✕
                        </text>
                    );
                }
                if (fret === 0) {
                    // Open (o)
                    return (
                        <circle
                            key={`open-${stringIndex}`}
                            cx={xPos}
                            cy={gridY - 12}
                            r={3.5}
                            strokeWidth="1.5"
                            fill="none"
                            className="stroke-slate-400 dark:stroke-slate-500"
                        />
                    );
                }

                // Pressed Fret
                const relativeFret = fret - baseFret + 1;
                return (
                    <circle
                        key={`note-${stringIndex}`}
                        cx={xPos}
                        cy={gridY + (relativeFret * fretGap) - 10}
                        r={7}
                        className="fill-slate-800 dark:fill-slate-100"
                        filter="url(#dot-shadow)"
                    />
                );
            })}
        </svg>
    );
}
