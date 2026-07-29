import { describe, expect, test } from 'vitest';
import { normalizeSetlistScaleItem } from '../storage';

describe('normalizeSetlistScaleItem', () => {
    test('marks a scale member as confirmed when the database row has a confirmation timestamp', () => {
        const normalized = normalizeSetlistScaleItem({
            id: 'scale-1',
            role: 'Guitarra',
            status: null,
            whatsapp_status: null,
            confirmed_at: '2026-08-01T12:00:00.000Z',
            declined_at: null,
            decline_reason: null,
            user: { id: 'user-1', name: 'Tiago' }
        });

        expect(normalized).toEqual({
            id: 'scale-1',
            role: 'Guitarra',
            status: 'CONFIRMED',
            whatsappStatus: 'NOT_SENT',
            confirmedAt: '2026-08-01T12:00:00.000Z',
            declinedAt: null,
            declineReason: null,
            user: { id: 'user-1', name: 'Tiago' }
        });
    });
});
