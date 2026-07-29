import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { logActivity } from '../utils/storage';
import { getAuthRedirectUrl } from '../utils/authRedirect';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [memberships, setMemberships] = useState([]);
    const [activeChurch, setActiveChurch] = useState(null);
    const [churchRole, setChurchRole] = useState(null);
    const [role, setRole] = useState(null); // Global role: 'super_admin' | 'user'
    const [subscriptionStatus, setSubscriptionStatus] = useState(null); // 'ACTIVE', 'OVERDUE', 'PENDING' etc
    const [loading, setLoading] = useState(true);

    const lastFetchedUserId = React.useRef(null);

    const fetchProfile = async (userId) => {
        let hasLoadedFromCache = false;
        try {
            // Load from cache first to allow immediate offline use and prevent "disconnected" state
            const cachedAuth = localStorage.getItem(`lp_auth_cache_${userId}`);
            if (cachedAuth) {
                const parsed = JSON.parse(cachedAuth);
                if (parsed.profile) setUserProfile(parsed.profile);
                if (parsed.role) setRole(parsed.role);
                if (parsed.memberships) setMemberships(parsed.memberships);
                if (parsed.activeChurch) setActiveChurch(parsed.activeChurch);
                if (parsed.churchRole) setChurchRole(parsed.churchRole);
                if (parsed.subscriptionStatus) setSubscriptionStatus(parsed.subscriptionStatus);
                setLoading(false); // Render UI immediately with cached data
                hasLoadedFromCache = true;
            }
        } catch (e) {
            console.warn("[Auth] Failed to load auth cache", e);
        }

        try {
            // 1. Fetch Profile
            const { data: profile, error: profileError, status } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (profileError) {
                if (status === 401 || status === 403) {
                    await logout();
                    return;
                }
                if (!hasLoadedFromCache) {
                    setRole('user');
                }
            } else if (profile) {
                // 2. Fetch Memberships
                const { data: memberData, error: memberError } = await supabase
                    .from('church_user_memberships')
                    .select(`
                        *,
                        church: churches(*, subscription:subscriptions!subscriptions_church_id_fkey(*))
                    `)
                    .eq('user_id', userId)
                    .eq('status', 'active');

                let currentChurch = null;
                let churchRoleVal = null;
                let subStatusVal = 'ACTIVE';

                if (!memberError && memberData) {
                    if (profile.active_church_id) {
                        currentChurch = memberData.find(m => m.church_id === profile.active_church_id)?.church;
                    }
                    if (!currentChurch && memberData.length > 0) {
                        currentChurch = memberData[0].church;
                    }
                    if (currentChurch) {
                        const m = memberData.find(m => m.church_id === currentChurch.id);
                        churchRoleVal = m?.role;
                        if (profile.role === 'super_admin') {
                            subStatusVal = 'ACTIVE';
                        } else if (currentChurch.subscription && currentChurch.subscription.length > 0) {
                            subStatusVal = currentChurch.subscription[0].status;
                        } else {
                            subStatusVal = 'ACTIVE'; 
                        }
                    }
                }

                // Update state with fresh DB data
                setRole(profile.role);
                setUserProfile(profile);
                if (memberData) setMemberships(memberData);
                if (currentChurch) setActiveChurch(currentChurch);
                if (churchRoleVal !== undefined) setChurchRole(churchRoleVal);
                setSubscriptionStatus(subStatusVal);

                // Save/Update the cache
                try {
                    localStorage.setItem(`lp_auth_cache_${userId}`, JSON.stringify({
                        profile,
                        role: profile.role,
                        memberships: memberData || [],
                        activeChurch: currentChurch,
                        churchRole: churchRoleVal,
                        subscriptionStatus: subStatusVal
                    }));
                } catch (e) {
                    console.warn("[Auth] Failed to save auth cache", e);
                }
            }
        } catch (err) {
            console.error("[Auth] Fetch error:", err);
            if (!hasLoadedFromCache) {
                setRole('user');
                setSubscriptionStatus('PENDING');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let mounted = true;
        let authInitialized = false;

        const handleSession = async (session) => {
            if (!mounted) return;
            const currentUser = session?.user ?? null;
            setUser(currentUser);

            if (currentUser) {
                // Avoid redundant concurrent profile fetches for the same user
                if (lastFetchedUserId.current !== currentUser.id) {
                    lastFetchedUserId.current = currentUser.id;
                    await fetchProfile(currentUser.id);
                }
            } else {
                lastFetchedUserId.current = null;
                setRole(null);
                setUserProfile(null);
                setLoading(false);
            }
            authInitialized = true;
        };

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!authInitialized) {
                handleSession(session);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                logActivity('login');
            }
            // INITIAL_SESSION event and others will fire here
            handleSession(session);
        });

        // Safety timeout - force loading false if it hangs
        const timer = setTimeout(() => {
            if (mounted) {
                setLoading(current => {
                    if (current) console.warn("[Auth] Safety timeout reached.");
                    return false;
                });
            }
        }, 8000); // 8 seconds for safety in case of slow DB

        return () => {
            mounted = false;
            subscription.unsubscribe();
            clearTimeout(timer);
        };
    }, []);

    const isSuperAdmin = role === 'super_admin';
    // If super_admin, they have permissions everywhere.
    // Otherwise, check their role within the active church or global profile.
    const isChurchAdmin = isSuperAdmin || role === 'CHURCH_ADMIN' || churchRole === 'CHURCH_ADMIN';
    const isWorshipLeader = isChurchAdmin || role === 'WORSHIP_LEADER' || churchRole === 'WORSHIP_LEADER';
    const isWorshipper = isWorshipLeader || role === 'WORSHIPPER' || churchRole === 'WORSHIPPER';

    // Legacy compatibility (to be removed after global rename)
    const isAdmin = isSuperAdmin; 
    const isEditor = isWorshipLeader;
    const isMusician = isWorshipper;

    const login = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        return data;
    };

    const signup = async (email, password, userData = {}) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: getAuthRedirectUrl('/confirm-email'),
                data: {
                    email: email,
                    ...userData
                }
            }
        });
        if (error) throw error;

        if (data?.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    ...userData,
                    updated_at: new Date()
                })
                .eq('id', data.user.id);

            if (profileError) {
                console.error("Error updating profile details:", profileError);
            }
        }

        return data;
    };

    const resetPassword = async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: getAuthRedirectUrl('/update-password'),
        });
        if (error) throw error;
    };

    const updatePassword = async (newPassword) => {
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        if (error) throw error;
    };

    const logout = async () => {
        if (user) {
            try {
                localStorage.removeItem(`lp_auth_cache_${user.id}`);
            } catch (e) {
                console.warn("[Auth] Failed to clear auth cache", e);
            }
        }
        lastFetchedUserId.current = null;
        await supabase.auth.signOut();
        setRole(null);
        setUser(null);
        setUserProfile(null);
        setMemberships([]);
        setActiveChurch(null);
        setChurchRole(null);
        setSubscriptionStatus(null);
    };

    const changeActiveChurch = async (churchId) => {
        const m = memberships.find(mem => mem.church_id === churchId);
        if (m) {
            setActiveChurch(m.church);
            setChurchRole(m.role);
            // Persistent preference
            await supabase.from('profiles').update({ active_church_id: churchId }).eq('id', user.id);
        }
    };

    const value = React.useMemo(() => ({
        user,
        userProfile,
        memberships,
        activeChurch,
        churchRole,
        role,
        subscriptionStatus,
        isSuperAdmin,
        isChurchAdmin,
        isWorshipLeader,
        isWorshipper,
        isAdmin, // Legacy
        isEditor, // Legacy
        isMusician, // Legacy
        loading,
        login,
        signup,
        logout,
        resetPassword,
        updatePassword,
        changeActiveChurch
    }), [user, userProfile, memberships, activeChurch, churchRole, role, subscriptionStatus, loading]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
