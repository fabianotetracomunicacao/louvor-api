import React, { useState, useEffect, useRef } from 'react';
import {
    Save, Play, Music, ArrowLeft, Settings, Type, AlignJustify, Search, PlusCircle, Trash2,
    Eye, EyeOff, LayoutTemplate, Copy, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronRight,
    Settings2, X, Pause, FileDown, Bold, Upload, File, Loader2, Clock, PlayCircle, Tag, Eraser, Pencil,
    Globe, Sparkles, Bookmark, Undo, Redo
} from 'lucide-react';


import { useNavigate, useSearchParams, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { saveSong, getSongById, getUserSongPreference, saveUserSongPreference, checkDuplicateSongs } from '../utils/storage';
import { Portal } from '../components/Portal';
import { SongSearchModal } from '../components/SongSearchModal';
import { transposeSong, getTransposedNote, detectKeyFromContent } from '../utils/transposition';
import { ChordProRenderer } from '../components/ChordRenderer';
import { extractSlides } from '../utils/lyricsParser';
import { parseImporter, exportToVisual, isChordLine, isTabLine } from '../utils/importer';
import { supabase } from '../supabaseClient';

export function EditorPage() {
    const { isEditor, user, isChurchAdmin, isSuperAdmin } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { id: paramId } = useParams();
    const location = useLocation();
    const { showToast, confirmAction } = useNotification();
    const songId = paramId || searchParams.get('id');
    const textareaRef = useRef(null);

    // Redirect if not editor
    useEffect(() => {
        if (user && !isEditor) {
            navigate('/');
        }
    }, [user, isEditor, navigate]);

    // Editor State
    const [content, setContent] = useState('');
    const [editorMode, setEditorMode] = useState('visual'); // 'code' (Bracketed) | 'visual' (Visual Chords)

    // Metadata State
    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [style, setStyle] = useState('');
    const [functions, setFunctions] = useState([]);
    const [youtubeLinks, setYoutubeLinks] = useState([]);
    const [originalKey, setOriginalKey] = useState('C');
    const [transposition, setTransposition] = useState(0);
    const [songType, setSongType] = useState(searchParams.get('type') || 'chords');
    const [cifraclubSlug, setCifraclubSlug] = useState(null);
    const [isOfficial, setIsOfficial] = useState(false);

    // Visual Preview Settings

    const [fontSize, setFontSize] = useState(16);
    const [tabFontSize, setTabFontSize] = useState(0); // 0 = Auto calculated
    const [lineSpacing, setLineSpacing] = useState(1);
    const [duration, setDuration] = useState(0);

    // Import State
    const [isImporting, setIsImporting] = useState(false);
    const [importText, setImportText] = useState('');

    // Section Dropdown State
    const [isSectionMenuOpen, setIsSectionMenuOpen] = useState(false);

    // Undo / Redo History State
    const historyRef = useRef([]);
    const redoRef = useRef([]);
    const contentRef = useRef('');
    const lastSavedContentRef = useRef('');
    const typingTimeoutRef = useRef(null);
    const typingSessionRef = useRef(false);

    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const updateUndoRedoStatus = () => {
        setCanUndo(historyRef.current.length > 0);
        setCanRedo(redoRef.current.length > 0);
    };

    const pushHistory = (snapshot) => {
        if (snapshot === undefined || snapshot === null) return;
        const history = historyRef.current;
        if (history.length > 0 && history[history.length - 1] === snapshot) return;
        history.push(snapshot);
        if (history.length > 50) history.shift();
        redoRef.current = [];
        lastSavedContentRef.current = snapshot;
        updateUndoRedoStatus();
    };

    const handleUndo = () => {
        if (historyRef.current.length === 0) return;
        const previous = historyRef.current.pop();
        redoRef.current.push(contentRef.current);
        contentRef.current = previous;
        lastSavedContentRef.current = previous;
        setContent(previous);
        updateUndoRedoStatus();
    };

    const handleRedo = () => {
        if (redoRef.current.length === 0) return;
        const next = redoRef.current.pop();
        historyRef.current.push(contentRef.current);
        contentRef.current = next;
        lastSavedContentRef.current = next;
        setContent(next);
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

    // Metadata Modal State
    const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [duplicateWarning, setDuplicateWarning] = useState(null);

    useEffect(() => {
        if (songId) {
            const loadSong = async () => {
                const song = await getSongById(songId);
                if (song) {
                    setTitle(song.title);
                    setArtist(song.artist || '');
                    setStyle(song.style || '');
                    setFunctions(song.functions || []);
                    setYoutubeLinks(song.youtubeLinks || []);
                    setDuration(song.duration || 0);
                    setSongType(song.type || 'chords');
                    setCifraclubSlug(song.cifraclub_slug || null);
                    setIsOfficial(song.is_official || false);

                    // Internal format is always Code/ChordPro. 
                    // If default mode is Visual, convert immediately.
                    const loadedContent = editorMode === 'visual'
                        ? exportToVisual(song.content)
                        : song.content;

                    setContent(loadedContent);
                    // Sync contentRef so undo history starts from the loaded content
                    contentRef.current = loadedContent;
                    historyRef.current = [];
                    redoRef.current = [];
                    updateUndoRedoStatus();

                    setOriginalKey(song.originalKey || 'C');
                    if (song.fontSize) setFontSize(song.fontSize);
                    if (song.tabFontSize) setTabFontSize(song.tabFontSize);
                    if (song.lineSpacing) setLineSpacing(song.lineSpacing);

                    // Load User Preference
                    const pref = await getUserSongPreference(songId);
                    setTransposition(pref?.transposition || 0);
                }
            };
            loadSong();
        }
    }, [songId]);

    // Handle Import from location.state (Internet Search)
    useEffect(() => {
        if (location.state?.importData) {
            const data = location.state.importData;
            setTitle(data.title || '');
            setArtist(data.artist || '');
            setYoutubeLinks(data.youtubeLinks || []);
            setCifraclubSlug(data.cifraclub_slug || null);
            setIsOfficial(false);

            const importedContent = editorMode === 'visual'
                ? exportToVisual(data.content)
                : data.content;

            setContent(importedContent);
            // Sync contentRef so undo history starts from the imported content
            contentRef.current = importedContent;
            historyRef.current = [];
            redoRef.current = [];
            updateUndoRedoStatus();

            // Suggest detected key if missing or unknown in import data
            if (!data.originalKey || data.originalKey === '?') {
                const detected = detectKeyFromContent(data.content);
                if (detected) setOriginalKey(detected);
            }

            // Clear state to prevent re-import when editorMode changes (critical bug fix)
            navigate(location.pathname + location.search, { replace: true, state: {} });
        }
    }, [location.state]);

    // Handle Mode Switching
    const handleModeSwitch = (newMode) => {
        if (newMode === editorMode) return;

        let switched;
        if (newMode === 'visual') {
            // Code -> Visual
            switched = exportToVisual(content);
        } else {
            // Visual -> Code
            switched = parseImporter(content);
        }
        setContent(switched);
        contentRef.current = switched;
        setEditorMode(newMode);
    };

    // When saving, if in Visual Mode, we must convert back to Code Mode temporarily or permanently?
    // User expects to Save what is there.
    // BUT the system storage expects ChordPro format for rendering?
    // Yes, 'ChordProRenderer' expects bracketed chords.
    // So if we save in Visual Mode, we MUST convert to code before saving.

    const getContentForSave = () => {
        if (editorMode === 'visual') {
            return parseImporter(content);
        }
        return content;
    };

    const handleTranspositionChange = (newVal) => {
        setTransposition(newVal);
    };

    const handleSave = async (overrideData = {}, skipDuplicateCheck = false) => {
        if (isSaving) return;

        const currentTitle = overrideData.title !== undefined ? overrideData.title : title;
        const currentArtist = overrideData.artist !== undefined ? overrideData.artist : artist;
        const currentStyle = overrideData.style !== undefined ? overrideData.style : style;
        const currentFunctions = overrideData.functions !== undefined ? overrideData.functions : functions;
        const currentYoutubeLinks = overrideData.youtubeLinks !== undefined ? overrideData.youtubeLinks : youtubeLinks;
        const currentDuration = overrideData.duration !== undefined ? overrideData.duration : duration;

        if (!currentTitle.trim()) {
            showToast('Por favor, dê um nome para a música.', 'warning');
            return;
        }

        if (!songId && !skipDuplicateCheck) {
            const existingSongs = await checkDuplicateSongs(currentTitle);
            if (existingSongs && existingSongs.length > 0) {
                setDuplicateWarning({
                    overrideData,
                    existingSongs
                });
                return; // Stop saving, wait for user confirmation
            }
        }

        // Prepare content
        const contentToSave = getContentForSave();

        const songData = {
            id: songId || undefined,
            title: currentTitle,
            artist: currentArtist,
            style: currentStyle,
            functions: currentFunctions,
            youtubeLinks: currentYoutubeLinks,
            duration: currentDuration,
            content: contentToSave,
            originalKey,
            fontSize,
            tabFontSize,
            lineSpacing,
            type: songType,
            cifraclub_slug: cifraclubSlug,
            is_official: isOfficial,
            tags: [],
        };

        setIsSaving(true);
        try {
            const savedSong = await saveSong(songData);

            if (savedSong?.id) {
                try {
                    await saveUserSongPreference(savedSong.id, transposition);
                } catch (prefErr) {
                    console.warn("Could not save transposition pref, but song was saved:", prefErr);
                }
            }

            showToast('Música salva com sucesso!', 'success');
            if (!songId && savedSong?.id) {
                navigate(`/editor?id=${savedSong.id}`, { replace: true });
            }
        } catch (error) {
            console.error(error);
            showToast('Erro ao salvar música.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleInsertLyricsTag = (tagText) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentScrollTop = textarea.scrollTop;

        const textBefore = content.substring(0, start);
        const selectedText = content.substring(start, end);
        const textAfter = content.substring(end);

        const prefix = textBefore.endsWith('\n') || textBefore.length === 0 ? '' : '\n';
        const suffix = '\n';
        const tagString = `${prefix}[${tagText}]${suffix}`;

        const newContent = textBefore + tagString + selectedText + textAfter;
        const newCursorPos = start + tagString.length + selectedText.length;

        setContent(newContent);

        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                textareaRef.current.scrollTop = currentScrollTop;
            }
        }, 10);
    };

    const handleInsertBold = (e) => {

        if (e) e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const scrollTop = textarea.scrollTop;

        // Visual Mode: Advanced Logic with Chord Alignment
        if (editorMode === 'visual') {
            const lines = text.split('\n');
            const startLineIdx = text.substring(0, start).split('\n').length - 1;
            const endLineIdx = text.substring(0, end).split('\n').length - 1;

            let cursorDeltaStart = 0;
            let cursorDeltaEnd = 0;

            // Iterate only through affected lines
            for (let i = startLineIdx; i <= endLineIdx; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                // Validation: formatting only applies to data lines (not chords, tabs, or empty)
                if (!trimmed || isChordLine(line) || isTabLine(line)) {
                    continue;
                }

                // Check for toggle (remove bold)
                if (/^\*.*\*$/.test(trimmed) && trimmed.length > 2) {
                    // Remove Bold
                    const firstStarIdx = line.indexOf('*');
                    const secondStarIdx = line.lastIndexOf('*');

                    const rawContent = line.substring(firstStarIdx + 1, secondStarIdx);
                    const prefix = line.substring(0, firstStarIdx);
                    lines[i] = prefix + rawContent;

                    // Adjust Cursor (Track for selection restoration)
                    // If cursor was after the * removed, shift left.
                    // This is approximate logic as selection range is complex.
                    if (i === startLineIdx) cursorDeltaStart -= 1;
                    if (i === endLineIdx) cursorDeltaEnd -= 2;

                    // --- CHORD ALIGNMENT FIX (Unbold) ---
                    // If there is a chord line above, remove spaces to compensate (reverse of add)
                    if (i > 0 && isChordLine(lines[i - 1])) {
                        let prevLine = lines[i - 1];

                        // We check the second star first to avoid index shifting
                        // The space was inserted at secondStarIdx (relative to current line)
                        // Actually, when we added, we added at firstStarIdx and then secondStarIdx + 1.
                        // So the spaces currently exist at firstStarIdx and secondStarIdx.

                        // Remove space at secondStarIdx
                        if (prevLine.length > secondStarIdx && prevLine[secondStarIdx] === ' ') {
                            prevLine = prevLine.slice(0, secondStarIdx) + prevLine.slice(secondStarIdx + 1);
                        }

                        // Remove space at firstStarIdx
                        if (prevLine.length > firstStarIdx && prevLine[firstStarIdx] === ' ') {
                            prevLine = prevLine.slice(0, firstStarIdx) + prevLine.slice(firstStarIdx + 1);
                        }

                        lines[i - 1] = prevLine;

                        // Since we modified a PREVIOUS line, ALL subsequent cursors shift left by 2!
                        cursorDeltaStart -= 2;
                        cursorDeltaEnd -= 2;
                    }

                } else {
                    // Add Bold
                    const match = line.match(/^(\s*)(.*?)(\s*)$/);
                    if (match) {
                        const [_, prefix, content, suffix] = match;
                        if (content) {
                            // Apply Bold
                            lines[i] = `${prefix}*${content}*${suffix}`;

                            // Calculate insertion points relative to the original line
                            const firstStarIdx = prefix.length;
                            const secondStarIdx = prefix.length + content.length; // Original end index

                            // Adjust Cursor (Track for selection restoration)
                            if (i < startLineIdx) {
                                // Modified a line BEFORE selection? Unlikely in this loop logic unless loop changed?
                                // Actually, startLineIdx is fixed. So this is for current line cursor adjustments.
                            }
                            // Calculate local shift for this line
                            // If cursor was at start of content, it's now after *.

                            if (i === startLineIdx && start >= (getLineStartPos(text, i) + firstStarIdx)) cursorDeltaStart += 1;
                            if (i === endLineIdx) cursorDeltaEnd += 2; // Both stars added

                            // --- CHORD ALIGNMENT FIX ---
                            // If there is a chord line above, insert spaces to compensate
                            if (i > 0 && isChordLine(lines[i - 1])) {
                                let prevLine = lines[i - 1];

                                // Insert space for the FIRST star (at firstStarIdx)
                                // We pad prevLine if it's too short
                                while (prevLine.length < firstStarIdx) prevLine += ' ';
                                prevLine = prevLine.slice(0, firstStarIdx) + ' ' + prevLine.slice(firstStarIdx);

                                // Insert space for the SECOND star
                                // The second star was logically at `secondStarIdx`.
                                // But `prevLine` has grown by 1 character due to the first space.
                                // So we insert at `secondStarIdx + 1`.
                                const adjSecondIdx = secondStarIdx + 1;
                                while (prevLine.length < adjSecondIdx) prevLine += ' ';
                                prevLine = prevLine.slice(0, adjSecondIdx) + ' ' + prevLine.slice(adjSecondIdx);

                                lines[i - 1] = prevLine;

                                // Since we modified a PREVIOUS line, ALL subsequent cursors shift by 2!
                                cursorDeltaStart += 2;
                                cursorDeltaEnd += 2;
                            }
                        }
                    }
                }
            }

            const newText = lines.join('\n');
            setContent(newText);

            setTimeout(() => {
                textarea.focus();
                // Simple cursor restoration:
                // Selection logic is complex with multiple lines. 
                // We assume user expects to select the newly bolded text or keep range.
                // We add the accumulated delta.
                textarea.setSelectionRange(start + cursorDeltaStart, end + cursorDeltaEnd);
                textarea.scrollTop = scrollTop;
            }, 0);

        } else {
            // Code Mode (Standard Markdown Logic)
            let newText = '';
            let newCursorPos = 0;
            const selectedText = text.substring(start, end);
            const before = text.substring(0, start);
            const after = text.substring(end);

            if (start === end) {
                newText = before + '**' + after;
                newCursorPos = start + 1;
            } else if (selectedText.includes('\n')) {
                // Multi-line Bolding logic
                const lines = selectedText.split('\n');
                // Check if all text lines are already bolded
                const isAllTextLinesBolded = lines.every(l => {
                    const t = l.trim();
                    if (!t || t.startsWith('{') || t.startsWith('[') || t.startsWith('#')) return true;
                    return t.startsWith('*') && t.endsWith('*');
                });

                const newLines = lines.map(l => {
                    const t = l.trim();
                    if (!t || t.startsWith('{') || t.startsWith('[') || t.startsWith('#')) return l;
                    if (isAllTextLinesBolded) {
                        // Remove bold
                        let lineNew = l;
                        if (lineNew.trim().startsWith('*')) lineNew = lineNew.replace(/\*/, '');
                        if (lineNew.trim().endsWith('*')) lineNew = lineNew.replace(/\*$/, '');
                        return lineNew;
                    }
                    return `*${l}*`;
                });
                newText = before + newLines.join('\n') + after;
                newCursorPos = start + newLines.join('\n').length;
            } else {
                if (selectedText.startsWith('*') && selectedText.endsWith('*') && selectedText.length > 1) {
                    newText = before + selectedText.slice(1, -1) + after;
                    newCursorPos = start + selectedText.length - 2;
                } else {
                    newText = before + '*' + selectedText + '*' + after;
                    newCursorPos = start + selectedText.length + 2;
                }
            }

            setContent(newText);
            setTimeout(() => {
                textarea.focus();
                if (start !== end) {
                    if (newText.length > text.length) {
                        textarea.setSelectionRange(start, newCursorPos);
                    } else {
                        textarea.setSelectionRange(start, newCursorPos);
                    }
                } else {
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                }
                textarea.scrollTop = scrollTop;
            }, 0);
        }
    };

    // Helper for finding line start position
    const getLineStartPos = (fullText, lineIdx) => {
        return fullText.split('\n').slice(0, lineIdx).reduce((acc, line) => acc + line.length + 1, 0);
    };

    const handleInsertTag = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const tagText = window.prompt("Texto da etiqueta (ex: Suave, Todos, Acapella):");
        if (!tagText || !tagText.trim()) return;

        const cleanTag = tagText.trim();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;

        const before = text.substring(0, start);
        const selected = text.substring(start, end);
        const after = text.substring(end);

        // If selection spans multiple characters, treat as Block Tag
        if (selected.length > 0) {
            // Block Tag Syntax: {tag: Label} ... {endtag}
            const insertStart = `{tag: ${cleanTag}}\n`;
            const insertEnd = `\n{endtag}`;

            const newText = before + insertStart + selected + insertEnd + after;
            const newCursorPos = start + insertStart.length + selected.length + insertEnd.length;

            setContent(newText);

            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
        } else {
            // Inline Tag (Single Point)
            const insert = `{c: ${cleanTag}} `;
            const newText = before + insert + after;
            const newCursorPos = start + insert.length;

            setContent(newText);

            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 0);
        }
    };

    const handleInsertSection = (sectionName) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;

        const before = text.substring(0, start);
        const after = text.substring(end);

        const needsNewlineBefore = before.length > 0 && !before.endsWith('\n');
        const needsNewlineAfter = after.length > 0 && !after.startsWith('\n');

        const insert = `${needsNewlineBefore ? '\n' : ''}{c: ${sectionName}}${needsNewlineAfter ? '\n' : ''}`;
        const newText = before + insert + after;
        const newCursorPos = start + insert.length;

        setContent(newText);
        setIsSectionMenuOpen(false);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };


    const handleEditTag = (e) => {
        if (e) e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const scrollTop = textarea.scrollTop;

        // Find all tags
        const regex = /(\{c:\s*.*?\})|(\{tag:\s*.*?\})/gi; // We only edit start tags or inline tags, not endtags
        const matches = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                text: match[0],
                type: match[0].startsWith('{c:') ? 'inline' : 'start'
            });
        }

        // Find match intersecting cursor
        const target = matches.find(m =>
            (start >= m.start && start <= m.end) ||
            (end >= m.start && end <= m.end) ||
            (start <= m.start && end >= m.end)
        );

        if (target) {
            // Extract content: "{c: Intro}" -> "Intro"
            // "{tag: Refrão}" -> "Refrão"
            const currentContent = target.text.replace(/^\{(c|tag):\s*/, '').replace(/\}$/, '');

            const newContent = window.prompt("Editar Etiqueta:", currentContent);
            if (newContent !== null && newContent !== currentContent) {
                const newTag = target.type === 'inline'
                    ? `{c: ${newContent.trim()}}`
                    : `{tag: ${newContent.trim()}}`;

                const newText = text.substring(0, target.start) + newTag + text.substring(target.end);
                const newCursor = target.start + newTag.length;

                setContent(newText);
                setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(newCursor, newCursor);
                    textarea.scrollTop = scrollTop;
                }, 0);
            }
        } else {
            showToast("Nenhuma etiqueta selecionada para editar.", "info");
        }
    };

    const handleRemoveTag = (e) => {
        if (e) e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const scrollTop = textarea.scrollTop;

        // Find all tags
        const regex = /(\{c:\s*.*?\})|(\{tag:\s*.*?\})|(\{endtag\})/gi;
        const matches = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push({
                start: match.index,
                end: match.index + match[0].length,
                text: match[0],
                type: match[0].startsWith('{c:') ? 'inline' : (match[0].startsWith('{tag:') ? 'start' : 'end')
            });
        }

        // Find match intersecting cursor
        const targetIndex = matches.findIndex(m =>
            (start >= m.start && start <= m.end) ||
            (end >= m.start && end <= m.end) ||
            (start <= m.start && end >= m.end)
        );

        if (targetIndex !== -1) {
            const target = matches[targetIndex];
            let newText = text;
            let newCursor = start;

            // Logic for pair removal
            let itemsToRemove = [target]; // Default: remove just target

            if (target.type === 'start') {
                // Find next 'end' tag (matching level)
                let balance = 0;
                for (let i = targetIndex + 1; i < matches.length; i++) {
                    const m = matches[i];
                    if (m.type === 'start') balance++;
                    if (m.type === 'end') {
                        if (balance === 0) {
                            itemsToRemove.push(m);
                            break;
                        }
                        balance--;
                    }
                }
            } else if (target.type === 'end') {
                // Find previous 'start' tag (matching level)
                let balance = 0;
                for (let i = targetIndex - 1; i >= 0; i--) {
                    const m = matches[i];
                    if (m.type === 'end') balance++;
                    if (m.type === 'start') {
                        if (balance === 0) {
                            itemsToRemove.push(m);
                            break;
                        }
                        balance--;
                    }
                }
            }

            // Remove items (sort by start index descending to avoid shift issues when slicing string)
            itemsToRemove.sort((a, b) => b.start - a.start);

            itemsToRemove.forEach(item => {
                newText = newText.substring(0, item.start) + newText.substring(item.end);

                // Adjust cursor if it was located AFTER the removal point
                const cutLength = item.end - item.start;
                if (newCursor > item.start) {
                    newCursor = Math.max(item.start, newCursor - cutLength);
                }
            });

            setContent(newText);

            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(newCursor, newCursor);
                textarea.scrollTop = scrollTop;
            }, 0);
        } else {
            showToast("Nenhuma etiqueta selecionada para remover.", "info");
        }
    };

    // handleInsertTag/removeTag removed as per previous step, but if they exist they should handle mode?
    // They were removed.

    const handleTest = () => {
        if (!songId) {
            showToast('Por favor, salve a música antes de visualizar.', 'warning');
            return;
        }

        const tempSong = {
            id: songId,
            title: title || 'Sem Título',
            artist: artist || 'Desconhecido',
            content: getContentForSave(), // Ensure we pass Code format
            originalKey,
            youtubeLinks,
            duration
        };
        navigate(`/player/${songId}`, { state: { song: tempSong } });
    };

    const runImport = () => {
        if (!importText.trim()) return;

        // If we are in code mode, we convert to code.
        // If we represent a file upload, we usually want to convert to code first?
        // Or if in visual mode, convert to visual?
        // parseImporter returns Code.
        // So:
        const convertedCode = parseImporter(importText);

        if (editorMode === 'visual') {
            // Convert Code -> Visual
            const visual = exportToVisual(convertedCode);
            setContent(visual);
        } else {
            setContent(convertedCode);
        }

        // Suggest key based on imported content
        const detected = detectKeyFromContent(convertedCode);
        if (detected) setOriginalKey(detected);

        setIsImporting(false);
        setImportText('');
    };

    const handleImportFromSearch = (data) => {
        if (data.id) {
            // It's a local search result, just redirect
            navigate(`/editor?id=${data.id}`, { replace: true });
            return;
        }

        // It's an external result
        setTitle(data.title);
        setArtist(data.artist);
        setYoutubeLinks(data.youtubeLinks || []);
        setCifraclubSlug(data.cifraclub_slug);
        setIsOfficial(data.is_official);

        if (editorMode === 'visual') {
            setContent(exportToVisual(data.content));
        } else {
            setContent(data.content);
        }

        showToast(`${data.title} importada com sucesso!`, 'success');
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 relative overflow-hidden">
            {/* Header */}
            <div className="p-3 md:p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20">
                <div className="flex flex-col md:flex-row items-center md:items-center md:justify-between gap-1 md:gap-4">
                    <div className="flex items-center md:items-start gap-3 w-full md:w-auto justify-center md:justify-start relative">
                        <button
                            onClick={() => navigate(-1)}
                            className="absolute left-0 top-0 md:static p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition mt-1"
                        >
                            <ArrowLeft size={20} />
                        </button>

                        {/* Text + Button Group */}
                        <div className="flex flex-col md:flex-row items-center gap-2">
                            {/* Text Input Stack */}
                            <div className="flex flex-col justify-center items-center md:items-start">
                                <input
                                    type="text"
                                    placeholder="Título da Música"
                                    className="bg-transparent text-2xl md:text-2xl font-bold text-slate-900 dark:text-white placeholder:text-slate-400 border-none outline-none leading-none mb-0 pb-0 min-w-[50px] text-center md:text-left"
                                    style={{ width: `${Math.max((title || '').length, 10)}ch` }}
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                />
                                <div className="flex items-center gap-2 flex-wrap -mt-1 justify-center md:justify-start">
                                    <input
                                        type="text"
                                        placeholder="Artista"
                                        className="bg-transparent text-xs md:text-sm font-medium text-slate-600 dark:text-slate-400 placeholder:text-slate-500 border-none outline-none min-w-[50px] text-center md:text-left"
                                        style={{ width: `${Math.max((artist || '').length, 10)}ch` }}
                                        value={artist}
                                        onChange={e => setArtist(e.target.value)}
                                    />
                                </div>
                                {songType === 'lyrics' && (
                                    <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded ml-2 uppercase tracking-wider">
                                        Editor de Letras
                                    </span>
                                )}
                                {/* Mobile: Details Button - Below Artist */}
                                <button
                                    onClick={() => setIsMetadataModalOpen(true)}
                                    className="md:hidden text-[10px] md:text-xs bg-slate-100 dark:bg-slate-700 px-3 py-1 rounded text-slate-500 hover:text-purple-600 transition whitespace-nowrap mt-1"
                                >
                                    + Detalhes
                                </button>
                            </div>

                            {/* Desktop: Details Button - Vertically Centered relative to Block */}
                            <button
                                onClick={() => setIsMetadataModalOpen(true)}
                                className="hidden md:block text-xs bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-lg text-slate-500 hover:text-purple-600 transition whitespace-nowrap"
                            >
                                + Detalhes
                            </button>
                        </div>


                    </div>

                    {/* Actions */}
                    {/* Actions */}
                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-1 md:mt-0 justify-center w-full md:w-auto md:pl-0">
                        {songId && (
                            <button
                                onClick={handleTest}
                                className="p-2 md:p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-200 transition"
                                title="Visualizar"
                            >
                                <Eye size={18} className="md:w-5 md:h-5" />
                            </button>
                        )}
                        {(isSuperAdmin || isChurchAdmin) && (
                            <button
                                onClick={() => {
                                    navigate(`/visual-editor${songId ? `?id=${songId}` : ''}`, { 
                                        state: { content: getContentForSave(), title, artist } 
                                    });
                                }}
                                className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition shadow-lg shadow-purple-500/20 text-xs md:text-base"
                                title="Experimentar Novo Editor Visual (WYSIWYG)"
                            >
                                <Sparkles size={16} className="md:w-5 md:h-5 animate-pulse" />
                                <span className="text-xs font-bold hidden sm:inline">Editor Pro</span>
                            </button>
                        )}

                        <button
                            onClick={() => setIsSearchModalOpen(true)}
                            className="flex items-center gap-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-3 py-2 md:px-4 md:py-3 rounded-lg font-bold hover:bg-purple-200 transition text-xs md:text-base border border-purple-200 dark:border-purple-800"
                        >
                            <Globe size={16} className="md:w-5 md:h-5" />
                            <span className="hidden sm:inline">Cifra na internet</span>
                        </button>

                        <button
                            onClick={() => setIsImporting(true)}
                            className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-2 md:px-4 md:py-3 rounded-lg font-bold hover:bg-blue-200 transition text-xs md:text-base"
                        >
                            <FileDown size={16} className="md:w-5 md:h-5" />
                            <span className="hidden sm:inline">Arquivo</span>
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`flex items-center gap-2 px-3 py-2 md:px-6 md:py-3 rounded-lg font-bold transition shadow-lg text-xs md:text-base ${isSaving
                                ? 'bg-slate-400 cursor-not-allowed text-white'
                                : 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-600/20'
                                }`}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 size={16} className="md:w-5 md:h-5 animate-spin" />
                                    <span>Salvando...</span>
                                </>
                            ) : (
                                <>
                                    <Save size={16} className="md:w-5 md:h-5" />
                                    <span>Salvar</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Split Content */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
                {/* Editor Pane (Left) */}
                <div className="flex-1 w-full md:w-auto flex flex-col border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 min-h-0">
                    <div className="p-2 bg-slate-100 dark:bg-slate-800/50 text-[10px] md:text-xs font-mono text-slate-500 uppercase tracking-wider flex flex-col gap-1 md:gap-2 border-b border-slate-200 dark:border-slate-800 h-auto min-h-[72px] justify-center">
                        {/* Row 1 & 2: Label + Input Tools */}
                        <div className="flex flex-col md:flex-row items-start md:items-center gap-1 md:gap-2 w-full">
                            <span className="h-6 md:h-auto flex items-center">Entrada</span>
                            {/* Toolbar Buttons */}
                            {songType === 'lyrics' ? (
                                <div className="flex flex-wrap gap-1.5 items-center w-full">
                                    {['Verso 1', 'Verso 2', 'Pré-Refrão', 'Refrão', 'Ponte', 'Final'].map(tag => (
                                        <button
                                            key={tag}
                                            onClick={() => handleInsertLyricsTag(tag)}
                                            className="text-[10px] font-bold px-2 py-1 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-600 hover:border-blue-500 hover:text-blue-600 transition"
                                        >
                                            [{tag}]
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-8 md:h-auto flex items-center gap-2 justify-start w-full md:w-auto">
                                    <button
                                        onClick={handleUndo}
                                        disabled={!canUndo}
                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 transition disabled:opacity-30 disabled:hover:bg-transparent"
                                        title="Desfazer (Ctrl+Z)"
                                    >
                                        <Undo size={16} />
                                    </button>
                                    <button
                                        onClick={handleRedo}
                                        disabled={!canRedo}
                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 transition disabled:opacity-30 disabled:hover:bg-transparent"
                                        title="Refazer (Ctrl+Y)"
                                    >
                                        <Redo size={16} />
                                    </button>

                                    <button
                                        onClick={handleInsertBold}
                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 transition"
                                        title="Negrito (Refrão)"
                                    >
                                        <Bold size={16} />
                                    </button>

                                    {/* Botão de Seções {c: ...} */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setIsSectionMenuOpen(!isSectionMenuOpen)}
                                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 transition flex items-center gap-0.5"
                                            title="Inserir Marcação de Seção ({c: Seção})"
                                        >
                                            <Bookmark size={16} className="text-purple-600 dark:text-purple-400" />
                                            <ChevronDown size={12} className="text-slate-400" />
                                        </button>

                                        {isSectionMenuOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setIsSectionMenuOpen(false)} />
                                                <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50">
                                                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 mb-1">
                                                        Inserir Seção
                                                    </div>
                                                    {[
                                                        'Primeira Parte',
                                                        'Segunda Parte',
                                                        'Pré-Refrão',
                                                        'Refrão',
                                                        'Solo',
                                                        'Intro',
                                                        'Ponte',
                                                        'Interlúdio',
                                                        'Final'
                                                    ].map((sec) => (
                                                        <button
                                                            key={sec}
                                                            onClick={() => handleInsertSection(sec)}
                                                            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:text-purple-600 dark:hover:text-purple-300 transition flex items-center justify-between"
                                                        >
                                                            <span className="font-medium">{sec}</span>
                                                            <span className="text-[10px] text-slate-400 font-mono">{`{c: ${sec}}`}</span>
                                                        </button>
                                                    ))}
                                                    <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1">
                                                        <button
                                                            onClick={() => {
                                                                setIsSectionMenuOpen(false);
                                                                const customName = window.prompt("Nome da seção personalizada (ex: Ponte 2, Especial):");
                                                                if (customName && customName.trim()) {
                                                                    handleInsertSection(customName.trim());
                                                                }
                                                            }}
                                                            className="w-full text-left px-3 py-1.5 text-xs text-purple-600 dark:text-purple-400 font-semibold hover:bg-purple-50 dark:hover:bg-purple-900/30 transition flex items-center justify-between"
                                                        >
                                                            <span>+ Personalizada...</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleInsertTag}
                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-700 dark:text-slate-300 transition"
                                        title="Adicionar Etiqueta (Instrumentos/Dinâmica)"
                                    >
                                        <Tag size={16} />
                                    </button>
                                    <button
                                        onClick={handleEditTag}
                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-blue-500 hover:text-blue-600 transition"
                                        title="Editar Etiqueta (Selecione ou clique dentro da tag)"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                    <button
                                        onClick={handleRemoveTag}
                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-red-500 hover:text-red-600 transition"
                                        title="Remover Etiqueta (Selecione ou clique dentro da tag)"
                                    >
                                        <Eraser size={16} />
                                    </button>

                                    {/* Toggle Mode */}
                                    <div className="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-0.5 ml-auto md:ml-2">
                                        <button
                                            onClick={() => handleModeSwitch('visual')}
                                            className={`px-3 py-1 text-xs font-bold rounded-md transition ${editorMode === 'visual' ? 'bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                                            title="Modo Visual (Cifras sobre a letra)"
                                        >
                                            Cifra
                                        </button>
                                        <button
                                            onClick={() => handleModeSwitch('code')}
                                            className={`px-3 py-1 text-xs font-bold rounded-md transition ${editorMode === 'code' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                                            title="Modo Código (ChordPro)"
                                        >
                                            Código
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Row 3: Key - Hide for Lyrics */}
                        {songType !== 'lyrics' && (
                            <div className="h-8 md:h-auto flex items-center gap-2 w-full justify-start">
                                <span className="text-slate-400">Tom Original:</span>
                                <select
                                    value={originalKey}
                                    onChange={e => {
                                        setOriginalKey(e.target.value);
                                        handleTranspositionChange(0); // Reset transposition when base key changes to align them
                                    }}
                                    className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 rounded p-1"
                                >
                                    {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'].map(note => (
                                        <option key={note} value={note}>{note}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                    </div>
                    {/* Editor Container with Syntax Highlight */}
                    <div className="flex-1 relative overflow-hidden bg-slate-50 dark:bg-slate-900 font-mono text-sm leading-relaxed">

                        {/* Backdrop - Syntax Highlighting (Code Mode Only) */}
                        {editorMode === 'code' && <EditorBackdrop content={content} />}

                        {/* Foreground - Transparent Textarea */}
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => {
                                const newText = e.target.value;
                                const oldText = contentRef.current;
                                if (!typingSessionRef.current) {
                                    pushHistory(oldText);
                                    typingSessionRef.current = true;
                                }
                                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                typingTimeoutRef.current = setTimeout(() => {
                                    typingSessionRef.current = false;
                                }, 700);

                                setContent(newText);
                                contentRef.current = newText;
                            }}
                            onScroll={(e) => {
                                const backdrop = document.getElementById('editor-backdrop');
                                if (backdrop) {
                                    backdrop.scrollTop = e.target.scrollTop;
                                    backdrop.scrollLeft = e.target.scrollLeft;
                                }
                            }}
                            className="absolute inset-0 w-full h-full bg-transparent text-slate-800 dark:text-slate-300 p-6 focus:outline-none resize-none whitespace-pre z-10"
                            spellCheck="false"
                            autoCorrect="off"
                            autoComplete="off"
                            autoCapitalize="none"
                            placeholder="Cole sua cifra aqui... Use [Acorde] para indicar as notas."
                        />
                    </div>
                </div>

                {/* Preview Pane (Right) */}
                <div className="flex-1 w-full md:w-auto flex flex-col bg-white dark:bg-slate-950/50 min-h-0">
                    <div className="p-2 bg-slate-100 dark:bg-slate-800/50 text-[10px] md:text-xs font-mono text-slate-500 uppercase tracking-wider flex flex-col gap-1 md:gap-2 border-b border-slate-200 dark:border-slate-800 h-auto min-h-[72px] justify-center">
                        {/* Row 1 & 2: Label + Font Controls */}
                        <div className="flex flex-col md:flex-row items-start md:items-center gap-1 md:gap-4 w-full">
                            <span className="h-6 md:h-auto flex items-center">Pré-visualização</span>
                            <div className="h-8 md:h-auto flex items-center gap-3 justify-start w-full md:w-auto">
                                {/* Font Size Controls */}
                                <div className="flex items-center gap-1 group">
                                    <Type size={14} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                                    <button onClick={() => setFontSize(s => Math.max(12, s - 2))} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold">-</button>
                                    <span className="w-6 text-center text-slate-600 dark:text-slate-300">{fontSize}</span>
                                    <button onClick={() => setFontSize(s => Math.min(32, s + 2))} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold">+</button>
                                </div>

                                {/* Tab Size Controls */}
                                <div className="flex items-center gap-1 group" title="Tamanho da Tablatura (0 = Auto)">
                                    <LayoutTemplate size={14} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                                    <button onClick={() => setTabFontSize(s => Math.max(0, s - 1))} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-[10px]">-</button>
                                    <span className="w-6 text-center text-slate-600 dark:text-slate-300 text-[10px]">{tabFontSize || 'A'}</span>
                                    <button onClick={() => setTabFontSize(s => Math.min(24, s + 1))} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-[10px]">+</button>
                                </div>

                                {/* Line Spacing Controls */}
                                <div className="flex items-center gap-1 group">
                                    <AlignJustify size={14} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                                    <button onClick={() => setLineSpacing(s => Math.max(0.5, parseFloat((s - 0.1).toFixed(1))))} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold">-</button>
                                    <span className="w-8 text-center text-slate-600 dark:text-slate-300">{lineSpacing.toFixed(1)}</span>
                                    <button onClick={() => setLineSpacing(s => Math.min(3.0, parseFloat((s + 0.1).toFixed(1))))} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold">+</button>
                                </div>
                            </div>
                        </div>

                        {/* Row 3: Transposition */}
                        <div className="h-8 md:h-auto flex items-center gap-2 w-full justify-start">
                            <span className="text-slate-400">Meu tom:</span>
                            <div className="flex items-center gap-1">
                                <button onClick={() => handleTranspositionChange((transposition - 1 + 12) % 12)} className="px-2 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 font-mono text-slate-700 dark:text-slate-200 font-bold">-</button>
                                <span className="w-6 md:w-8 text-center text-slate-600 dark:text-slate-300 font-bold text-base md:text-lg leading-none normal-case">
                                    {getTransposedNote(originalKey, transposition)}
                                </span>
                                <button onClick={() => handleTranspositionChange((transposition + 1) % 12)} className="px-2 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 font-mono text-slate-700 dark:text-slate-200 font-bold">+</button>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8" style={{ fontSize: `${fontSize}px` }}>
                        {songType === 'lyrics' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {extractSlides(editorMode === 'visual' ? parseImporter(content) : content).map((slide, index) => (
                                    <div
                                        key={slide.id}
                                        className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col h-48 shadow-sm hover:shadow-md hover:border-purple-400 transition-all group"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">
                                                {slide.type || 'Slide'}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400">#{index + 1}</span>
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            {slide.lines.map((line, lIdx) => (
                                                <p key={lIdx} className="text-slate-700 dark:text-slate-300 leading-tight mb-1 truncate text-center">
                                                    {line}
                                                </p>
                                            ))}
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50 flex justify-center">
                                            <div className="w-8 h-1 bg-slate-200 dark:bg-slate-700 rounded-full group-hover:bg-purple-400 transition-colors"></div>
                                        </div>
                                    </div>
                                ))}
                                {content.trim().length === 0 && (
                                    <div className="col-span-full py-12 flex flex-col items-center text-slate-400">
                                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4 flex items-center justify-center">
                                            <ArrowDown size={32} className="text-slate-300" />
                                        </div>
                                        <p className="text-sm font-medium">Digite a letra à esquerda para gerar os slides.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <ChordProRenderer
                                content={transposeSong(editorMode === 'visual' ? parseImporter(content) : content, transposition)}
                                fontSize={fontSize}
                                tabFontSize={tabFontSize}
                                lineSpacing={lineSpacing}
                            />
                        )}
                    </div>
                </div>
            </div>
            {/* Import Model */}

            {/* Import Model */}
            {
                isImporting && (
                    <Portal>
                        <div className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4">
                            <div className="bg-white dark:bg-slate-900 w-full max-w-6xl rounded-2xl shadow-2xl flex flex-col h-[90vh]">
                                <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                                    <h3 className="text-2xl font-bold flex items-center gap-3">
                                        <FileDown size={32} className="text-purple-600" />
                                        Importar Música
                                    </h3>
                                    <button
                                        onClick={() => setIsImporting(false)}
                                        className="text-slate-400 hover:text-red-500 transition"
                                    >
                                        <X size={28} />
                                    </button>
                                </div>

                                <div className="p-6 flex-1 flex flex-col gap-4 overflow-hidden">
                                    <p className="text-base text-slate-600 dark:text-slate-400">
                                        Cole abaixo a cifra (com os acordes nas linhas de cima da letra).
                                        O sistema formatará para o padrão do editor.
                                    </p>
                                    <textarea
                                        value={importText}
                                        onChange={(e) => setImportText(e.target.value)}
                                        className="flex-1 w-full bg-slate-50 dark:bg-slate-800 p-6 rounded-xl font-mono text-sm leading-relaxed border border-slate-200 dark:border-slate-700 focus:border-purple-500 focus:outline-none resize-none"
                                        placeholder={`Exemplo: \n\nC                     G\nEu navegarei no oceano...`}
                                    />
                                </div>
                                <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
                                    <button
                                        onClick={() => setIsImporting(false)}
                                        className="px-6 py-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={runImport}
                                        disabled={!importText.trim()}
                                        className="px-8 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold shadow-lg shadow-purple-500/20 transition text-lg"
                                    >
                                        Processar e Importar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </Portal>
                )
            }

            {/* Metadata Modal */}
            {
                isMetadataModalOpen && (
                    <SongMetadataModal
                        initialData={{ title, artist, style, functions, youtubeLinks, duration }}
                        onSave={(data) => {
                            setTitle(data.title);
                            setArtist(data.artist);
                            setStyle(data.style);
                            setFunctions(data.functions);
                            setYoutubeLinks(data.youtubeLinks);
                            setDuration(data.duration);
                            setIsMetadataModalOpen(false);
                            // Auto-save when confirming metadata
                            handleSave(data);
                        }}
                        onCancel={() => {
                            // If cancelling on a NEW song without title, maybe go back?
                            // But user might just want to edit manually.
                            setIsMetadataModalOpen(false);
                        }}
                    />
                )
            }
            <SongSearchModal
                isOpen={isSearchModalOpen}
                onClose={() => setIsSearchModalOpen(false)}
                onImport={handleImportFromSearch}
            />

            {/* Duplicate Warning Modal */}
            {duplicateWarning && (
                <Portal>
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6">
                            <div className="flex items-center gap-3 mb-4 text-orange-600 dark:text-orange-400">
                                <AlertTriangle size={24} />
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Música já existe</h3>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                                Você já possui <strong>{duplicateWarning.existingSongs.length}</strong> versão(ões) da música <strong>{duplicateWarning.existingSongs[0].title}</strong> no sistema.
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                                Deseja salvar mesmo assim e criar uma <strong>nova versão</strong> ou deseja cancelar e usar a música que já existe no seu repertório?
                            </p>
                            
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setDuplicateWarning(null)}
                                    className="px-4 py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold text-sm transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        const override = duplicateWarning.overrideData;
                                        setDuplicateWarning(null);
                                        handleSave(override, true); // skip check
                                    }}
                                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold text-sm shadow-md shadow-orange-500/20 transition"
                                >
                                    Criar Nova Versão
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </div >
    );
}

// --- Metadata Component ---
function SongMetadataModal({ initialData, onSave, onCancel }) {
    const [title, setTitle] = useState(initialData.title || '');
    const [artist, setArtist] = useState(initialData.artist || '');
    const [style, setStyle] = useState(initialData.style || '');
    const [functions, setFunctions] = useState(initialData.functions || []);
    const [youtubeLinks, setYoutubeLinks] = useState(
        (initialData.youtubeLinks || []).map(link => {
            if (typeof link === 'string') {
                // Sanitize: remove placeholders like "não encontrado"
                if (link.toLowerCase().includes('encontrado') || !link.includes('http')) return null;
                return { title: 'Vídeo', url: link, type: 'youtube' };
            }
            if (link && typeof link === 'object' && link.url) {
                if (link.url.toLowerCase().includes('encontrado')) return null;
                return link;
            }
            return null;
        }).filter(Boolean)
            .concat((initialData.youtubeLinks || []).length === 0 ? [{ title: 'Vídeo Principal', url: '', type: 'youtube' }] : [])
    );
    const [duration, setDuration] = useState(initialData.duration || 300); // Standard Default 5:00
    const [durationInput, setDurationInput] = useState(''); // Text input MM:SS

    // Init duration text on mount
    useEffect(() => {
        const secondsValue = initialData.duration || 300;
        const m = Math.floor(secondsValue / 60);
        const s = secondsValue % 60;
        setDurationInput(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, []);

    // Helper to parse MM:SS
    const handleDurationChange = (val) => {
        // Allow formatting
        let v = val.replace(/[^0-9:]/g, '');
        if (v.length === 2 && !v.includes(':') && durationInput.length < 2) {
            v = v + ':';
        }
        setDurationInput(v);

        // Convert to seconds
        if (v.includes(':')) {
            const [m, s] = v.split(':');
            const seconds = (parseInt(m || '0') * 60) + parseInt(s || '0');
            setDuration(seconds);
        } else {
            setDuration(parseInt(v || '0'));
        }
    };

    // Dynamic Loading
    const [availableStyles, setAvailableStyles] = useState([]);
    const [availableFunctions, setAvailableFunctions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        async function loadMetadata() {
            setLoading(true);
            try {
                // Import these dynamically or pass as props? 
                // Better to import at top level, but for now assuming they are available in scope or we add import to top file.
                // We need to ensure getMusicalStyles/Functions are imported in the file options.
                const [s, f] = await Promise.all([
                    import('../utils/storage').then(mod => mod.getMusicalStyles()),
                    import('../utils/storage').then(mod => mod.getSongFunctions())
                ]);
                setAvailableStyles(s || []);
                setAvailableFunctions(f || []);
            } catch (error) {
                console.error("Error loading metadata:", error);
            } finally {
                setLoading(false);
            }
        }
        loadMetadata();
    }, []);

    const toggleFunction = (func) => {
        if (functions.includes(func)) {
            setFunctions(functions.filter(f => f !== func));
        } else {
            setFunctions([...functions, func]);
        }
    };

    return (
        <Portal>
            <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Detalhes da Música</h3>
                        <p className="text-sm text-slate-500 mt-1">Defina as informações principais para organizar seu repertório.</p>
                    </div>

                    <div className="p-6 pb-safe overflow-y-auto flex-1 space-y-6">
                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nome da Música</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 dark:text-white"
                                    placeholder="Ex: Oceano"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Artista/Cantor</label>
                                <input
                                    type="text"
                                    value={artist}
                                    onChange={e => setArtist(e.target.value)}
                                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 dark:text-white"
                                    placeholder="Ex: Ana Nóbrega"
                                />
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Duração (MM:SS)</label>
                                <div className="relative">
                                    <Clock size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                    <input
                                        type="text"
                                        value={durationInput}
                                        onChange={e => handleDurationChange(e.target.value)}
                                        className="w-full pl-9 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 dark:text-white font-mono"
                                        placeholder="00:00"
                                        maxLength={5}
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                                    * Necessário para a rolagem mágica automática.
                                </p>
                            </div>
                        </div>

                        {/* Style Selection */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Estilo Musical (Selecione 1)</label>
                            {loading ? <div className="text-sm text-slate-400">Carregando estilos...</div> : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {availableStyles.map(s => (
                                        <button
                                            key={s.id}
                                            onClick={() => setStyle(s.name)}
                                            className={`
                                            px-3 py-2 rounded-lg text-xs font-bold transition-all border
                                            ${style === s.name
                                                    ? 'bg-purple-600 text-white border-purple-600 shadow-lg scale-105'
                                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-purple-400'
                                                }
                                        `}
                                        >
                                            {s.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Function Selection */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Função (Múltipla escolha)</label>
                            {loading ? <div className="text-sm text-slate-400">Carregando funções...</div> : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {availableFunctions.map(f => (
                                        <button
                                            key={f.id}
                                            onClick={() => toggleFunction(f.name)}
                                            className={`
                                            flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border text-left
                                            ${functions.includes(f.name)
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                                                }
                                        `}
                                        >
                                            <div className={`w-3 h-3 rounded-full border ${functions.includes(f.name) ? 'bg-white border-white' : 'border-slate-400'}`}></div>
                                            {f.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* YouTube Links Section */}
                        <div className="border-t border-slate-200 dark:border-slate-800 pt-4 pb-8">
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-3 flex items-center gap-2">
                                <PlayCircle size={14} /> Links do YouTube (Aprender)
                            </label>

                            <div className="space-y-3">
                                {youtubeLinks.map((link, index) => (
                                    <div key={index} className="flex gap-2 items-start">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex gap-2 items-center">
                                                {link.type === 'file' ? <File size={16} className="text-blue-500" /> : <PlayCircle size={16} className="text-red-500" />}
                                                <input
                                                    type="text"
                                                    placeholder="Título"
                                                    className="flex-1 text-xs font-bold bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 focus:outline-none focus:border-purple-500 text-slate-800 dark:text-slate-200"
                                                    value={link.title}
                                                    onChange={e => {
                                                        const newLinks = [...youtubeLinks];
                                                        newLinks[index].title = e.target.value;
                                                        setYoutubeLinks(newLinks);
                                                    }}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="URL"
                                                className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 focus:outline-none focus:border-purple-500 text-slate-600 dark:text-slate-400"
                                                value={link.url}
                                                onChange={e => {
                                                    const newLinks = [...youtubeLinks];
                                                    newLinks[index].url = e.target.value;
                                                    setYoutubeLinks(newLinks);
                                                }}
                                                disabled={link.type === 'file'} // Prevent editing file URL manually? Or allow? user might want to fix.
                                            />
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newLinks = youtubeLinks.filter((_, i) => i !== index);
                                                setYoutubeLinks(newLinks);
                                            }}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition mt-1"
                                            title="Remover Link"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}

                                <div className="flex flex-wrap gap-3 mt-4 pt-2 mb-6 border-t border-slate-100 dark:border-slate-800">
                                    <button
                                        onClick={() => setYoutubeLinks([...youtubeLinks, { title: '', url: '', type: 'youtube' }])}
                                        className="px-3 py-2 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:border-red-300 transition flex items-center gap-2"
                                    >
                                        <PlusCircle size={14} /> Add YouTube Link
                                    </button>
                                    <label className={`px-3 py-2 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition flex items-center gap-2 cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                        {isUploading ? 'Enviando...' : 'Enviar Arquivo (PDF/Img)'}
                                        <input
                                            type="file"
                                            className="hidden"
                                            disabled={isUploading}
                                            onChange={async (e) => {
                                                const file = e.target.files[0];
                                                if (!file) return;

                                                setIsUploading(true); // Start loading

                                                try {
                                                    // Sanitize file name and create a unique path
                                                    const fileExt = file.name.split('.').pop();
                                                    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
                                                    const filePath = `backgrounds/${fileName}`;

                                                    // Upload to Supabase 'media' bucket
                                                    const { error: uploadError, data: uploadData } = await supabase.storage
                                                        .from('media')
                                                        .upload(filePath, file, { upsert: false });

                                                    if (uploadError) {
                                                        throw uploadError;
                                                    }

                                                    // Get public URL
                                                    const { data: { publicUrl } } = supabase.storage
                                                        .from('media')
                                                        .getPublicUrl(filePath);

                                                    setYoutubeLinks([...youtubeLinks, { title: file.name, url: publicUrl, type: 'file' }]);
                                                } catch (err) {
                                                    console.error("Erro no upload para Supabase:", err);
                                                    alert("Erro ao enviar arquivo: " + err.message);
                                                } finally {
                                                    setIsUploading(false); // Stop loading enable button
                                                    e.target.value = ''; // Reset input
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-slate-50 dark:bg-slate-900/50">
                        <button
                            onClick={onCancel}
                            disabled={isUploading}
                            className="px-4 py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-bold text-sm disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => onSave({ title, artist, style, functions, youtubeLinks, duration })}
                            disabled={loading || isUploading}
                            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold shadow-md transition text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isUploading ? <Loader2 size={16} className="animate-spin" /> : null}
                            {isUploading ? 'Aguarde...' : 'Confirmar'}
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
}

function EditorBackdrop({ content }) {
    const lines = content.split('\n');
    let isTab = false;

    return (
        <div
            id="editor-backdrop"
            className="absolute inset-0 p-6 pointer-events-none whitespace-pre overflow-hidden z-0"
        >
            {lines.map((line, i) => {
                const trimmed = line.trim();
                // Check markers
                if (trimmed === '{sot}' || trimmed === '{start_of_tab}') {
                    isTab = true;
                }

                const currentIsTab = isTab;

                // End Marker (line itself is still part of block visually? or ends it immediately?)
                if (trimmed === '{eot}' || trimmed === '{end_of_tab}') {
                    isTab = false;
                }

                return (
                    <div
                        key={i}
                        className={`w-full min-h-[1.5em] ${currentIsTab || (trimmed.startsWith('{sot')) ? 'bg-blue-100/50 dark:bg-blue-900/20' : ''}`}
                    >
                        &nbsp;
                    </div>
                );
            })}
        </div>
    );
}
