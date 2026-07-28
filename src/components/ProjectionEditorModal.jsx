import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Type, ArrowDownUp, Palette, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { saveSongProjectionSettings } from '../utils/storage';
import ImageBackgroundModal from './ImageBackgroundModal';
import VideoBackgroundModal from './VideoBackgroundModal';

export default function ProjectionEditorModal({ song, onClose, onSave, playlistItemId = null, itemTable = 'playlist_items' }) {
    const [activeTab, setActiveTab] = useState('text'); // 'text' | 'appearance'
    const [content, setContent] = useState('');

    // Appearance State
    const [projBgType, setProjBgType] = useState('global');
    const [projBgUrl, setProjBgUrl] = useState('');
    const [projFontSize, setProjFontSize] = useState(100);

    // Modals
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const textAreaRef = useRef(null);

    // Helper to strip chords and tags from original content for projection
    const getCleanLyricsFromContent = (rawContent) => {
        if (!rawContent) return '';
        let clean = rawContent;

        // 0. Remove entire Tab blocks {sot} ... {eot}
        clean = clean.replace(/\{sot\}[\s\S]*?\{eot\}/gi, '');
        clean = clean.replace(/\{start_of_tab\}[\s\S]*?\{end_of_tab\}/gi, '');

        // 0.5 Remove implicit tab lines (e|--- B|---)
        clean = clean.replace(/^[A-Ga-g]\|.*?-.*$/gm, '');

        // 1. Remove lines that are just structural tags (e.g. [Verse 1]) including the newline.
        // We keep tags if they are longer or look like sections, but here we want pure lyrics as starting point.
        // Fix: Use [^\[\]]+ instead of .*? to prevent matching entire lines with inline chords like [F7M]...[G/E]
        clean = clean.replace(/^\[[^[\]]+\]\s*$\n?/gm, '');
        
        // 2. Remove remaining inline chords [G]
        clean = clean.replace(/\[.*?\]/g, '');
        
        // 3. Remove ChordPro specific tags like {tag: Name} or {endtag} or just {Verse}
        clean = clean.replace(/^\{[^{}]+\}\s*$\n?/gm, '');

        // Helper to detect plain-text chord lines
        const isChordLine = (line) => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            // A chord token starts with A-G, optionally #/b, then any chord modifiers
            const chordTokenRegex = /^[A-G][#b]?[a-zA-Z0-9/()+-]*$/;
            const tokens = trimmed.split(/\s+/).filter(t => t.length > 0);
            if (tokens.length === 0) return false;
            let chordCount = 0;
            for (const token of tokens) {
                if (chordTokenRegex.test(token)) chordCount++;
            }
            return (chordCount / tokens.length) >= 0.6;
        };

        // 4. Remove plain-text chord lines completely
        const lines = clean.split('\n');
        clean = lines.filter(line => {
            const temp = line.replace(/\[.*?\]/g, ''); // strip any brackets first to check
            return !isChordLine(temp);
        }).join('\n');

        // 5. Clean up multiple empty lines left behind
        clean = clean.replace(/\n{3,}/g, '\n\n');

        return clean.trim();
    };

    useEffect(() => {
        if (song) {
            // If it already has projection content, use it.
            let initialContent = song.projectionContent || '';
            if (!initialContent && song.content) {
                initialContent = getCleanLyricsFromContent(song.content);
            }
            setContent(initialContent);
            setProjBgType(song.projBgType || 'global');
            setProjBgUrl(song.projBgUrl || '');
            setProjFontSize(song.projFontSize || 100);
        }
    }, [song]);

    const handleRestoreOriginal = () => {
        if (!song?.content) return;
        if (window.confirm("Isso irá substituir todo o texto atual pela letra original (sem acordes). Deseja continuar?")) {
            const clean = getCleanLyricsFromContent(song.content);
            setContent(clean);
        }
    };

    const handleInsertTag = (tagText) => {
        const textarea = textAreaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentScrollTop = textarea.scrollTop;

        const textBefore = content.substring(0, start);
        const selectedText = content.substring(start, end);
        const textAfter = content.substring(end);

        // If it's a structural tag like "Verso 1", format it as [Verso 1]
        // If it's a break tag, use it as is
        const isBracketTag = !tagText.includes('\n');

        let newContent = '';
        let newCursorPos = start;

        if (isBracketTag) {
            // We want to insert the tag BEFORE the selected text (acting as a title)
            // Ensure there's a newline before the tag if needed
            const prefix = textBefore.endsWith('\n') || textBefore.length === 0 ? '' : '\n';
            const suffix = '\n';
            const tagString = `${prefix}{${tagText}}${suffix}`;

            newContent = textBefore + tagString + selectedText + textAfter;
            // Place cursor right after the newly wrapped block
            newCursorPos = start + tagString.length + selectedText.length;
        } else {
            // It's a line break tag
            newContent = textBefore + tagText + selectedText + textAfter;
            newCursorPos = start + tagText.length + selectedText.length;
        }

        setContent(newContent);

        // Re-focus and set cursor position after React update
        setTimeout(() => {
            if (textAreaRef.current) {
                textAreaRef.current.focus();
                textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                textAreaRef.current.scrollTop = currentScrollTop;
            }
        }, 10);
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            const settings = {
                projectionContent: content,
                projBgType,
                projBgUrl,
                projFontSize
            };
            const updatedSong = await saveSongProjectionSettings(song.id, settings, playlistItemId, itemTable);
            onSave(updatedSong); // Pass back updated song to parent
            onClose();
        } catch (error) {
            console.error("Failed to save projection content:", error);
            alert("Erro ao salvar a letra de projeção.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[80vw] h-[80vh] overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                    <div>
                        <h3 className="font-bold text-lg dark:text-white flex items-center gap-2">
                            <Type className="text-purple-500" size={20} />
                            Editor de Projeção
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Editando: <span className="font-bold">{song?.title}</span>. Alterações aqui não afetam a cifra dos músicos.
                        </p>
                    </div>
                    {/* Tabs */}
                    <div className="flex bg-slate-200/50 dark:bg-slate-800 p-1 rounded-xl mx-4">
                        <button
                            onClick={() => setActiveTab('text')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'text' ? 'bg-white dark:bg-slate-700 shadow-sm text-purple-600 dark:text-purple-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        >
                            <Type size={16} /> Letra
                        </button>
                        <button
                            onClick={() => setActiveTab('appearance')}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'appearance' ? 'bg-white dark:bg-slate-700 shadow-sm text-purple-600 dark:text-purple-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                        >
                            <Palette size={16} /> Aparência
                        </button>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white transition rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 ml-auto">
                        <X size={20} />
                    </button>
                </div>

                {/* Content Area Based on Tab */}
                {activeTab === 'text' ? (
                    <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-900 overflow-hidden">
                        {/* Toolbar */}
                        <div className="p-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 items-center shrink-0">
                            <span className="text-xs font-bold text-slate-400 uppercase mr-2 flex items-center gap-1">
                                Inserir Rápido:
                            </span>
                            {['Verso 1', 'Verso 2', 'Verso 3', 'Verso 4', 'Verso 5', 'Refrão', 'Pré-Refrão', 'Ponte', 'Final'].map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => handleInsertTag(tag)}
                                    className="text-xs font-medium px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300 transition"
                                >
                                    {`{${tag}}`}
                                </button>
                            ))}
                            <div className="flex-1"></div>
                            <button
                                onClick={handleRestoreOriginal}
                                className="text-xs font-medium px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition flex items-center gap-1.5"
                                title="Recupere a letra completa a partir da cifra original"
                            >
                                <ArrowDownUp size={14} />
                                Restaurar do Original
                            </button>
                            <button
                                onClick={() => {
                                    const customTag = prompt("Digite o nome da sua tag (ex: Refrão 2, Intro Secundária):");
                                    if (customTag && customTag.trim() !== '') {
                                        handleInsertTag(customTag.trim());
                                    }
                                }}
                                className="text-xs font-medium px-3 py-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-1"
                                title="Criar uma tag com título personalizado"
                            >
                                <Type size={14} />
                                {`{Tag Personalizada}`}
                            </button>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            <div className="flex-1 p-4 flex flex-col">
                                <textarea
                                    ref={textAreaRef}
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    className="flex-1 w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl p-4 text-slate-900 dark:text-slate-100 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-inner"
                                    placeholder="Cole ou digite a letra aqui..."
                                />
                            </div>
                            {/* Instructions Sidebar */}
                            <div className="w-80 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 p-6 overflow-y-auto hidden md:block shrink-0">
                                <h4 className="font-bold text-slate-800 dark:text-white mb-4">Como funciona?</h4>
                                <ul className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
                                    <li>
                                        <strong className="text-purple-600 dark:text-purple-400 block mb-1">Tags (Títulos)</strong>
                                        Escreva palavras entre chaves em uma linha separada (ex: <code className="bg-slate-100 dark:bg-slate-900 px-1 rounded text-xs">{`{Refrão}`}</code>) para criar o nome do slide.
                                    </li>
                                    <li>
                                        <strong className="text-purple-600 dark:text-purple-400 block mb-1">Quebras de Slide</strong>
                                        O projetor agrupa as linhas automaticamente. Para <strong>forçar</strong> a separação entre dois slides, deixe <strong>uma linha em branco</strong> (duplo Enter) entre eles.
                                    </li>
                                    <li>
                                        <strong className="text-purple-600 dark:text-purple-400 block mb-1">Independência</strong>
                                        O que você salvar aqui será a letra OFICIAL projetada nesta música, substituindo temporariamente a cifra com acordes.
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 p-6 bg-slate-50 dark:bg-slate-900 overflow-y-auto">
                        <div className="max-w-2xl mx-auto space-y-8">

                            {/* Background Section */}
                            <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                                        <Palette size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Fundo Exclusivo</h3>
                                        <p className="text-sm text-slate-500">Defina um fundo de projeção específico só para esta música.</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* Global Default Option */}
                                    <label className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${projBgType === 'global' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-60 hover:opacity-100'}`}>
                                        <input
                                            type="radio"
                                            name="bgType"
                                            checked={projBgType === 'global'}
                                            onChange={() => { setProjBgType('global'); setProjBgUrl(''); }}
                                            className="w-5 h-5 text-purple-600 focus:ring-purple-500"
                                        />
                                        <div className="flex-1">
                                            <div className="font-bold text-slate-900 dark:text-white">Usar Fundo Global (Padrão)</div>
                                            <div className="text-sm text-slate-500">Usa a cor ou imagem que estiver selecionada para todo o projetor lá no painel.</div>
                                        </div>
                                    </label>

                                    {/* Custom Options Grid */}
                                    <div className={`grid grid-cols-2 gap-4 transition-all duration-300 ${projBgType === 'global' ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}>
                                        <button
                                            onClick={() => setIsImageModalOpen(true)}
                                            className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-3 transition-colors ${projBgType === 'image' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-purple-300'}`}
                                        >
                                            <ImageIcon size={32} className={projBgType === 'image' ? 'text-purple-600' : 'text-slate-400'} />
                                            <span className={`font-bold ${projBgType === 'image' ? 'text-purple-700 dark:text-purple-400' : 'text-slate-600 dark:text-slate-400'}`}>Imagem Específica</span>
                                            {projBgType === 'image' && projBgUrl && (
                                                <div className="w-full h-16 rounded overflow-hidden mt-2 border border-slate-200 dark:border-slate-700">
                                                    <img src={projBgUrl} className="w-full h-full object-cover" alt="Selected" />
                                                </div>
                                            )}
                                        </button>

                                        <button
                                            onClick={() => setIsVideoModalOpen(true)}
                                            className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-3 transition-colors ${projBgType === 'video' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/10' : 'border-slate-200 dark:border-slate-700 hover:border-purple-300'}`}
                                        >
                                            <VideoIcon size={32} className={projBgType === 'video' ? 'text-purple-600' : 'text-slate-400'} />
                                            <span className={`font-bold ${projBgType === 'video' ? 'text-purple-700 dark:text-purple-400' : 'text-slate-600 dark:text-slate-400'}`}>Vídeo Específico</span>
                                            {projBgType === 'video' && projBgUrl && (
                                                <div className="w-full h-16 rounded overflow-hidden mt-2 border border-slate-200 dark:border-slate-700">
                                                    <video src={projBgUrl} className="w-full h-full object-cover" />
                                                </div>
                                            )}
                                        </button>
                                    </div>

                                    {projBgType !== 'global' && (!projBgUrl) && (
                                        <div className="text-red-500 text-sm font-medium mt-2 animate-pulse">
                                            Por favor, selecione qual imagem ou vídeo será usado acima.
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                        <Type size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tamanho da Letra</h3>
                                        <p className="text-sm text-slate-500">Aumente ou diminua a letra apenas para esta música.</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pb-4">
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Menor (50%)</div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Maior (150%)</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-2xl text-slate-400">A</span>
                                    <input
                                        type="range"
                                        min="50" max="150" step="10"
                                        value={projFontSize}
                                        onChange={e => setProjFontSize(parseInt(e.target.value))}
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        style={{ accentColor: '#9333ea' }} // purple-600
                                    />
                                    <span className="text-4xl text-slate-900 dark:text-white font-bold">A</span>
                                </div>
                                <div className="text-center mt-4">
                                    <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-bold px-3 py-1 rounded-full text-sm">
                                        {projFontSize}% {projFontSize === 100 ? '(Padrão)' : ''}
                                    </span>
                                </div>
                            </section>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-end gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium transition"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || (projBgType !== 'global' && !projBgUrl)}
                        className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? (
                            <>Salvando...</>
                        ) : (
                            <>
                                <Save size={18} />
                                Salvar Projeção
                            </>
                        )}
                    </button>
                </div>
            </div>

            {isImageModalOpen && (
                <ImageBackgroundModal
                    onSelectImage={(url) => { setProjBgType('image'); setProjBgUrl(url); setIsImageModalOpen(false); }}
                    onClose={() => setIsImageModalOpen(false)}
                />
            )}

            {isVideoModalOpen && (
                <VideoBackgroundModal
                    onSelectImage={(url) => { setProjBgType('video'); setProjBgUrl(url); setIsVideoModalOpen(false); }}
                    onClose={() => setIsVideoModalOpen(false)}
                />
            )}
        </div>
    );
}
