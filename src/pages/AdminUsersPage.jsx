import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import { Trash2, Shield, User, Loader, AlertTriangle, UserPlus, Check, X, Settings, Eye, EyeOff, BarChart3, DollarSign, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import { UserEditModal } from '../components/UserEditModal';
import { SubscriptionManagerModal } from '../components/SubscriptionManagerModal';
import UserActivityModal from '../components/UserActivityModal';
import { getInstruments } from '../utils/storage';

function ButtonLink({ to, icon, label }) {
    return (
        <Link
            to={to}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 transition"
        >
            {icon}
            {label}
        </Link>
    );
}

export function AdminUsersPage() {
    const { isAdmin, user: currentUser } = useAuth();
    const { showToast, confirmAction } = useNotification();
    const [users, setUsers] = useState([]);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const usersPerPage = 20;

    // Add User State
    const [isAdding, setIsAdding] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [newUserPhone, setNewUserPhone] = useState('');
    const [newUserInstrument, setNewUserInstrument] = useState('');
    const [newUserRole, setNewUserRole] = useState('WORSHIPPER');
    const [newUserChurchId, setNewUserChurchId] = useState('');
    const [churches, setChurches] = useState([]);
    const [addLoading, setAddLoading] = useState(false);

    const [showPassword, setShowPassword] = useState(false);
    const [instrumentsMetadata, setInstrumentsMetadata] = useState([]);
    const [newUserAvailableInstruments, setNewUserAvailableInstruments] = useState([]);

    // Delete & Transfer State
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null); // { id, email, name, songCount }
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Edit User State
    const [isEditingUser, setIsEditingUser] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [updatingUserId, setUpdatingUserId] = useState(null);

    // Subscription State
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const [subscriptionTarget, setSubscriptionTarget] = useState(null);

    // Activity Report State
    const [isViewingReport, setIsViewingReport] = useState(false);
    const [reportTarget, setReportTarget] = useState(null);

    useEffect(() => {
        if (isAdmin) {
            fetchPlans();
            fetchUsers();
            loadMetadata();
            fetchChurches();
        }
    }, [isAdmin]);

    const fetchPlans = async () => {
        const { data, error } = await supabase
            .from('plans')
            .select('*')
            .eq('type', 'individual')
            .eq('active', true)
            .order('price', { ascending: true });
        if (!error && data) {
            setPlans(data);
        }
    };

    const fetchChurches = async () => {
        const { data, error } = await supabase.from('churches').select('id, name').eq('status', 'active');
        if (!error && data) {
            setChurches(data);
            if (data.length > 0) setNewUserChurchId(data[0].id);
        }
    };

    const loadMetadata = async () => {
        const metadata = await getInstruments();
        setInstrumentsMetadata(metadata);
    };

    const toggleNewUserInstrument = (name) => {
        if (newUserAvailableInstruments.includes(name)) {
            setNewUserAvailableInstruments(newUserAvailableInstruments.filter(i => i !== name));
        } else {
            setNewUserAvailableInstruments([...newUserAvailableInstruments, name]);
        }
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            // Note: We can only list PROFILES. We cannot list auth.users without service role key or RPC.
            // Assumption: profiles table contains all relevant users.
            const { data, error } = await supabase
                .from('profiles')
                .select(`
                    *,
                    memberships:church_user_memberships!church_user_memberships_user_id_fkey(churches(name)),
                    subs:subscriptions!user_id(status, plans(name, type))
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Sort by Role Priority
            const rolePriority = { 'super_admin': 4, 'CHURCH_ADMIN': 3, 'WORSHIP_LEADER': 2, 'WORSHIPPER': 1 };

            const sortedData = data.sort((a, b) => {
                const priorityA = rolePriority[a.role] || 0;
                const priorityB = rolePriority[b.role] || 0;

                if (priorityA !== priorityB) {
                    return priorityB - priorityA; // Higher priority first
                }
                // Tie-breaker: Name/Email alphabetical
                return (a.email || '').localeCompare(b.email || '');
            });

            setUsers(sortedData);
        } catch (err) {
            console.error(err);
            setError('Erro ao carregar usuários.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        setAddLoading(true);
        setError('');

        try {
            // USAR UM CLIENTE TEMPORÁRIO PARA NÃO DESLOGAR O ADMIN
            // Criando nova instância usando a função importada
            const tempSupabase = createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: false, // Importante: Não salvar sessão no LocalStorage
                        autoRefreshToken: false,
                        detectSessionInUrl: false
                    }
                }
            );

            // 1. Criar Usuário (Dispara Email de Confirmação automaticamente)
            const { data: authData, error: authError } = await tempSupabase.auth.signUp({
                email: newUserEmail,
                password: newUserPassword,
                options: {
                    emailRedirectTo: 'http://localhost:5173',
                    data: {
                        full_name: newUserName,
                        phone_number: newUserPhone,
                        instrument: newUserInstrument,
                        role: newUserRole // Pass role here too for triggers that might use it
                    }
                }
            });

            if (authError) throw authError;

            // 2. Definir Cargo e Vínculo com Igreja (Update Profile & Membership)
            if (authData.user) {
                // Aguardar um pouco para garantir que o trigger handle_new_user rodou
                await new Promise(r => setTimeout(r, 1000));

                const profileUpdates = {
                    role: newUserRole,
                    instrument: newUserInstrument,
                    available_instruments: newUserAvailableInstruments
                };

                // Se houver igreja selecionada, define como ativa no perfil
                if (newUserChurchId && newUserRole !== 'super_admin') {
                    profileUpdates.active_church_id = newUserChurchId;
                }

                const { error: profileError } = await supabase
                    .from('profiles')
                    .update(profileUpdates)
                    .eq('id', authData.user.id);

                if (profileError) {
                    console.warn('Erro ao definir perfil inicial:', profileError);
                }

                // 3. Criar Vínculo na Tabela de Memberships (SaaS multi-tenant)
                if (newUserChurchId && newUserRole !== 'super_admin') {
                    // Mapear o role do profiles para o role da igreja
                    let churchRole = 'WORSHIPPER';
                    if (newUserRole === 'CHURCH_ADMIN') churchRole = 'CHURCH_ADMIN';
                    if (newUserRole === 'WORSHIP_LEADER') churchRole = 'WORSHIP_LEADER';

                    const { error: membershipError } = await supabase
                        .from('church_user_memberships')
                        .insert({
                            church_id: newUserChurchId,
                            user_id: authData.user.id,
                            role: churchRole,
                            status: 'active'
                        });

                    if (membershipError) {
                        console.error('Erro ao vincular usuário à igreja:', membershipError);
                    }
                }
            }

            showToast('Usuário criado com sucesso! O email de confirmação foi enviado.', 'success');
            setIsAdding(false);
            setNewUserEmail('');
            setNewUserPassword('');
            setNewUserName('');
            setNewUserPhone('');
            setNewUserInstrument('');
            setNewUserChurchId(churches[0]?.id || '');
            setNewUserAvailableInstruments([]);
            setTimeout(fetchUsers, 1500);
        } catch (err) {
            console.error(err);
            showToast(`Erro ao criar usuário: ${err.message}`, 'error');
        } finally {
            setAddLoading(false);
        }
    };

    const handleUpdateRole = async (userId, newRole) => {
        setUpdatingUserId(userId);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId);

            if (error) throw error;

            // Update local state immediately
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));

            // Show success briefly
            setTimeout(() => setUpdatingUserId(null), 1000);
        } catch (error) {
            console.error('Error updating role:', error);
            alert('Erro ao atualizar cargo: ' + (error.message || 'Verifique se você tem permissões de Super Admin no banco de dados.'));
            setUpdatingUserId(null);
            fetchUsers(); // Rollback UI
        }
    };

    const handleDeleteUser = async (user) => {
        // 1. Check for owned songs
        try {
            const { count, error } = await supabase
                .from('songs')
                .select('*', { count: 'exact', head: true })
                .eq('created_by', user.id);

            if (error) throw error;

            if (count > 0) {
                // Prepare Transfer Modal
                setDeleteTarget({ ...user, songCount: count });
                setIsDeleting(true);
            } else {
                // No songs, direct delete confirmation
                const confirmed = await confirmAction({
                    title: 'Excluir Usuário',
                    message: `Tem certeza que deseja EXCLUIR PERMANENTEMENTE ${user.email}? Esta ação não pode ser desfeita.`,
                    confirmText: 'Excluir',
                    type: 'danger'
                });
                if (!confirmed) return;
                await performDelete(user.id);
            }
        } catch (err) {
            console.error(err);
            showToast('Erro ao verificar músicas do usuário.', 'error');
        }
    };

    const performDelete = async (targetId) => {
        setDeleteLoading(true);
        try {
            const { error } = await supabase.rpc('delete_user_and_transfer_to_review', {
                target_user_id: targetId
            });

            if (error) throw error;

            setUsers(users.filter(u => u.id !== targetId));
            showToast('Usuário excluído com sucesso.', 'success');
            setIsDeleting(false);
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
            showToast('Erro ao excluir usuário: ' + err.message, 'error');
        } finally {
            setDeleteLoading(false);
        }
    };

    if (!isAdmin) {
        return <div className="p-8 text-center text-red-500">Acesso negado. Apenas administradores.</div>;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center justify-between w-full md:w-auto">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Shield className="text-purple-600" /> Gerenciar Usuários
                    </h2>
                    <div className="text-sm text-slate-500 md:hidden">
                        Total: {users.length}
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-sm text-slate-500 hidden md:block">
                        Total: {users.length}
                    </div>
                    <div className="flex items-center gap-2">
                        <ButtonLink
                            to="/admin/reports"
                            icon={<BarChart3 size={18} />}
                            label="Relatórios"
                        />
                        <ButtonLink
                            to="/admin/review"
                            icon={<Eye size={18} />}
                            label="Revisão"
                        />
                        <ButtonLink
                            to="/admin/trash"
                            icon={<Trash2 size={18} />}
                            label="Lixeira"
                        />
                        <ButtonLink
                            to="/admin/metadata"
                            icon={<Settings size={18} />}
                            label="Metadados"
                        />
                    </div>
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
                        <p className="text-sm text-slate-500 mb-4 h-10 overflow-hidden text-ellipsis">{plan.description}</p>
                        <div className="flex gap-4 text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                            <span>Acesso Individual / 1 Usuário</span>
                        </div>
                    </div>
                ))}
            </div>

            {error && <div className="bg-red-100 text-red-700 p-4 rounded-lg">{error}</div>}

            {/* Pagination Info */}
            <div className="flex items-center justify-between text-sm text-slate-500">
                <div>
                    Mostrando {Math.min((currentPage - 1) * usersPerPage + 1, users.length)} - {Math.min(currentPage * usersPerPage, users.length)} de {users.length} usuários
                </div>
                <div>
                    Página {currentPage} de {Math.ceil(users.length / usersPerPage) || 1}
                </div>
            </div>

            {/* User List */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 uppercase text-xs font-bold">
                        <tr>
                            <th className="p-4 border-b border-slate-200 dark:border-slate-800">Email / Usuário</th>
                            <th className="p-4 border-b border-slate-200 dark:border-slate-800">Função</th>
                            <th className="p-4 border-b border-slate-200 dark:border-slate-800 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {loading ? (
                            <tr>
                                <td colSpan="3" className="p-8 text-center text-slate-500">Carregando...</td>
                            </tr>
                        ) : users
                            .slice((currentPage - 1) * usersPerPage, currentPage * usersPerPage)
                            .map(user => (
                                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500">
                                                <User size={16} />
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 dark:text-slate-200 text-sm md:text-base break-all">{user.email}</div>
                                                <div className="text-xs text-slate-400 font-mono hidden md:block mb-1">{user.id}</div>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {user.memberships?.length > 0 && user.memberships.map((m, idx) => m.churches && (
                                                        <span key={idx} className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
                                                            Igreja: {m.churches.name}
                                                        </span>
                                                    ))}
                                                    {user.subs?.length > 0 && user.subs.filter(s => s.plans?.type === 'individual').map((s, idx) => (
                                                        <span key={idx} className={`px-2 py-0.5 rounded text-[9px] font-black uppercase 
                                                            ${s.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                                                            {s.plans.name} ({s.status})
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={user.role}
                                                onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                                                disabled={user.id === currentUser?.id || updatingUserId === user.id}
                                                className={`px-3 py-1 rounded border text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-purple-500 transition cursor-pointer 
                                                ${user.role === 'super_admin' ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-800' :
                                                  user.role === 'CHURCH_ADMIN' ? 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900 dark:text-indigo-300 dark:border-indigo-800' :
                                                  user.role === 'WORSHIP_LEADER' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800' :
                                                  'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'}`}
                                            >
                                                <option value="super_admin">Super Admin</option>
                                                <option value="CHURCH_ADMIN">Responsável</option>
                                                <option value="WORSHIP_LEADER">Líder</option>
                                                <option value="WORSHIPPER">Adorador</option>
                                            </select>
                                            
                                            {updatingUserId === user.id && (
                                                <div className="flex items-center text-purple-500 animate-in fade-in zoom-in duration-300">
                                                    <Loader size={12} className="animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-1">
                                            {user.id !== currentUser?.id && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            setSubscriptionTarget({ id: user.id, name: user.email });
                                                            setIsManagingSubscription(true);
                                                        }}
                                                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition"
                                                        title="Gerenciar Assinatura"
                                                    >
                                                        <DollarSign size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setEditingUser(user);
                                                            setIsEditingUser(true);
                                                        }}
                                                        className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition"
                                                        title="Editar Usuário"
                                                    >
                                                        <User size={18} />
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            setReportTarget({ id: user.id, name: user.email || user.full_name });
                                                            setIsViewingReport(true);
                                                        }}
                                                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition"
                                                        title="Ver Relatório de Atividade"
                                                    >
                                                        <BarChart3 size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(user)}
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                                                        title="Remover Acesso"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>

                {/* Activity Report Modal */}
                <UserActivityModal 
                    isOpen={isViewingReport}
                    onClose={() => {
                        setIsViewingReport(false);
                        setReportTarget(null);
                    }}
                    targetId={reportTarget?.id}
                    targetName={reportTarget?.name}
                />

                {/* Pagination Controls */}
                {!loading && users.length > usersPerPage && (
                    <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition"
                        >
                            Anterior
                        </button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.ceil(users.length / usersPerPage) }, (_, i) => i + 1)
                                .filter(page => {
                                    // Show first, last, current, and neighbors
                                    const totalPages = Math.ceil(users.length / usersPerPage);
                                    return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                                })
                                .map((page, index, array) => (
                                    <React.Fragment key={page}>
                                        {index > 0 && array[index - 1] !== page - 1 && (
                                            <span className="px-2 text-slate-400">...</span>
                                        )}
                                        <button
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-10 h-10 rounded-lg font-bold text-sm transition ${page === currentPage
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    </React.Fragment>
                                ))}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(Math.ceil(users.length / usersPerPage), p + 1))}
                            disabled={currentPage >= Math.ceil(users.length / usersPerPage)}
                            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition"
                        >
                            Próxima
                        </button>
                    </div>
                )}
            </div>

            {/* Add User Section */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-8 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-xl">
                        <UserPlus size={24} />
                    </div>
                    <h3 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tight">Novo Usuário</h3>
                </div>
                
                <form onSubmit={handleAddUser} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Email</label>
                            <input
                                type="email"
                                placeholder="exemplo@email.com"
                                required
                                value={newUserEmail}
                                onChange={e => setNewUserEmail(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Senha</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Mínimo 6 caracteres"
                                    required
                                    minLength={6}
                                    value={newUserPassword}
                                    onChange={e => setNewUserPassword(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 pr-12 font-bold"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Igreja Vinculada (Opcional para individuais)</label>
                            <select 
                                disabled={newUserRole === 'super_admin'}
                                value={newUserChurchId}
                                onChange={(e) => setNewUserChurchId(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold appearance-none cursor-pointer disabled:opacity-50"
                            >
                                <option value="">Nenhuma / Usuário Individual</option>
                                {churches.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Cargo Global</label>
                            <select
                                value={newUserRole}
                                onChange={e => {
                                    const role = e.target.value;
                                    setNewUserRole(role);
                                    if (role === 'super_admin') setNewUserChurchId('');
                                    else if (!newUserChurchId && churches.length > 0) setNewUserChurchId(churches[0].id);
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold appearance-none cursor-pointer"
                            >
                                <option value="WORSHIPPER">Adorador</option>
                                <option value="WORSHIP_LEADER">Líder de Adoração</option>
                                <option value="CHURCH_ADMIN">Responsável da Igreja</option>
                                <option value="super_admin">Super Admin</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Nome Completo</label>
                            <input
                                type="text"
                                placeholder="..."
                                required
                                value={newUserName}
                                onChange={e => setNewUserName(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">WhatsApp</label>
                            <input
                                type="tel"
                                placeholder="(00) 00000-0000"
                                value={newUserPhone}
                                onChange={e => setNewUserPhone(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Instrumento Principal</label>
                            <select
                                value={newUserInstrument}
                                onChange={e => {
                                    const val = e.target.value;
                                    setNewUserInstrument(val);
                                    if (val && !newUserAvailableInstruments.includes(val)) {
                                        setNewUserAvailableInstruments([...newUserAvailableInstruments, val]);
                                    }
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold appearance-none cursor-pointer"
                            >
                                <option value="">Selecione...</option>
                                {instrumentsMetadata.map(inst => (
                                    <option key={inst.id} value={inst.name}>{inst.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Available Instruments Selector */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2 tracking-widest">
                            Habilidades / Todos os Instrumentos
                        </label>
                        <div className="flex flex-wrap gap-2 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-2xl min-h-[80px]">
                            {instrumentsMetadata.map(inst => {
                                const isMain = inst.name === newUserInstrument;
                                const isSelected = newUserAvailableInstruments.includes(inst.name) || isMain;
                                return (
                                    <button
                                        key={inst.id}
                                        type="button"
                                        onClick={() => !isMain && toggleNewUserInstrument(inst.name)}
                                        disabled={isMain}
                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all border-2 ${
                                            isSelected
                                                ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20'
                                                : 'bg-white dark:bg-slate-800 text-slate-400 border-slate-100 dark:border-slate-700 hover:border-slate-300'
                                        } ${isMain ? 'ring-4 ring-purple-400/20' : ''}`}
                                    >
                                        {isSelected && <Check size={14} />}
                                        {inst.name}
                                        {isMain && <span className="ml-1 text-[8px] uppercase font-black opacity-80">(P)</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    
                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={addLoading}
                            className="flex items-center gap-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:shadow-lg hover:shadow-green-600/20 text-white px-10 py-5 rounded-2xl font-black transition-all active:scale-95 disabled:opacity-50"
                        >
                            {addLoading ? <Loader className="animate-spin" size={20} /> : <UserPlus size={20} />}
                            ADICIONAR USUÁRIO
                        </button>
                    </div>
                </form>
            </div>


            {/* Delete Transfer Modal */}
            {
                isDeleting && deleteTarget && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-3 text-rose-600 mb-4">
                                <AlertTriangle size={32} />
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Excluir com Retenção</h3>
                            </div>

                            <p className="text-slate-600 dark:text-slate-300 mb-6">
                                O usuário <strong>{deleteTarget.email}</strong> é autor de <strong>{deleteTarget.songCount}</strong> músicas.
                                <br /><br />
                                Ao excluí-lo, essas músicas <strong>não serão apagadas</strong>. Elas serão transferidas para a conta oficial e ficarão no <strong>Painel de Revisão</strong> aguardando moderação.
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsDeleting(false)}
                                    className="flex-1 py-3 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-bold"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => performDelete(deleteTarget.id)}
                                    disabled={deleteLoading}
                                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-lg shadow-rose-600/20 disabled:opacity-50"
                                >
                                    {deleteLoading ? 'Processando...' : 'Excluir e Transferir'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* User Edit Modal */}
            {isEditingUser && editingUser && (
                <UserEditModal
                    user={editingUser}
                    onClose={() => {
                        setIsEditingUser(false);
                        setEditingUser(null);
                    }}
                    onUserUpdated={() => {
                        fetchUsers();
                    }}
                />
            )}

            {/* Subscription Manager Modal */}
            <SubscriptionManagerModal
                isOpen={isManagingSubscription}
                onClose={(changed) => {
                    setIsManagingSubscription(false);
                    setSubscriptionTarget(null);
                    if (changed) fetchUsers();
                }}
                targetId={subscriptionTarget?.id}
                targetName={subscriptionTarget?.name}
                type="individual"
            />
        </div>
    );
}
