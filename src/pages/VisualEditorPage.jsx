import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    ArrowLeft, Save, PlusCircle, Tag, Type, History, Music, Layout, 
    Eye, Settings, AlertTriangle, CheckCircle, Loader2, Sparkles, Undo, Redo
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { getSongById, saveSong, saveUserSongPreference } from '../utils/storage';
import { useVisualSync } from '../hooks/useVisualSync';
import { VisualLine } from '../components/VisualEditor/VisualLine';

export function VisualEditorPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const songId = searchParams.get('id');
    const { isEditor, user } = useAuth();
    const { showToast } = useNotification();

    const [isLoading, setIsLoading] = useState(true);
    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [fontSize, setFontSize] = useState(16);
    const [isSaving, setIsSaving] = useState(false);
    const [showSource, setShowSource] = useState(false);
    const [focusHint, setFocusHint] = useState(null); // { lineIndex, charIndex, timestamp }


    const { songStructure, setSongStructure, updateFromChordPro, getChordPro } = useVisualSync();

    // History (Undo / Redo) for Visual Editor
    const historyRef = useRef([]);
    const redoRef = useRef([]);
    const songStructureRef = useRef(songStructure);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    useEffect(() => {
        songStructureRef.current = songStructure;
    }, [songStructure]);

    const updateUndoRedoStatus = () => {
        setCanUndo(historyRef.current.length > 0);
        setCanRedo(redoRef.current.length > 0);
    };

    const pushHistory = (struct) => {
        if (!struct) return;
        const json = JSON.stringify(struct);
        const history = historyRef.current;
        if (history.length > 0 && history[history.length - 1] === json) return;
        history.push(json);
        if (history.length > 50) history.shift();
        redoRef.current = [];
        updateUndoRedoStatus();
    };

    const handleUndo = () => {
        if (historyRef.current.length === 0) return;
        const prevJson = historyRef.current.pop();
        redoRef.current.push(JSON.stringify(songStructureRef.current));
        const prevStruct = JSON.parse(prevJson);
        songStructureRef.current = prevStruct;
        setSongStructure(prevStruct);
        updateUndoRedoStatus();
    };

    const handleRedo = () => {
        if (redoRef.current.length === 0) return;
        const nextJson = redoRef.current.pop();
        historyRef.current.push(JSON.stringify(songStructureRef.current));
        const nextStruct = JSON.parse(nextJson);
        songStructureRef.current = nextStruct;
        setSongStructure(nextStruct);
        updateUndoRedoStatus();
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modifier = isMac ? e.metaKey : e.ctrlKey;

            if (modifier && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    handleRedo();
                } else {
                    e.preventDefault();
                    handleUndo();
                }
            } else if (modifier && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Redireciona se não for editor
    useEffect(() => {
        if (user && !isEditor) {
            navigate('/');
        }
    }, [user, isEditor, navigate]);

    // Carregar música
    useEffect(() => {
        if (songId) {
            const loadSong = async () => {
                const song = await getSongById(songId);
                if (song) {
                    setTitle(song.title);
                    setArtist(song.artist || '');
                    setFontSize(song.fontSize || 16);
                    updateFromChordPro(song.content);
                }
                setIsLoading(false);
            };
            loadSong();
        } else {
            setIsLoading(false);
            updateFromChordPro(''); // Música nova
        }
    }, [songId, updateFromChordPro]);

    const handleUpdateLine = (index, updatedLine) => {
        pushHistory(songStructureRef.current);
        const newStructure = [...songStructure];
        newStructure[index] = updatedLine;
        setSongStructure(newStructure);
    };

    const handleDeleteLine = (index) => {
        pushHistory(songStructureRef.current);
        const newStructure = songStructure.filter((_, i) => i !== index);
        setSongStructure(newStructure);
    };

    const handleSplitLine = (index, headSegments, tailSegments) => {
        pushHistory(songStructureRef.current);
        const newStructure = [...songStructure];
        
        // Atualiza a linha atual com os segmentos que ficam
        newStructure[index] = { ...newStructure[index], segments: headSegments };
        
        // Insere a nova linha com os segmentos que se moveram
        const newLine = { type: 'line', segments: tailSegments };
        newStructure.splice(index + 1, 0, newLine);
        
        setSongStructure(newStructure);

        // Foca no início da próxima linha (a que foi criada)
        setFocusHint({
            lineIndex: index + 1,
            charIndex: 0,
            timestamp: Date.now()
        });
    };
    const handleMergeLines = (index) => {
        if (index <= 0) return;
        pushHistory(songStructureRef.current);
        const newStructure = [...songStructure];
        const prevLine = newStructure[index - 1];
        const currLine = newStructure[index];
        
        // Se a anterior for spacer, remove o spacer (comportamento natural de editor)
        if (prevLine.type === 'spacer') {
            newStructure.splice(index - 1, 1);
            setSongStructure(newStructure);
            return;
        }

        // Mescla se ambas forem linhas de conteúdo
        if (prevLine.type === 'line' && currLine.type === 'line') {
            newStructure[index - 1] = {
                ...prevLine,
                segments: [...(prevLine.segments || []), ...(currLine.segments || [])]
            };
            newStructure.splice(index, 1);
            setSongStructure(newStructure);

            // Foca no ponto de junção (final da linha anterior antes da mescla)
            const junctionPoint = prevLine.segments?.reduce((acc, s) => acc + (s.text?.length || 0), 0) || 0;
            setFocusHint({
                lineIndex: index - 1,
                charIndex: junctionPoint,
                timestamp: Date.now()
            });
        }
    };

    const handleAddLine = (type) => {
        let newLine;
        if (type === 'comment') {
            const name = window.prompt("Nome da Seção (ex: Refrão, Estrofe):");
            if (!name) return;
            newLine = { type: 'comment', label: name, tag: null };
        } else if (type === 'spacer') {
            newLine = { type: 'spacer' };
        } else if (type === 'instrumental') {
            newLine = { type: 'line', segments: [{ chord: '?', text: '' }] };
        } else {
            newLine = { type: 'line', segments: [{ chord: null, text: '' }] };
        }
        pushHistory(songStructureRef.current);
        setSongStructure([...songStructure, newLine]);
    };

    const handleAddSection = () => handleAddLine('comment');

    const handleLoadSample = () => {
        setTitle("A Mensagem da Cruz");
        setArtist("Aline Barros");
        const sampleContent = `[Intro:] [Em] [C] [G/B] [Am] [G] [C] [G9]\n\n{c: Primeira Parte}\nRude cr[G]uz se erigiu, dela o d[C]ia fugiu, como embl[D]ema de v[D7]ergonha e d[G]or [D]\nMas cont[G]emplo essa cruz, porque n[C]ela Jesus deu a v[D]ida por m[D7]im pecad[G]or [C] [G]\n\n{c: Refrão}\n*Sim eu [D]amo a mens[D7]agem da cr[G]uz, 'te m[C]orrer eu a v[C/E]ou proclam[G]ar*\n*Levar[G]ei eu tamb[G7]ém minha cr[C]uz, 'te por [G]uma cor[D]oa troc[G]ar* [D]`;
        updateFromChordPro(sampleContent);
        showToast('Exemplo carregado!', 'info');
    };


    const handleSave = async () => {
        if (!title.trim()) {
            showToast('Dê um título para a música', 'warning');
            return;
        }

        setIsSaving(true);
        const content = getChordPro();
        
        const songData = {
            id: songId || undefined,
            title,
            artist,
            content,
            fontSize,
            type: 'chords',
            updated_at: new Date().toISOString()
        };

        try {
            const savedSong = await saveSong(songData);
            if (savedSong?.id || songId) {
                try {
                    await saveUserSongPreference(savedSong?.id || songId, {
                        font_size: fontSize,
                        mobile_font_size: fontSize,
                        desktop_font_size: fontSize
                    });
                } catch (e) {
                    console.warn("Could not save font size pref:", e);
                }
            }
            showToast('Música salva com sucesso!', 'success');
        } catch (error) {
            console.error(error);
            showToast('Erro ao salvar.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-white dark:bg-slate-900">
                <Loader2 className="animate-spin text-purple-600" size={40} />
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
            {/* Header / Toolbar - Glassmorphism */}
            <div className="p-3 md:p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between z-20 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-none">

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    
                    <div>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Título da Música"
                            className="bg-transparent text-xl font-bold border-none outline-none placeholder:text-slate-400 w-48 md:w-64"
                        />
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                             <Sparkles size={12} className="text-purple-500" />
                             <span>Modo Visual Experimental</span>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleUndo}
                        disabled={!canUndo}
                        className="flex items-center gap-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition text-sm font-medium disabled:opacity-30 disabled:hover:bg-slate-100"
                        title="Desfazer (Ctrl+Z)"
                    >
                        <Undo size={16} />
                        <span className="hidden md:inline">Desfazer</span>
                    </button>
                    <button
                        onClick={handleRedo}
                        disabled={!canRedo}
                        className="flex items-center gap-1 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition text-sm font-medium disabled:opacity-30 disabled:hover:bg-slate-100"
                        title="Refazer (Ctrl+Y)"
                    >
                        <Redo size={16} />
                        <span className="hidden md:inline">Refazer</span>
                    </button>

                    <button
                        onClick={handleAddSection}
                        className="hidden lg:flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition text-sm font-medium"
                    >
                        <Tag size={16} /> Nova Seção
                    </button>
                    <button
                        onClick={() => setShowSource(!showSource)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition text-sm font-medium ${showSource ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
                    >
                        <Eye size={16} /> {showSource ? 'Esconder Código' : 'Ver Código'}
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition shadow-lg shadow-purple-500/20 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        <span className="hidden md:inline">Salvar</span>
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex overflow-hidden">
                <div className={`flex-1 overflow-y-auto p-4 md:p-8 space-y-2 w-full custom-scrollbar transition-all duration-300 ${showSource ? 'max-w-full' : 'max-w-5xl mx-auto'}`}>

                <div className="bg-white dark:bg-slate-900/40 min-h-full rounded-[2rem] p-6 md:p-12 shadow-2xl shadow-slate-200/50 dark:shadow-none border border-slate-200/50 dark:border-slate-800/50">

                {/* Artist Input */}
                <div className="mb-8">
                    <input
                        type="text"
                        value={artist}
                        onChange={e => setArtist(e.target.value)}
                        placeholder="Nome do Artista"
                        className="bg-transparent text-lg text-slate-500 dark:text-slate-400 border-none outline-none w-full italic"
                    />
                </div>

                {/* Main Content Render */}
                <div className="space-y-1">
                    {songStructure.length > 0 ? (
                        songStructure.map((line, idx) => (
                            <VisualLine
                                key={idx}
                                line={line}
                                index={idx}
                                fontSize={fontSize}
                                onUpdateLine={(updated) => handleUpdateLine(idx, updated)}
                                onSplit={(head, tail) => handleSplitLine(idx, head, tail)}
                                onMergeWithPrevious={() => handleMergeLines(idx)}
                                onDelete={handleDeleteLine}
                                focusHint={focusHint}
                            />
                        ))
                    ) : (
                        <div className="text-center py-20 text-slate-400">
                            <Music className="mx-auto mb-4 opacity-20" size={48} />
                            <p>Comece a digitar sua cifra...</p>
                        </div>
                    )}
                </div>

                {/* Action Bar for Adding Lines */}
                <div className="pt-10 flex flex-wrap justify-center gap-3 pb-32">
                    <button 
                        onClick={() => handleAddLine('line')}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-purple-400 hover:text-purple-600 transition-all rounded-xl text-sm font-bold shadow-sm"
                    >
                        <Type size={16} /> + Frase
                    </button>
                    <button 
                        onClick={() => handleAddLine('instrumental')}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 transition-all rounded-xl text-sm font-bold shadow-sm"
                    >
                        <Music size={16} /> + Instrumental
                    </button>
                    <button 
                        onClick={() => handleAddLine('comment')}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-orange-400 hover:text-orange-600 transition-all rounded-xl text-sm font-bold shadow-sm"
                    >
                        <Tag size={16} /> + Seção
                    </button>
                    <button 
                        onClick={() => handleAddLine('spacer')}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400 hover:text-slate-900 dark:hover:text-white transition-all rounded-xl text-sm font-bold shadow-sm"
                    >
                        <Layout size={16} /> + Espaço
                    </button>
                </div>
                </div>
                </div>

                {/* Source View Panel (Live Sync) */}
                {showSource && (
                    <div className="hidden lg:flex flex-col w-[400px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
                            <div className="flex items-center gap-2">
                                <Layout size={18} className="text-indigo-500" />
                                <span className="font-bold text-sm uppercase tracking-widest text-slate-500">Live ChordPro</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                <span className="text-[10px] text-slate-400">SYNC ON</span>
                            </div>
                        </div>
                        <div className="flex-1 p-6 bg-slate-50 dark:bg-slate-950/50 font-mono text-xs overflow-auto select-all custom-scrollbar">
                            <pre className="text-indigo-600 dark:text-indigo-400 whitespace-pre-wrap leading-relaxed">
                                {getChordPro()}
                            </pre>
                        </div>
                        <div className="p-4 bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 italic">
                            O código acima é atualizado automaticamente conforme você edita o painel visual à esquerda.
                        </div>
                    </div>
                )}
            </div>

            
            {/* Footer Status */}
            <div className="p-2 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 flex justify-center text-[10px] text-slate-400 uppercase tracking-widest gap-4">
                <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    Síncronizado com ChordPro
                </div>
                <div>{songStructure.length} Linhas</div>
            </div>
        </div>
    );
}
