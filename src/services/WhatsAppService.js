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
     * Enviar mensagem com botões rápidos via Z-API.
     */
    async sendButtonListMessage({ phone, message, buttons }) {
        const config = await this.getZApiConfig();
        if (!config.instanceId || !config.instanceToken) {
            console.warn('[WhatsAppService] Instância ou Token Z-API não configurados.');
            return { success: false, skipped: true, error: 'Z-API não configurada' };
        }

        const formattedPhone = normalizePhone(phone);
        if (!formattedPhone) {
            return { success: false, error: 'Telefone inválido' };
        }

        const url = `https://api.z-api.io/instances/${config.instanceId}/token/${config.instanceToken}/send-button-list`;
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
                    buttonList: { buttons },
                    delayMessage: 2,
                    delayTyping: 1
                })
            });

            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                console.error('[WhatsAppService] Z-API Button Error:', body);
                return { success: false, status: res.status, error: body };
            }

            return { success: true, data: body };
        } catch (err) {
            console.error('[WhatsAppService] Falha de rede ao enviar botões:', err);
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
            `Toque em uma opção abaixo para responder.`
        ].join('\n');

        let sendResult = await this.sendButtonListMessage({
            phone: musicianPhone,
            message,
            buttons: [
                { id: `scale_confirm:${scaleId}`, label: 'Confirmar presença' },
                { id: `scale_decline:${scaleId}`, label: 'Não poderei tocar' }
            ]
        });

        if (!sendResult.success) {
            const fallbackMessage = [
                message,
                ``,
                `Se os botões não aparecerem, responda:`,
                `*1* - Confirmar presença`,
                `*2* - Não poderei tocar`
            ].join('\n');

            sendResult = await this.sendTextMessage({ phone: musicianPhone, message: fallbackMessage });
        }

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

        // 1. Update setlist_scales row cleanly without fragile nested relation joins
        const { data: updatedRows, error: updateError } = await supabase
            .from('setlist_scales')
            .update(updatePayload)
            .eq('id', scaleId)
            .select('id, setlist_id, user_id, role, status, confirmed_at, declined_at, decline_reason');

        if (updateError) {
            console.error('[WhatsAppService] Erro ao atualizar escala:', updateError);
            throw updateError;
        }

        let scaleData = updatedRows && updatedRows.length > 0 ? updatedRows[0] : null;

        if (!scaleData) {
            scaleData = { id: scaleId, status, ...updatePayload };
        }

        // 2. If declined, independently fetch details and notify leader
        if (isDeclined && scaleData.setlist_id) {
            try {
                const [{ data: musicianProfile }, { data: setlistData }] = await Promise.all([
                    supabase.from('profiles').select('name, full_name').eq('id', scaleData.user_id).maybeSingle(),
                    supabase.from('setlists').select('name, title, date, created_by').eq('id', scaleData.setlist_id).maybeSingle()
                ]);

                const musicianName = musicianProfile?.name || musicianProfile?.full_name || 'Músico';
                const roleName = scaleData.role || 'Escala';
                const setlistTitle = setlistData?.title || setlistData?.name || 'Culto';
                const setlistDate = setlistData?.date;
                const leaderId = setlistData?.created_by;

                let leaderPhone = null;
                if (leaderId) {
                    const { data: leaderProfile } = await supabase
                        .from('profiles')
                        .select('phone, whatsapp')
                        .eq('id', leaderId)
                        .maybeSingle();
                    leaderPhone = leaderProfile?.whatsapp || leaderProfile?.phone;

                    await supabase.from('notifications').insert({
                        user_id: leaderId,
                        title: '⚠️ Músico Recusou a Escala',
                        message: `${musicianName} (${roleName}) informou que não poderá participar no culto "${setlistTitle}".`,
                        type: 'WARNING',
                        read: false
                    }).catch(e => console.error('Erro ao criar notificação:', e));
                }

                if (leaderPhone) {
                    await this.sendLeaderAlert({
                        leaderPhone,
                        musicianName,
                        roleName,
                        setlistTitle,
                        setlistDate
                    }).catch(err => console.warn('[WhatsAppService] Alert error:', err));
                }
            } catch (e) {
                console.warn('[WhatsAppService] Error sending decline notifications:', e);
            }
        }

        return scaleData;
    }
};
