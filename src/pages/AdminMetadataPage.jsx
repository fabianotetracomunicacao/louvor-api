import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus, ArrowLeft, Music } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import {
    getMusicalStyles, addMusicalStyle, deleteMusicalStyle,
    getSongFunctions, addSongFunction, deleteSongFunction,
    getInstruments, addInstrument, deleteInstrument
} from '../utils/storage';

export function AdminMetadataPage() {
    const navigate = useNavigate();
    const { showToast, confirmAction } = useNotification();
    const [styles, setStyles] = useState([]);
    const [functions, setFunctions] = useState([]);
    const [instruments, setInstruments] = useState([]);
    const [newStyle, setNewStyle] = useState('');
    const [newFunction, setNewFunction] = useState('');
    const [newInstrument, setNewInstrument] = useState('');
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [s, f, i] = await Promise.all([
                getMusicalStyles(), 
                getSongFunctions(),
                getInstruments()
            ]);
            setStyles(s || []);
            setFunctions(f || []);
            setInstruments(i || []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleAddStyle = async (e) => {
        e.preventDefault();
        if (!newStyle.trim()) return;
        try {
            await addMusicalStyle(newStyle.trim());
            setNewStyle('');
            showToast('Estilo adicionado!', 'success');
            loadData();
        } catch (error) {
            showToast('Erro ao adicionar estilo.', 'error');
        }
    };

    const handleDeleteStyle = async (id) => {
        const confirmed = await confirmAction({
            title: 'Excluir Estilo',
            message: 'Tem certeza? Isso não removerá o estilo das músicas existentes.',
            confirmText: 'Excluir',
            type: 'warning'
        });

        if (confirmed) {
            await deleteMusicalStyle(id);
            showToast('Estilo removido.', 'success');
            loadData();
        }
    };

    const handleAddFunction = async (e) => {
        e.preventDefault();
        if (!newFunction.trim()) return;
        try {
            await addSongFunction(newFunction.trim());
            setNewFunction('');
            showToast('Função adicionada!', 'success');
            loadData();
        } catch (error) {
            showToast('Erro ao adicionar função.', 'error');
        }
    };

    const handleDeleteFunction = async (id) => {
        const confirmed = await confirmAction({
            title: 'Excluir Função',
            message: 'Tem certeza que deseja excluir esta função?',
            confirmText: 'Excluir',
            type: 'warning'
        });

        if (confirmed) {
            await deleteSongFunction(id);
            showToast('Função removida.', 'success');
            loadData();
        }
    };

    const handleAddInstrument = async (e) => {
        e.preventDefault();
        if (!newInstrument.trim()) return;
        try {
            await addInstrument(newInstrument.trim());
            setNewInstrument('');
            showToast('Instrumento/Função adicionada!', 'success');
            loadData();
        } catch (error) {
            showToast('Erro ao adicionar instrumento/função.', 'error');
        }
    };

    const handleDeleteInstrument = async (id) => {
        const confirmed = await confirmAction({
            title: 'Excluir Instrumento/Função',
            message: 'Tem certeza? Isso pode afetar as opções de escolha nas escalas de setlist.',
            confirmText: 'Excluir',
            type: 'warning'
        });

        if (confirmed) {
            await deleteInstrument(id);
            showToast('Item removido.', 'success');
            loadData();
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8">
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={() => navigate('/admin/users')}
                    className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition"
                >
                    <ArrowLeft size={24} />
                </button>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                    Gerenciar Metadados
                </h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {/* Styles Column */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 h-[600px] flex flex-col">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-purple-500 rounded-full"></span>
                        Estilos Musicais
                    </h2>

                    <form onSubmit={handleAddStyle} className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={newStyle}
                            onChange={e => setNewStyle(e.target.value)}
                            placeholder="Novo Estilo..."
                            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-purple-500"
                        />
                        <button
                            type="submit"
                            className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-lg transition"
                        >
                            <Plus size={20} />
                        </button>
                    </form>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {loading ? <p className="text-center text-slate-500 mt-10">Carregando...</p> : (
                            styles.map(style => (
                                <div key={style.id} className="group flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition text-sm">
                                    <span className="font-medium">{style.name}</span>
                                    <button
                                        onClick={() => handleDeleteStyle(style.id)}
                                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Functions Column */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 h-[600px] flex flex-col">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-blue-500 rounded-full"></span>
                        Funções Litúrgicas
                    </h2>

                    <form onSubmit={handleAddFunction} className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={newFunction}
                            onChange={e => setNewFunction(e.target.value)}
                            placeholder="Nova Função..."
                            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                        />
                        <button
                            type="submit"
                            className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition"
                        >
                            <Plus size={20} />
                        </button>
                    </form>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {loading ? <p className="text-center text-slate-500 mt-10">Carregando...</p> : (
                            functions.map(func => (
                                <div key={func.id} className="group flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition text-sm">
                                    <span className="font-medium">{func.name}</span>
                                    <button
                                        onClick={() => handleDeleteFunction(func.id)}
                                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Instruments/Roles Column */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 h-[600px] flex flex-col">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-indigo-500 rounded-full"></span>
                        Time: Instrumentos/Funções
                    </h2>

                    <form onSubmit={handleAddInstrument} className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={newInstrument}
                            onChange={e => setNewInstrument(e.target.value)}
                            placeholder="Novo Instrumento/Função..."
                            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        />
                        <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition"
                        >
                            <Plus size={20} />
                        </button>
                    </form>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {loading ? <p className="text-center text-slate-500 mt-10">Carregando...</p> : (
                            instruments.map(inst => (
                                <div key={inst.id} className="group flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition text-sm">
                                    <div className="flex items-center gap-2">
                                        <Music size={14} className="text-indigo-400" />
                                        <span className="font-medium">{inst.name}</span>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteInstrument(inst.id)}
                                        className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
