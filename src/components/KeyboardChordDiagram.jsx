import React from 'react';

// Generates a simple SVG Keyboard showing 2 octaves (14 white keys)
// And highlights the specific keys passed in 'activeKeys'
export function KeyboardChordDiagram({ activeKeys, width = 240, height = 120 }) {
    if (!activeKeys || activeKeys.length === 0) {
        return <div style={{ padding: 10, color: 'red' }}>Acorde não configurado para teclado</div>;
    }

    const numWidth = typeof width === 'number' && !isNaN(width) ? width : parseFloat(width) || 240;
    const numHeight = typeof height === 'number' && !isNaN(height) ? height : parseFloat(height) || 120;

    const numWhiteKeys = 14;
    const whiteKeyWidth = numWidth / numWhiteKeys;
    const blackKeyWidth = whiteKeyWidth * 0.6;
    const blackKeyHeight = numHeight * 0.6;

    // Ordered sequence of all notes in 2 octaves starting from C3
    // Indices: C=0, C#=1, D=2, D#=3, E=4, F=5, F#=6, G=7, G#=8, A=9, A#=10, B=11
    const keys = [
        { note: 'C', isBlack: false, activeIndex: 0 },
        { note: 'C#', isBlack: true, activeIndex: 1 },
        { note: 'D', isBlack: false, activeIndex: 2 },
        { note: 'D#', isBlack: true, activeIndex: 3 },
        { note: 'E', isBlack: false, activeIndex: 4 },
        { note: 'F', isBlack: false, activeIndex: 5 },
        { note: 'F#', isBlack: true, activeIndex: 6 },
        { note: 'G', isBlack: false, activeIndex: 7 },
        { note: 'G#', isBlack: true, activeIndex: 8 },
        { note: 'A', isBlack: false, activeIndex: 9 },
        { note: 'A#', isBlack: true, activeIndex: 10 },
        { note: 'B', isBlack: false, activeIndex: 11 },
        // Second octave
        { note: 'C', isBlack: false, activeIndex: 12 },
        { note: 'C#', isBlack: true, activeIndex: 13 },
        { note: 'D', isBlack: false, activeIndex: 14 },
        { note: 'D#', isBlack: true, activeIndex: 15 },
        { note: 'E', isBlack: false, activeIndex: 16 },
        { note: 'F', isBlack: false, activeIndex: 17 },
        { note: 'F#', isBlack: true, activeIndex: 18 },
        { note: 'G', isBlack: false, activeIndex: 19 },
        { note: 'G#', isBlack: true, activeIndex: 20 },
        { note: 'A', isBlack: false, activeIndex: 21 },
        { note: 'A#', isBlack: true, activeIndex: 22 },
        { note: 'B', isBlack: false, activeIndex: 23 },
    ];

    // Build drawing structure
    let whiteIndex = 0;
    const renderKeys = keys.map((key) => {
        let xPos = 0;
        let kWidth = 0;
        let kHeight = 0;

        if (key.isBlack) {
            // Black keys are positioned relative to the previous white key intersection
            xPos = (whiteIndex * whiteKeyWidth) - (blackKeyWidth / 2);
            kWidth = blackKeyWidth;
            kHeight = blackKeyHeight;
        } else {
            // White keys are laid out sequentially
            xPos = whiteIndex * whiteKeyWidth;
            whiteIndex++;
            kWidth = whiteKeyWidth;
            kHeight = numHeight;
        }

        const isActive = activeKeys.includes(key.activeIndex);

        return {
            ...key,
            x: isNaN(xPos) ? 0 : xPos,
            width: isNaN(kWidth) ? 0 : kWidth,
            height: isNaN(kHeight) ? 0 : kHeight,
            isActive
        };
    });

    const whiteKeys = renderKeys.filter(k => !k.isBlack);
    const blackKeys = renderKeys.filter(k => k.isBlack);

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="rounded-sm shadow-md overflow-hidden">
            {/* Defs for gradients/shadows */}
            <defs>
                <linearGradient id="white-key" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#fff" />
                    <stop offset="100%" stopColor="#f4f4f5" />
                </linearGradient>
                <linearGradient id="black-key" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#18181b" />
                    <stop offset="80%" stopColor="#27272a" />
                    <stop offset="100%" stopColor="#3f3f46" />
                </linearGradient>
            </defs>

            {/* Render White Keys First (Bottom Layer) */}
            {whiteKeys.map((k, i) => (
                <rect
                    key={`white-${i}`}
                    x={k.x}
                    y={0}
                    width={k.width}
                    height={k.height}
                    fill={k.isActive ? '#a855f7' : 'url(#white-key)'} // purple-500 if active
                    stroke="#d4d4d8" // zinc-300
                    strokeWidth="1"
                    className="transition-colors duration-300"
                />
            ))}

            {/* Render Black Keys Second (Top Layer) */}
            {blackKeys.map((k, i) => (
                <rect
                    key={`black-${i}`}
                    x={k.x}
                    y={0}
                    width={k.width}
                    height={k.height}
                    fill={k.isActive ? '#9333ea' : 'url(#black-key)'} // purple-600 if active
                    stroke="#18181b"
                    strokeWidth="1"
                    rx="2"
                    ry="2"
                    className="transition-colors duration-300"
                />
            ))}

            {/* Render Active Note Labels (Optional, at the bottom of the active white keys) */}
            {whiteKeys.map((k, i) => {
                if (!k.isActive) return null;
                return (
                    <text
                        key={`label-w-${i}`}
                        x={k.x + (k.width / 2)}
                        y={height - 8}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="bold"
                        fill="#ffffff"
                    >
                        {k.note}
                    </text>
                );
            })}
            {/* Labels for active black keys */}
            {blackKeys.map((k, i) => {
                if (!k.isActive) return null;
                return (
                    <text
                        key={`label-b-${i}`}
                        x={k.x + (k.width / 2)}
                        y={k.height - 8}
                        textAnchor="middle"
                        fontSize="8"
                        fontWeight="bold"
                        fill="#ffffff"
                    >
                        {k.note}
                    </text>
                );
            })}
        </svg>
    );
}
