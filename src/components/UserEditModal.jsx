import React, { useState, useEffect } from 'react';
import { X, User, Mail, Shield, Lock, Trash2, Save, Music, Check, Phone, MessageCircle, Info, AlertCircle, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getInstruments } from '../utils/storage';
import { normalizePhone } from '../services/WhatsAppService';

// ─── Sub-components defined OUTSIDE the parent so React never recreates their
// identity on each render — which was the root cause of the focus-loss bug.

const inputClass = (hasIcon = true) =>
    `w-full ${hasIcon ? 'pl-9' : 'pl-3'} pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition placeholder:text-slate-600`;

function InputField({ label, icon: Icon, children }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                {label}
            </label>
            <div className="relative">
                {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />}
                {children}
            </div>
        </div>
    );
}

function SectionToggle({ id, label, icon: Icon, activeSection, setActiveSection, children }) {
    const isOpen = activeSection === id;
    return (
        <div className="border border-slate-700 rounded-xl overflow-hidden">
            <button
                type="button"
                onClick={() => setActiveSection(isOpen ? null : id)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/60 hover:bg-slate-900/80 text-left transition"
            >
                <span className="flex items-center gap-2 text-sm font-bold text-slate-200">
                    <Icon size={16} className="text-purple-400 shrink-0" />
                    {label}
                </span>
                {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </button>
            {isOpen && (
                <div className="p-4 space-y-4 bg-slate-900/30 border-t border-slate-700">
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function UserEditModal({ user, onClose, onUserUpdated }) {
    const [formData, setFormData] = useState({
        name: user.name || user.full_name || '',
        email: user.email || '',
        role: user.role || 'WORSHIPPER',
        instrument: user.instrument || '',
        active_church_id: user.active_church_id || '',
        phone: user.whatsapp || user.phone || '',
    });
    const [selectedInstruments, setSelectedInstruments] = useState(user.available_instruments || []);
    const [instrumentsMetadata, setInstrumentsMetadata] = useState([]);
    const [churches, setChurches] = useState([]);
    const [newPassword, setNewPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [activeSection, setActiveSection] = useState('profile');

    // Phone normalization preview — computed values only, no state changes
    const phoneNormalized = formData.phone ? normalizePhone(formData.phone) : null;
    const phoneIsValid = phoneNormalized && phoneNormalized.length >= 12;
    const phoneWarning = formData.phone && !phoneIsValid;

    useEffect(() => {
        const loadMetadata = async () => {
            const metadata = await getInstruments();
            setInstrumentsMetadata(metadata);
        };
        const loadChurches = async () => {
            const { data } = await supabase.from('churches').select('id, name').eq('status', 'active');
            if (data) setChurches(data);
        };
        loadMetadata();
        loadChurches();
    }, []);

    const toggleInstrument = (name) => {
        setSelectedInstruments(prev =>
            prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]
        );
    };

    const handleUpdateUser = async () => {
        setLoading(true);
        try {
            // Normalize the phone before saving — only to columns that exist
            const savedPhone = formData.phone ? normalizePhone(formData.phone) : null;

            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    name: formData.name,
                    full_name: formData.name,
                    role: formData.role,
                    instrument: formData.instrument,
                    available_instruments: selectedInstruments,
                    active_church_id: formData.active_church_id || null,
                    phone: savedPhone || null,
                    whatsapp: savedPhone || null,
                })
                .eq('id', user.id);

            if (profileError) throw profileError;

            // Church membership
            if (formData.active_church_id && formData.role !== 'super_admin') {
                let churchRole = 'WORSHIPPER';
                if (formData.role === 'CHURCH_ADMIN') churchRole = 'CHURCH_ADMIN';
                if (formData.role === 'WORSHIP_LEADER') churchRole = 'WORSHIP_LEADER';

                const { data: existing } = await supabase
                    .from('church_user_memberships')
                    .select('id')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (existing) {
                    await supabase
                        .from('church_user_memberships')
                        .update({ church_id: formData.active_church_id, role: churchRole })
                        .eq('id', existing.id);
                } else {
                    await supabase
                        .from('church_user_memberships')
                        .insert({ user_id: user.id, church_id: formData.active_church_id, role: churchRole, status: 'active' });
                }
            }

            // Password
            if (newPassword.trim()) {
                const { error: passwordError } = await supabase.rpc('update_user_password_by_admin', {
                    target_user_id: user.id,
                    new_password: newPassword
                });
                if (passwordError) throw passwordError;
            }

            onUserUpdated();
            onClose();
        } catch (error) {
            console.error('Error updating user:', error);
            alert('Erro ao atualizar usuário: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async () => {
        setLoading(true);
        try {
            const { error } = await supabase.rpc('delete_user_with_transfer', {
                target_user_id: user.id,
                successor_id: null
            });
            if (error) throw error;
            onUserUpdated();
            onClose();
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Erro ao excluir usuário: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const sectionProps = { activeSection, setActiveSection };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full max-h-[92vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-700 shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <User size={18} className="text-purple-400" />
                            Editar Usuário
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[300px]">{user.email}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-700">
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">

                    {/* PROFILE SECTION */}
                    <SectionToggle id="profile" label="Dados do Perfil" icon={User} {...sectionProps}>

                        <InputField label="Nome Completo" icon={User}>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className={inputClass()}
                                placeholder="Nome do usuário"
                            />
                        </InputField>

                        <InputField label="E-mail (somente leitura)" icon={Mail}>
                            <input
                                type="email"
                                value={user.email}
                                disabled
                                className={`${inputClass()} text-slate-500 cursor-not-allowed border-slate-800`}
                            />
                        </InputField>

                        {/* WhatsApp / Phone */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                <MessageCircle size={13} className="text-emerald-400" />
                                WhatsApp / Telefone
                            </label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                    placeholder="(11) 90000-0000"
                                    className={`${inputClass()} ${phoneWarning ? 'border-amber-600 focus:ring-amber-500' : phoneIsValid ? 'border-emerald-700 focus:ring-emerald-500' : ''}`}
                                />
                            </div>
                            {/* Always-rendered feedback — no conditional mount/unmount = no layout shift = no focus loss */}
                            <div className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border transition-colors duration-150 ${
                                !formData.phone
                                    ? 'bg-transparent border-transparent text-slate-500'
                                    : phoneIsValid
                                        ? 'bg-emerald-900/20 border-emerald-800/60 text-emerald-400'
                                        : 'bg-amber-900/20 border-amber-800/60 text-amber-400'
                            }`}>
                                {!formData.phone ? (
                                    <><Info size={10} className="shrink-0" /><span className="italic">Sem WhatsApp → notificações de escala serão ignoradas</span></>
                                ) : phoneIsValid ? (
                                    <><Check size={12} className="shrink-0" /><span>WhatsApp: <strong className="font-mono">+{phoneNormalized}</strong></span></>
                                ) : (
                                    <><AlertCircle size={12} className="shrink-0" /><span>Número inválido — verifique DDD + 9 dígitos</span></>
                                )}
                            </div>
                        </div>

                        <InputField label="Igreja Vinculada" icon={Shield}>
                            <select
                                disabled={formData.role === 'super_admin'}
                                value={formData.active_church_id}
                                onChange={(e) => setFormData(prev => ({ ...prev, active_church_id: e.target.value }))}
                                className={`${inputClass()} appearance-none disabled:opacity-50`}
                            >
                                <option value="">Nenhuma / Usuário Individual</option>
                                {churches.map(church => (
                                    <option key={church.id} value={church.id}>{church.name}</option>
                                ))}
                            </select>
                        </InputField>

                        <InputField label="Cargo / Tipo de Usuário" icon={Shield}>
                            <select
                                value={formData.role}
                                onChange={(e) => {
                                    const role = e.target.value;
                                    setFormData(prev => ({
                                        ...prev,
                                        role,
                                        active_church_id: role === 'super_admin' ? '' : prev.active_church_id
                                    }));
                                }}
                                className={`${inputClass()} appearance-none`}
                            >
                                <option value="super_admin">Super Admin (Plataforma)</option>
                                <option value="CHURCH_ADMIN">Responsável da Igreja</option>
                                <option value="WORSHIP_LEADER">Líder de Adoração</option>
                                <option value="WORSHIPPER">Adorador</option>
                            </select>
                        </InputField>

                    </SectionToggle>

                    {/* INSTRUMENTS SECTION */}
                    <SectionToggle id="instruments" label="Instrumentos e Habilidades" icon={Music} {...sectionProps}>

                        <InputField label="Instrumento Principal" icon={Music}>
                            <select
                                value={formData.instrument}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData(prev => ({ ...prev, instrument: val }));
                                    if (val && !selectedInstruments.includes(val)) {
                                        setSelectedInstruments(prev => [...prev, val]);
                                    }
                                }}
                                className={`${inputClass()} appearance-none`}
                            >
                                <option value="">Selecione o instrumento principal...</option>
                                {instrumentsMetadata.map(inst => (
                                    <option key={inst.id} value={inst.name}>{inst.name}</option>
                                ))}
                            </select>
                        </InputField>

                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Instrumentos Disponíveis
                            </label>
                            <div className="flex flex-wrap gap-2 p-3 bg-slate-900/50 border border-slate-700 rounded-lg min-h-[56px]">
                                {instrumentsMetadata.length === 0 && (
                                    <span className="text-slate-500 text-xs italic">Nenhum instrumento cadastrado.</span>
                                )}
                                {instrumentsMetadata.map(inst => {
                                    const isMain = inst.name === formData.instrument;
                                    const isSelected = selectedInstruments.includes(inst.name) || isMain;
                                    return (
                                        <button
                                            key={inst.id}
                                            type="button"
                                            onClick={() => !isMain && toggleInstrument(inst.name)}
                                            disabled={isMain}
                                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all border ${
                                                isSelected
                                                    ? 'bg-purple-600 text-white border-purple-500'
                                                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                                            } ${isMain ? 'ring-2 ring-purple-400/50 border-purple-400 cursor-default' : ''}`}
                                        >
                                            {isSelected && <Check size={11} />}
                                            {inst.name}
                                            {isMain && <span className="ml-1 text-[8px] uppercase opacity-70">(Principal)</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                    </SectionToggle>

                    {/* SECURITY SECTION */}
                    <SectionToggle id="security" label="Segurança" icon={Lock} {...sectionProps}>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Nova Senha
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-9 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                                    placeholder="Deixe em branco para não alterar"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500 italic">
                                Mínimo 6 caracteres. Deixe em branco para não alterar.
                            </p>
                        </div>
                    </SectionToggle>

                </div>

                {/* Sticky Footer */}
                <div className="p-5 border-t border-slate-700 bg-slate-800 shrink-0 flex flex-col gap-2.5">
                    <button
                        onClick={handleUpdateUser}
                        disabled={loading}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20"
                    >
                        <Save size={17} />
                        {loading ? 'Salvando...' : 'Salvar Alterações'}
                    </button>

                    {!showDeleteConfirm ? (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="w-full bg-transparent hover:bg-red-600/10 text-red-400 py-2 px-4 rounded-lg font-medium transition flex items-center justify-center gap-2 border border-red-600/20 text-sm"
                        >
                            <Trash2 size={15} />
                            Excluir Usuário
                        </button>
                    ) : (
                        <div className="bg-red-900/20 p-4 rounded-xl border border-red-500/20 space-y-3">
                            <p className="text-xs text-red-300 text-center font-bold uppercase tracking-tight">
                                Confirmar exclusão permanente?
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-bold text-sm transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDeleteUser}
                                    disabled={loading}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-bold text-sm transition shadow-lg shadow-red-600/20 disabled:opacity-50"
                                >
                                    Sim, Excluir
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
