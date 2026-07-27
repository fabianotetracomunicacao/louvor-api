import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { 
    LayoutDashboard, Church, Package, Users, 
    Plus, Search, Edit3, Trash2, CheckCircle, 
    XCircle, Info, MoreVertical, ExternalLink, Shield, Loader, DollarSign, Mail, UserPlus, ArrowLeft, Wrench
} from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { AsaasService } from '../services/AsaasService';
import { SubscriptionManagerModal } from '../components/SubscriptionManagerModal';
import { getAppSetting, setAppSetting } from '../utils/storage';

export function SuperAdminChurchesPage() {
    const { isSuperAdmin } = useAuth();
    const { showToast, confirmAction } = useNotification();
    const [loading, setLoading] = useState(true);
    const [churches, setChurches] = useState([]);
    const [plans, setPlans] = useState([]);
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [isAddingChurch, setIsAddingChurch] = useState(false);
    const [isEditingChurch, setIsEditingChurch] = useState(false);
    const [editingChurch, setEditingChurch] = useState(null);
    const [isViewMembersModalOpen, setIsViewMembersModalOpen] = useState(false);
    const [selectedChurchMembers, setSelectedChurchMembers] = useState([]);
    const [selectedChurchName, setSelectedChurchName] = useState('');
    const [selectedChurchDetails, setSelectedChurchDetails] = useState(null);
    const [updatingChurchId, setUpdatingChurchId] = useState(null);
    const [addUserState, setAddUserState] = useState(null); 
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [newUserPhone, setNewUserPhone] = useState('');
    const [addUserLoading, setAddUserLoading] = useState(false);
    const [createdCredentials, setCreatedCredentials] = useState(null);
    const [states, setStates] = useState([]);
    const [cities, setCities] = useState([]);
    const [loadingCities, setLoadingCities] = useState(false);
    const [saveLoading, setSaveLoading] = useState(false);
    
    // Subscription State
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const [subscriptionTarget, setSubscriptionTarget] = useState(null);
    
    // Form State
    const [formChurch, setFormChurch] = useState({
        name: '',
        plan_id: '',
        status: 'active',
        trade_name: '',
        cnpj: '',
        city: '',
        state: ''
    });

    useEffect(() => {
        loadData();
        loadStates();
    }, []);

    const loadStates = async () => {
        try {
            const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
            const data = await response.json();
            setStates(data);
        } catch (err) {
            console.error('Erro ao carregar estados:', err);
        }
    };

    const loadCities = async (uf) => {
        if (!uf) {
            setCities([]);
            return;
        }
        setLoadingCities(true);
        try {
            const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
            const data = await response.json();
            setCities(data);
        } catch (err) {
            console.error('Erro ao carregar cidades:', err);
        } finally {
            setLoadingCities(false);
        }
    };

    const handleAddUserSubmit = async (e) => {
        e.preventDefault();
        setAddUserLoading(true);
        
        try {
            const passwordToUse = addUserState.mode === 'invite' 
                ? (Math.random().toString(36).slice(-10) + 'Aa1!') 
                : newUserPassword;

            const tempSupabase = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
            );

            const { data: authData, error: authError } = await tempSupabase.auth.signUp({
                email: newUserEmail,
                password: passwordToUse,
                options: {
                    emailRedirectTo: addUserState.mode === 'invite' 
                        ? `${window.location.origin}/completar-cadastro`
                        : undefined,
                    data: {
                        full_name: newUserName,
                        phone_number: newUserPhone,
                        role: addUserState.role,
                        is_invite: addUserState.mode === 'invite'
                    }
                }
            });

            if (authError) throw authError;

            if (authData.user) {
                await new Promise(r => setTimeout(r, 1000)); // wait for handles

                await supabase.from('profiles').update({ 
                    role: addUserState.role, 
                    active_church_id: selectedChurchDetails.id 
                }).eq('id', authData.user.id);

                await supabase.from('church_user_memberships').insert({
                    church_id: selectedChurchDetails.id,
                    user_id: authData.user.id,
                    role: addUserState.role,
                    status: addUserState.mode === 'invite' ? 'pending' : 'active'
                });
            }

            if (addUserState.mode === 'invite') {
                showToast('Convite pendente! O usuário precisa confirmar a conta com o e-mail recebido.', 'success');
                setAddUserState(null);
                setNewUserEmail('');
                setNewUserName('');
                setNewUserPassword('');
                setNewUserPhone('');
            } else {
                setCreatedCredentials({ email: newUserEmail, password: passwordToUse });
                // We keep the state partially uncleared until they copy and close
            }
            
            // Force local refresh of members
            const { data: membersObj } = await supabase
                .from('church_user_memberships')
                .select('id, status, role, profiles!church_user_memberships_user_id_fkey(name,email)')
                .eq('church_id', selectedChurchDetails.id);
                
            if(membersObj) {
                setSelectedChurchMembers(membersObj);
            }
            loadData();

        } catch (err) {
            console.error(err);
            showToast(`Erro: ${err.message}`, 'error');
        } finally {
            setAddUserLoading(false);
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const [churchRes, planRes] = await Promise.all([
                supabase.from('churches')
                    .select('*, plan:plans(*), memberships:church_user_memberships(id, status, role, profiles!church_user_memberships_user_id_fkey(name, email))')
                    .order('created_at', { ascending: false }),
                supabase.from('plans').select('*').eq('active', true).eq('type', 'church')
            ]);

            if (churchRes.error) throw churchRes.error;
            if (planRes.error) throw planRes.error;

            setChurches(churchRes.data);
            setPlans(planRes.data);

            const maintSetting = await getAppSetting('maintenance_mode');
            setIsMaintenanceMode(maintSetting === 'true' || maintSetting === true);

            if (planRes.data.length > 0 && !isEditingChurch) {
                setFormChurch(prev => ({ ...prev, plan_id: planRes.data[0].id }));
            }
        } catch (err) {
            console.error(err);
            showToast('Erro ao carregar dados.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAdd = () => {
        setEditingChurch(null);
        setFormChurch({
            name: '',
            plan_id: plans[0]?.id || '',
            status: 'active',
            trade_name: '',
            cnpj: '',
            city: '',
            state: ''
        });
        setIsAddingChurch(true);
    };

    const handleOpenEdit = (church) => {
        setEditingChurch(church);
        setFormChurch({
            name: church.name,
            plan_id: church.plan_id || '',
            status: church.status,
            trade_name: church.trade_name || '',
            cnpj: church.cnpj || '',
            city: church.city || '',
            state: church.state || ''
        });
        if (church.state) {
            loadCities(church.state);
        }
        setIsEditingChurch(true);
    };

    const handleSubmitChurch = async (e) => {
        e.preventDefault();
        setSaveLoading(true);
        
        // Sanitize data: only send columns that exist in the database
        const payload = {
            name: formChurch.name,
            trade_name: formChurch.trade_name || null,
            cnpj: formChurch.cnpj || null,
            city: formChurch.city || null,
            state: formChurch.state || null,
            plan_id: formChurch.plan_id || null,
            status: formChurch.status
        };

        console.log('Enviando payload para Supabase:', payload);

        try {
            if (editingChurch) {
                const { error, status, statusText } = await supabase
                    .from('churches')
                    .update(payload)
                    .eq('id', editingChurch.id);
                
                if (error) {
                    console.error('Erro de Update Supabase:', { error, status, statusText });
                    throw error;
                }
                showToast('Igreja atualizada!', 'success');
            } else {
                const { data: newChurch, error, status, statusText } = await supabase
                    .from('churches')
                    .insert(payload)
                    .select()
                    .single();
                
                if (error) {
                    console.error('Erro de Insert Supabase:', { error, status, statusText });
                    throw error;
                }

                showToast('Igreja cadastrada no banco. Processando checkout...', 'info');

                // Generate Asaas Subscription
                try {
                    const checkoutRes = await AsaasService.createSubscription(
                        formChurch.plan_id,
                        'church',
                        newChurch.id,
                        {
                            name: formChurch.name,
                            cpfCnpj: formChurch.cnpj
                        }
                    );
                    
                    if (checkoutRes.invoiceUrl) {
                        showToast('Assinatura gerada no Asaas com sucesso!', 'success');
                        // Optional: could open it or show to super admin
                        console.log('Invoice URL:', checkoutRes.invoiceUrl);
                        // We will add a way to view this URL in the UI later, for now we log it.
                    }
                } catch (checkoutError) {
                    console.error('Erro ao gerar assinatura:', checkoutError);
                    showToast('Igreja criada, mas falha ao gerar cobrança no Asaas.', 'warning');
                }
            }

            setIsAddingChurch(false);
            setIsEditingChurch(false);
            loadData();
        } catch (err) {
            console.error('Erro completo na submissão:', err);
            showToast(`Erro: ${err.message || 'Falha na comunicação com o banco'}`, 'error');
        } finally {
            setSaveLoading(false);
        }
    };

    const handleToggleMaintenance = async () => {
        const newValue = !isMaintenanceMode;
        if(window.confirm(`Tem certeza que deseja ${newValue ? 'ATIVAR' : 'DESATIVAR'} o modo de manutenção global para todos os usuários?`)) {
            try {
                await setAppSetting('maintenance_mode', newValue ? 'true' : 'false', 'Ativa ou desativa o modo de manutenção global do site.');
                setIsMaintenanceMode(newValue);
                showToast(`Modo de manutenção ${newValue ? 'ATIVADO' : 'DESATIVADO'}!`, newValue ? 'warning' : 'success');
            } catch (error) {
                showToast('Erro ao alterar modo de manutenção.', 'error');
            }
        }
    };

    const handleToggleStatus = async (church) => {
        const newStatus = church.status === 'active' ? 'suspended' : 'active';
        const { error } = await supabase
            .from('churches')
            .update({ status: newStatus })
            .eq('id', church.id);

        if (error) {
            showToast('Erro ao atualizar status.', 'error');
        } else {
            setChurches(churches.map(c => c.id === church.id ? { ...c, status: newStatus } : c));
            showToast(`Igreja ${newStatus === 'active' ? 'ativada' : 'suspensa'}.`);
        }
    };

    if (!isSuperAdmin) return (
        <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center space-y-4">
                <Shield size={48} className="mx-auto text-slate-200" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Acesso Restrito</h2>
                <p className="text-slate-500">Apenas administradores globais podem acessar esta página.</p>
            </div>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <Church className="text-purple-600" /> Gestão de Igrejas
                    </h1>
                    <p className="text-slate-500">Administração global da plataforma</p>
                </div>
                <div className="flex gap-4">
                    <button 
                        onClick={handleToggleMaintenance}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition shadow-sm border ${
                            isMaintenanceMode 
                            ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-400' 
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                        }`}
                        title="Modo de Manutenção"
                    >
                        <Wrench size={20} className={isMaintenanceMode ? "text-amber-600 dark:text-amber-500" : "text-slate-400"} />
                        {isMaintenanceMode ? 'Manutenção ATIVA' : 'Manutenção'}
                    </button>
                    <Link 
                        to="/admin/plans"
                        className="flex items-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-6 py-3 rounded-2xl font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition shadow-sm"
                    >
                        <Package size={20} className="text-purple-600" />
                        Gestão de Planos
                    </Link>
                    <button 
                        onClick={handleOpenAdd}
                        className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-purple-700 transition shadow-lg shadow-purple-600/20"
                    >
                        <Plus size={20} />
                        Nova Igreja
                    </button>
                </div>
            </div>

            {/* Plans Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans.map(plan => (
                    <div key={plan.id} className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                            <Package size={64} />
                        </div>
                        <h3 className="font-black text-slate-800 dark:text-white text-lg">{plan.name}</h3>
                        <p className="text-sm text-slate-500 mb-4">{plan.description}</p>
                        <div className="flex gap-4 text-xs font-bold uppercase tracking-widest text-purple-600">
                            <span>{plan.leader_limit} Líderes</span>
                            <span>{plan.worshiper_limit} Adoradores</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Churches List */}
            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-white/5 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase font-black tracking-widest text-slate-400">
                        <tr>
                            <th className="p-6">Igreja</th>
                            <th className="p-6">Plano</th>
                            <th className="p-6">Capacidade / Uso</th>
                            <th className="p-6">Status</th>
                            <th className="p-6 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                        {churches.map(church => (
                            <tr key={church.id} className="group hover:bg-slate-50 dark:hover:bg-white/[0.01] transition">
                                <td className="p-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center font-black">
                                            {church.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-white">{church.name}</p>
                                            <p className="text-xs text-slate-400">Criada em {new Date(church.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-6 text-sm font-bold text-slate-600 dark:text-slate-300">
                                    {church.plan?.name || '--'}
                                </td>
                                <td className="p-6">
                                    <div className="space-y-1">
                                        {(() => {
                                            const members = church.memberships || [];
                                            const leadersCount = members.filter(m => m.role === 'CHURCH_ADMIN' || m.role === 'WORSHIP_LEADER').length;
                                            const worshipersCount = members.filter(m => m.role === 'WORSHIPPER').length;
                                            const leaderLimit = church.plan?.leader_limit || 0;
                                            const worshiperLimit = church.plan?.worshiper_limit || 0;

                                            return (
                                                <>
                                                    <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-400">
                                                        <span>Líderes</span>
                                                        <span className={leadersCount >= leaderLimit ? 'text-rose-500' : 'text-purple-600'}>
                                                            {leadersCount} / {leaderLimit}
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full transition-all duration-500 ${leadersCount >= leaderLimit ? 'bg-rose-500' : 'bg-purple-600'}`}
                                                            style={{ width: `${Math.min((leadersCount / leaderLimit) * 100, 100)}%` }}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-400 mt-2">
                                                        <span>Adoradores</span>
                                                        <span className={worshipersCount >= worshiperLimit ? 'text-rose-500' : 'text-purple-600'}>
                                                            {worshipersCount} / {worshiperLimit}
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full transition-all duration-500 ${worshipersCount >= worshiperLimit ? 'bg-rose-500' : 'bg-purple-600'}`}
                                                            style={{ width: `${Math.min((worshipersCount / worshiperLimit) * 100, 100)}%` }}
                                                        />
                                                    </div>
                                                    <button 
                                                        onClick={() => {
                                                            setSelectedChurchMembers(members);
                                                            setSelectedChurchName(church.name);
                                                            setSelectedChurchDetails(church);
                                                            setIsViewMembersModalOpen(true);
                                                        }}
                                                        className="text-[9px] font-bold text-purple-600 hover:underline mt-1 flex items-center gap-1 w-max"
                                                    >
                                                        <Users size={10} /> {members.length > 0 ? `Gerenciar ${members.length} usuários` : 'Adicionar usuários'}
                                                    </button>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </td>
                                <td className="p-6">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                                        church.status === 'active' 
                                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' 
                                            : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                    }`}>
                                        {church.status === 'active' ? 'Ativo' : 'Suspenso'}
                                    </span>
                                </td>
                                <td className="p-6 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                                        <button 
                                            onClick={() => handleToggleStatus(church)}
                                            className={`p-2 rounded-xl transition ${church.status === 'active' ? 'text-rose-500 hover:bg-rose-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                                            title={church.status === 'active' ? 'Suspender' : 'Ativar'}
                                        >
                                            {church.status === 'active' ? <XCircle size={18} /> : <CheckCircle size={18} />}
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setSubscriptionTarget({ id: church.id, name: church.name });
                                                setIsManagingSubscription(true);
                                            }}
                                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition"
                                            title="Gerenciar Assinatura"
                                        >
                                            <DollarSign size={18} />
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setSelectedChurchMembers(church.memberships || []);
                                                setSelectedChurchName(church.name);
                                                setSelectedChurchDetails(church);
                                                setIsViewMembersModalOpen(true);
                                            }}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition"
                                            title="Gerenciar Usuários"
                                        >
                                            <Users size={18} />
                                        </button>
                                        <button 
                                            onClick={() => handleOpenEdit(church)}
                                            className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition"
                                        >
                                            <Edit3 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Church Modal */}
            {(isAddingChurch || isEditingChurch) && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl border border-white/10 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-6">
                            {isEditingChurch ? 'Editar Igreja' : 'Nova Igreja Contratante'}
                        </h3>
                        <form onSubmit={handleSubmitChurch} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Razão Social</label>
                                    <input 
                                        required
                                        type="text" 
                                        value={formChurch.name}
                                        onChange={e => setFormChurch({ ...formChurch, name: e.target.value })}
                                        className="w-full bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                        placeholder="Nome oficial"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nome Fantasia (Opcional)</label>
                                    <input 
                                        type="text" 
                                        value={formChurch.trade_name}
                                        onChange={e => setFormChurch({ ...formChurch, trade_name: e.target.value })}
                                        className="w-full bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">CNPJ / Identificador</label>
                                    <input 
                                        type="text" 
                                        value={formChurch.cnpj}
                                        onChange={e => setFormChurch({ ...formChurch, cnpj: e.target.value })}
                                        className="w-full bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Plano Contratado</label>
                                    <select 
                                        value={formChurch.plan_id}
                                        onChange={e => setFormChurch({ ...formChurch, plan_id: e.target.value })}
                                        className="w-full bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold appearance-none"
                                    >
                                        {plans.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} ({p.leader_limit}L / {p.worshiper_limit}A)</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Estado (UF)</label>
                                    <select 
                                        required
                                        value={formChurch.state}
                                        onChange={e => {
                                            const uf = e.target.value;
                                            setFormChurch({ ...formChurch, state: uf, city: '' });
                                            loadCities(uf);
                                        }}
                                        className="w-full bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                    >
                                        <option value="">Selecione o Estado</option>
                                        {states.map(s => (
                                            <option key={s.id} value={s.sigla}>{s.nome} ({s.sigla})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Cidade</label>
                                    <select 
                                        required
                                        disabled={!formChurch.state || loadingCities}
                                        value={formChurch.city}
                                        onChange={e => setFormChurch({ ...formChurch, city: e.target.value })}
                                        className="w-full bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold disabled:opacity-50"
                                    >
                                        <option value="">{loadingCities ? 'Carregando...' : 'Selecione a Cidade'}</option>
                                        {cities.map(c => (
                                            <option key={c.id} value={c.nome}>{c.nome}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Status</label>
                                    <select 
                                        value={formChurch.status}
                                        onChange={e => setFormChurch({ ...formChurch, status: e.target.value })}
                                        className="w-full bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                    >
                                        <option value="active">Ativo</option>
                                        <option value="suspended">Suspenso</option>
                                        <option value="canceled">Cancelado</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-4 pt-6">
                                <button type="button" onClick={() => { setIsAddingChurch(false); setIsEditingChurch(false); }} className="flex-1 py-4 text-slate-500 font-bold">Cancelar</button>
                                <button 
                                    type="submit" 
                                    disabled={saveLoading}
                                    className="flex-1 bg-purple-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-purple-600/20 flex items-center justify-center gap-2 disabled:opacity-70"
                                >
                                    {saveLoading ? (
                                        <>
                                            <Loader size={20} className="animate-spin" />
                                            <span>Processando...</span>
                                        </>
                                    ) : (
                                        isEditingChurch ? 'Salvar Alterações' : 'Cadastrar'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Members Modal */}
            {isViewMembersModalOpen && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl border border-white/10 animate-in zoom-in-95 max-h-[85vh] flex flex-col">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white">Usuários da Igreja</h3>
                                <p className="text-sm text-slate-500">{selectedChurchName}</p>
                            </div>
                            <button 
                                onClick={() => {
                                    setIsViewMembersModalOpen(false);
                                    setAddUserState(null);
                                    setNewUserEmail('');
                                    setNewUserName('');
                                    setNewUserPassword('');
                                }}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                            >
                                <XCircle size={24} className="text-slate-400" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto pr-2 space-y-6 min-h-[50vh]">
                            {createdCredentials ? (
                                <div className="animate-in zoom-in-95 duration-300 space-y-6 text-center py-8">
                                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle size={32} />
                                    </div>
                                    <h4 className="text-2xl font-black text-slate-800 dark:text-white">Usuário Criado!</h4>
                                    <p className="text-sm text-slate-500 max-w-sm mx-auto">Copie os dados de acesso temporários abaixo e envie para a pessoa. Por segurança, ela poderá redefinir depois.</p>
                                    
                                    <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 max-w-sm mx-auto text-left space-y-4 border border-slate-100 dark:border-white/5">
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-slate-400 mb-1">E-mail de Acesso</p>
                                            <p className="font-bold text-slate-900 dark:text-white">{createdCredentials.email}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Senha Fixa Gerada</p>
                                            <p className="font-mono text-lg font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 p-2 rounded-lg text-center border border-slate-200 dark:border-slate-700">{createdCredentials.password}</p>
                                        </div>
                                        
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(`Olá! Seu acesso ao LouvorPlay foi criado.\n\nE-mail: ${createdCredentials.email}\nSenha: ${createdCredentials.password}\n\nAcesse pelo link: https://louvorplay.com.br`);
                                                showToast('Dados copiados para a área de transferência!', 'success');
                                            }}
                                            className="w-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2"
                                        >
                                            Copiar Dados de Acesso
                                        </button>
                                        
                                        <a 
                                            href={`https://wa.me/?text=${encodeURIComponent(`Olá! Seu acesso ao LouvorPlay foi criado.\n\nE-mail: ${createdCredentials.email}\nSenha: ${createdCredentials.password}\n\nAcesse: https://louvorplay.com.br`)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2"
                                        >
                                            Enviar por WhatsApp
                                        </a>
                                    </div>
                                    
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setCreatedCredentials(null);
                                            setAddUserState(null);
                                            setNewUserEmail('');
                                            setNewUserName('');
                                            setNewUserPassword('');
                                            setNewUserPhone('');
                                        }}
                                        className="text-slate-500 font-bold hover:text-slate-700 dark:hover:text-slate-300 transition mt-4"
                                    >
                                        Voltar aos Usuários
                                    </button>
                                </div>
                            ) : addUserState ? (
                                <div className="animate-in slide-in-from-right-4 duration-300">
                                    <button 
                                        onClick={() => {
                                            if (addUserState.mode === 'choice') setAddUserState(null);
                                            else setAddUserState({ ...addUserState, mode: 'choice' });
                                        }}
                                        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition mb-6"
                                    >
                                        <ArrowLeft size={16} /> Voltar
                                    </button>
                                    
                                    {addUserState.mode === 'choice' && (
                                        <div className="space-y-4">
                                            <h4 className="text-xl font-black text-slate-800 dark:text-white mb-2">Adicionar {addUserState.role === 'WORSHIP_LEADER' ? 'Líder' : 'Adorador'}</h4>
                                            <p className="text-sm text-slate-500 mb-6">Escolha como deseja adicionar esta pessoa à igreja:</p>
                                            
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <button 
                                                    onClick={() => setAddUserState({ ...addUserState, mode: 'invite' })}
                                                    className="flex flex-col items-center justify-center gap-4 p-8 rounded-3xl border-2 border-slate-100 dark:border-slate-800 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition group text-left"
                                                >
                                                    <div className="w-16 h-16 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                        <Mail size={32} />
                                                    </div>
                                                    <div className="text-center">
                                                        <h5 className="font-bold text-slate-900 dark:text-white text-lg">Enviar Convite</h5>
                                                        <p className="text-xs text-slate-500 mt-2">Dispara um e-mail de registro rápido e a pessoa redefine sua senha para acessar.</p>
                                                    </div>
                                                </button>
                                                
                                                <button 
                                                    onClick={() => setAddUserState({ ...addUserState, mode: 'manual' })}
                                                    className="flex flex-col items-center justify-center gap-4 p-8 rounded-3xl border-2 border-slate-100 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition group text-left"
                                                >
                                                    <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                        <UserPlus size={32} />
                                                    </div>
                                                    <div className="text-center">
                                                        <h5 className="font-bold text-slate-900 dark:text-white text-lg">Cadastro Manual</h5>
                                                        <p className="text-xs text-slate-500 mt-2">Você preenche os dados e cria a senha fixa inicial desta pessoa agora.</p>
                                                    </div>
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {(addUserState.mode === 'invite' || addUserState.mode === 'manual') && (
                                        <form onSubmit={handleAddUserSubmit} className="space-y-6">
                                            <h4 className="text-xl font-black text-slate-800 dark:text-white mb-2">
                                                {addUserState.mode === 'invite' ? 'Enviar Convite (Via E-mail)' : 'Cadastro Manual Completo'}
                                            </h4>
                                            
                                            <div className="space-y-4">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nome Completo</label>
                                                    <input 
                                                        required
                                                        type="text" 
                                                        value={newUserName}
                                                        onChange={e => setNewUserName(e.target.value)}
                                                        className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                                        placeholder="João da Silva"
                                                    />
                                                </div>
                                                
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-black uppercase text-slate-400 ml-2">E-mail</label>
                                                    <input 
                                                        required
                                                        type="email" 
                                                        value={newUserEmail}
                                                        onChange={e => setNewUserEmail(e.target.value)}
                                                        className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                                        placeholder="joao@gmail.com"
                                                    />
                                                </div>

                                                {addUserState.mode === 'manual' && (
                                                    <>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Senha Inicial</label>
                                                            <input 
                                                                required
                                                                type="password" 
                                                                value={newUserPassword}
                                                                onChange={e => setNewUserPassword(e.target.value)}
                                                                className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                                                placeholder="Mínimo 6 caracteres"
                                                                minLength={6}
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Telefone (Opcional)</label>
                                                            <input 
                                                                type="tel" 
                                                                value={newUserPhone}
                                                                onChange={e => setNewUserPhone(e.target.value)}
                                                                className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                                                                placeholder="(00) 00000-0000"
                                                            />
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            <button 
                                                type="submit" 
                                                disabled={addUserLoading}
                                                className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-purple-600/20 flex items-center justify-center gap-2 disabled:opacity-70 mt-6"
                                            >
                                                {addUserLoading ? (
                                                    <><Loader size={20} className="animate-spin" /> Processando...</>
                                                ) : (
                                                    addUserState.mode === 'invite' ? 'Disparar E-mail' : 'Cadastrar e Concluir'
                                                )}
                                            </button>
                                        </form>
                                    )}
                                </div>
                            ) : (() => {
                                const leaders = selectedChurchMembers.filter(m => m.role === 'CHURCH_ADMIN' || m.role === 'WORSHIP_LEADER');
                                const worshipers = selectedChurchMembers.filter(m => m.role === 'WORSHIPPER');
                                const leaderLimit = selectedChurchDetails?.plan?.leader_limit || 0;
                                const worshiperLimit = selectedChurchDetails?.plan?.worshiper_limit || 0;
                                
                                const renderSlots = (membersList, limit, typeLabel) => {
                                    const slots = [];
                                    for (let i = 0; i < limit; i++) {
                                        const m = membersList[i];
                                        if (m) {
                                            slots.push(
                                                <div key={`filled-${i}`} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-white/5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center font-bold">
                                                            {(m.profiles?.name || 'U').charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-900 dark:text-white text-sm">{m.profiles?.name || 'Não informado'}</p>
                                                            <p className="text-xs text-slate-500">{m.profiles?.email}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex items-center gap-2">
                                                        {m.status === 'pending' && (
                                                            <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase bg-orange-100 text-orange-600 dark:bg-orange-900/30">
                                                                Pendente
                                                            </span>
                                                        )}
                                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                                                            m.role === 'CHURCH_ADMIN' ? 'bg-amber-100 text-amber-600' :
                                                            m.role === 'WORSHIP_LEADER' ? 'bg-blue-100 text-blue-600' :
                                                            'bg-slate-100 text-slate-600'
                                                        }`}>
                                                            {m.role === 'CHURCH_ADMIN' ? 'Responsável' :
                                                             m.role === 'WORSHIP_LEADER' ? 'Líder' : 'Adorador'}
                                                        </span>
                                                        
                                                        <button 
                                                            onClick={async () => {
                                                                if(window.confirm('Tem certeza que deseja remover este usuário da igreja?')) {
                                                                    try {
                                                                        const { error } = await supabase.from('church_user_memberships').delete().eq('id', m.id);
                                                                        if (error) throw error;
                                                                        
                                                                        showToast('Membro removido!', 'success');
                                                                        
                                                                        // Force local refresh without closing modal
                                                                        const { data: membersObj } = await supabase
                                                                            .from('church_user_memberships')
                                                                            .select('id, status, role, profiles!church_user_memberships_user_id_fkey(name,email)')
                                                                            .eq('church_id', selectedChurchDetails.id);
                                                                            
                                                                        if(membersObj) {
                                                                            setSelectedChurchMembers(membersObj);
                                                                        }
                                                                        loadData(); // refresh background table
                                                                    } catch (err) {
                                                                        console.error(err);
                                                                        showToast('Erro ao remover membro', 'error');
                                                                    }
                                                                }
                                                            }}
                                                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition ml-2"
                                                            title="Remover da Igreja"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        } else {
                                            slots.push(
                                                <div key={`empty-${i}`} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                                                    <div className="flex items-center gap-3 opacity-50">
                                                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center font-bold">
                                                            ?
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-500 dark:text-slate-400 text-sm">Vaga Livre</p>
                                                            <p className="text-xs text-slate-400">Pode adicionar um {typeLabel}</p>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={() => setAddUserState({ mode: 'choice', role: typeLabel === 'Líder' ? 'WORSHIP_LEADER' : 'WORSHIPPER' })}
                                                        className="text-[10px] font-black uppercase bg-purple-100 text-purple-600 px-3 py-1.5 rounded-lg hover:bg-purple-200 transition"
                                                    >
                                                        + Adicionar
                                                    </button>
                                                </div>
                                            );
                                        }
                                    }
                                    return slots;
                                };

                                return (
                                    <>
                                        <div>
                                            <h4 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-3 flex items-center justify-between">
                                                <span>Vagas de Líderes</span>
                                                <span className={leaders.length >= leaderLimit ? 'text-rose-500' : 'text-purple-500'}>{leaders.length} / {leaderLimit} Ocupadas</span>
                                            </h4>
                                            <div className="grid grid-cols-1 gap-3">
                                                {renderSlots(leaders, leaderLimit, 'Líder')}
                                            </div>
                                        </div>
                                        
                                        <div>
                                            <h4 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-3 flex items-center justify-between">
                                                <span>Vagas de Adoradores</span>
                                                <span className={worshipers.length >= worshiperLimit ? 'text-rose-500' : 'text-purple-500'}>{worshipers.length} / {worshiperLimit} Ocupadas</span>
                                            </h4>
                                            <div className="grid grid-cols-1 gap-3">
                                                {renderSlots(worshipers, worshiperLimit, 'Adorador')}
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Subscription Manager Modal */}
            <SubscriptionManagerModal
                isOpen={isManagingSubscription}
                onClose={(changed) => {
                    setIsManagingSubscription(false);
                    setSubscriptionTarget(null);
                    if (changed) loadData();
                }}
                targetId={subscriptionTarget?.id}
                targetName={subscriptionTarget?.name}
                type="church"
            />
        </div>
    );
}
