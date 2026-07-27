import { supabase } from '../supabaseClient';

export const normalizePhone = (phone) => {
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');
    if (!digits) return '';
    if (!digits.startsWith('55')) {
        digits = `55${digits}`;
    }
    // Brasil: 55 + DDD (2) + 9 (1) + 8 dígitos = 13 dígitos
    if (digits.length === 12) {
        const ddd = digits.slice(2, 4);
        const rest = digits.slice(4);
        digits = `55${ddd}9${rest}`;
    }
    return digits;
};

export const WhatsAppService = {
    /**
     * Obter as credenciais da Z-API no banco de dados (app_settings)
     */
    async getZApiConfig() {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('key, value')
                .in('key', ['zapi_instance_id', 'zapi_instance_token', 'zapi_client_token']);

            if (error) throw error;

            const config = {};
            (data || []).forEach(row => {
                config[row.key] = row.value;
            });

            return {
                instanceId: config.zapi_instance_id || '',
                instanceToken: config.zapi_instance_token || '',
                clientToken: config.zapi_client_token || ''
            };
        } catch (err) {
            console.error('[WhatsAppService] Erro ao carregar configurações Z-API:', err);
            return { instanceId: '', instanceToken: '', clientToken: '' };
        }
    },

    /**
     * Salvar configurações da Z-API
     */
    async saveZApiConfig({ instanceId, instanceToken, clientToken }) {
        const rows = [
            { key: 'zapi_instance_id', value: instanceId, updated_at: new Date().toISOString() },
            { key: 'zapi_instance_token', value: instanceToken, updated_at: new Date().toISOString() },
            { key: 'zapi_client_token', value: clientToken, updated_at: new Date().toISOString() }
        ];

        const { error } = await supabase
            .from('app_settings')
            .upsert(rows, { onConflict: 'key' });

        if (error) throw error;
        return true;
    },

    /**
     * Enviar mensagem de texto via Z-API REST Endpoint
     */
    async sendTextMessage({ phone, message }) {
        const config = await this.getZApiConfig();
        if (!config.instanceId || !config.instanceToken) {
            console.warn('[WhatsAppService] Instância ou Token Z-API não configurados.');
            return { success: false, skipped: true, error: 'Z-API não configurada' };
        }

        const formattedPhone = normalizePhone(phone);
        if (!formattedPhone) {
            return { success: false, error: 'Telefone inválido' };
        }

        const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.instanceToken}/send-text`;
        const headers = { 'Content-Type': 'application/json' };
        if (config.clientToken) {
            headers['Client-Token'] = config.clientToken;
        }

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    phone: formattedPhone,
                    message,
                    delayMessage: 2,
                    delayTyping: 1
                })
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error('[WhatsAppService] Z-API Error:', body);
                return { success: false, status: res.status, error: body };
            }

            return { success: true, data: body };
        } catch (err) {
            console.error('[WhatsAppService] Falha de rede ao enviar mensagem:', err);
            return { success: false, error: err.message };
        }
    },

    /**
     * Enviar WhatsApp automático de confirmação para o Músico Escalado
     */
    async sendScaleConfirmation({ scaleId, musicianPhone, musicianName, roleName, setlistTitle, setlistDate }) {
        if (!musicianPhone) {
            console.warn('[WhatsAppService] Músico sem telefone cadastrado.');
            return { success: false, error: 'Músico sem telefone' };
        }

        const dateFormatted = setlistDate ? new Date(setlistDate).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'data do culto';

        const message = [
            `🎵 *LouvorPlay - Confirmação de Escala*`,
            ``,
            `Olá, *${musicianName}*! Você foi escalado(a) no louvor para o culto:`,
            `📌 *${setlistTitle || 'Culto'}*`,
            `📅 *${dateFormatted}*`,
            `🎸 *Sua função:* ${roleName || 'Músico(a)'}`,
            ``,
            `Por favor, responda a esta mensagem com:`,
            `*1* - Confirmar Presença ✅`,
            `*2* - Não Poderei Tocar ❌`
        ].join('\n');

        const sendResult = await this.sendTextMessage({ phone: musicianPhone, message });

        if (sendResult.success) {
            await supabase
                .from('setlist_scales')
                .update({
                    whatsapp_status: 'SENT',
                    whatsapp_sent_at: new Date().toISOString()
                })
                .eq('id', scaleId);
        }

        return sendResult;
    },

    /**
     * Enviar Alerta via WhatsApp para o Líder do Louvor quando um Músico Recusa
     */
    async sendLeaderAlert({ leaderPhone, musicianName, roleName, setlistTitle, setlistDate }) {
        if (!leaderPhone) return;

        const dateFormatted = setlistDate ? new Date(setlistDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

        const message = [
            `⚠️ *LouvorPlay - Alerta de Escala*`,
            ``,
            `O(a) músico(a) *${musicianName}* informou que *NÃO PODERÁ TOCAR/CANTAR* (${roleName || 'Músico'}) no culto *${setlistTitle}* (${dateFormatted}).`,
            ``,
            `Acesse o aplicativo LouvorPlay para atualizar a escala!`
        ].join('\n');

        return await this.sendTextMessage({ phone: leaderPhone, message });
    },

    /**
     * Atualizar o Status da Escala (CONFIRMED ou DECLINED) e notificar o líder se recusado
     */
    async updateScaleStatus(scaleId, status, declineReason = '') {
        const isConfirmed = status === 'CONFIRMED';
        const isDeclined = status === 'DECLINED';

        const updatePayload = {
            status,
            whatsapp_status: status
        };

        if (isConfirmed) updatePayload.confirmed_at = new Date().toISOString();
        if (isDeclined) {
            updatePayload.declined_at = new Date().toISOString();
            if (declineReason) updatePayload.decline_reason = declineReason;
        }

        // 1. Atualiza no banco
        const { data: scaleData, error: updateError } = await supabase
            .from('setlist_scales')
            .update(updatePayload)
            .eq('id', scaleId)
            .select(`
                id,
                role,
                user:profiles(id, name, full_name, phone, whatsapp),
                setlist:setlists(
                    id,
                    title,
                    date,
                    created_by,
                    creator:profiles!setlists_created_by_profile_fkey(id, name, phone, whatsapp)
                )
            `)
            .single();

        if (updateError) {
            console.error('[WhatsAppService] Erro ao atualizar escala:', updateError);
            throw updateError;
        }

        // 2. Se recusado, notifica o líder no app (notifications) e no WhatsApp
        if (isDeclined && scaleData) {
            const musicianName = scaleData.user?.name || scaleData.user?.full_name || 'Músico';
            const roleName = scaleData.role || 'Escala';
            const setlistTitle = scaleData.setlist?.title || 'Culto';
            const setlistDate = scaleData.setlist?.date;
            const leaderId = scaleData.setlist?.created_by;
            const leaderPhone = scaleData.setlist?.creator?.whatsapp || scaleData.setlist?.creator?.phone;

            if (leaderId) {
                await supabase.from('notifications').insert({
                    user_id: leaderId,
                    title: '⚠️ Músico Recusou a Escala',
                    message: `${musicianName} (${roleName}) informou que não poderá participar no culto "${setlistTitle}".`,
                    type: 'WARNING',
                    is_read: false
                }).catch(e => console.error('Erro ao criar notificação:', e));
            }

            if (leaderPhone) {
                await this.sendLeaderAlert({
                    leaderPhone,
                    musicianName,
                    roleName,
                    setlistTitle,
                    setlistDate
                });
            }
        }

        return scaleData;
    }
};
