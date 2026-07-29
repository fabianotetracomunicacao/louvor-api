import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { getAuthRedirectUrl } from '../utils/authRedirect';

const createEphemeralSupabaseClient = () => createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            flowType: 'implicit'
        }
    }
);

export const InvitationService = {
    /**
     * Checks if a church has available slots for a specific role
     */
    async checkCapacity(churchId, role) {
        try {
            // 1. Get Church Plan Limits
            const { data: church, error: churchError } = await supabase
                .from('churches')
                .select(`
                    id,
                    plan_id,
                    extra_leader_slots,
                    extra_worshiper_slots,
                    plan: plans(*)
                `)
                .eq('id', churchId)
                .single();

            if (churchError) throw churchError;

            // 2. Count Active Members
            const { count: activeCount, error: activeError } = await supabase
                .from('church_user_memberships')
                .select('*', { count: 'exact', head: true })
                .eq('church_id', churchId)
                .eq('role', role)
                .eq('status', 'active');

            if (activeError) throw activeError;

            // 3. Count Pending Invitations
            const { count: pendingCount, error: pendingError } = await supabase
                .from('invitations')
                .select('*', { count: 'exact', head: true })
                .eq('church_id', churchId)
                .eq('role', role)
                .eq('status', 'pending')
                .gt('expires_at', new Date().toISOString());

            if (pendingError) throw pendingError;

            // Determine Limit
            let limit = 0;
            if (role === 'WORSHIP_LEADER') {
                limit = (church.plan?.leader_limit || 0) + (church.extra_leader_slots || 0);
            } else if (role === 'WORSHIPPER') {
                limit = (church.plan?.worshiper_limit || 0) + (church.extra_worshiper_slots || 0);
            } else if (role === 'CHURCH_ADMIN') {
                limit = 99; // Church Admins are usually limited by the platform owner manually or plan base
            }

            const totalOccupied = (activeCount || 0) + (pendingCount || 0);
            
            return {
                allowed: totalOccupied < limit,
                limit,
                activeCount: activeCount || 0,
                pendingCount: pendingCount || 0,
                totalOccupied
            };
        } catch (error) {
            console.error('[InvitationService] checkCapacity error:', error);
            throw error;
        }
    },

    /**
     * Creates a new invitation
     */
    async createInvitation(email, role, churchId, invitedByUserId) {
        // Enforce capacity
        const capacity = await this.checkCapacity(churchId, role);
        if (!capacity.allowed) {
            throw new Error(`Limite do plano atingido para esta função (${capacity.limit} vagas).`);
        }

        const token = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        const { data, error } = await supabase
            .from('invitations')
            .insert({
                church_id: churchId,
                email: email.toLowerCase().trim(),
                role,
                token,
                status: 'pending',
                expires_at: expiresAt.toISOString(),
                invited_by_user_id: invitedByUserId
            })
            .select()
            .single();

        if (error) throw error;

        const emailClient = createEphemeralSupabaseClient();
        const { error: emailError } = await emailClient.auth.signInWithOtp({
            email: data.email,
            options: {
                shouldCreateUser: true,
                emailRedirectTo: getAuthRedirectUrl(`/join/${data.token}`),
                data: {
                    invitation_token: data.token,
                    church_id: churchId,
                    role
                }
            }
        });

        if (emailError) {
            await supabase
                .from('invitations')
                .update({ status: 'canceled' })
                .eq('id', data.id);
            throw new Error(`Convite criado, mas o email não foi disparado: ${emailError.message}`);
        }

        return data;
    },

    /**
     * Lists invitations for a church
     */
    async listInvitations(churchId) {
        const { data, error } = await supabase
            .from('invitations')
            .select(`
                *,
                invited_by: profiles!invited_by_user_id(full_name, email)
            `)
            .eq('church_id', churchId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    /**
     * Cancels a pending invitation
     */
    async cancelInvitation(invitationId) {
        const { error } = await supabase
            .from('invitations')
            .update({ status: 'canceled' })
            .eq('id', invitationId);

        if (error) throw error;
    },

    /**
     * Gets invitation details by token
     */
    async getInvitationMetadata(token) {
        const { data, error } = await supabase
            .from('invitations')
            .select(`
                *,
                church: churches(name),
                invited_by: profiles!invited_by_user_id(full_name)
            `)
            .eq('token', token)
            .eq('status', 'pending')
            .single();

        if (error) throw new Error('Convite inválido, expirado ou já utilizado.');
        
        // Check expiry manually
        if (new Date(data.expires_at) < new Date()) {
            throw new Error('Este convite expirou.');
        }

        return data;
    },

    /**
     * Accepts an invitation
     */
    async acceptInvitation(token, userId, userEmail = null) {
        const invite = await this.getInvitationMetadata(token);

        // Validate user email against invited email if provided
        if (invite.email && userEmail && invite.email.toLowerCase().trim() !== userEmail.toLowerCase().trim()) {
            throw new Error(`Este convite foi enviado para ${invite.email}. Faça login com esta conta para aceitá-lo.`);
        }

        // 1. Double check capacity just in case
        const capacity = await this.checkCapacity(invite.church_id, invite.role);
        // Note: Slot is already reserved by the pending invite, so we check totalOccupied
        // But if someone else accepted faster, we might be over?
        // Relying on the reservation logic (checkCapacity considers pending).

        // 2. Add as Member
        const { error: memberError } = await supabase
            .from('church_user_memberships')
            .upsert({
                church_id: invite.church_id,
                user_id: userId,
                role: invite.role,
                status: 'active',
                invitation_id: invite.id
            }, { onConflict: 'church_id, user_id' });

        if (memberError) throw memberError;

        // 3. Mark Invitation as Accepted
        const { error: inviteError } = await supabase
            .from('invitations')
            .update({
                status: 'accepted',
                accepted_by_user_id: userId
            })
            .eq('id', invite.id);

        if (inviteError) {
            console.warn('Invitation record update failed but membership was created:', inviteError);
        }

        // 4. Set as Active Church
        await supabase
            .from('profiles')
            .update({ active_church_id: invite.church_id })
            .eq('id', userId);

        return invite;
    }
};
