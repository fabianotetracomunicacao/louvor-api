import React, { useMemo, useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtistCatalogSelector } from '../ArtistCatalogSelector';
import {
    getInitialCatalogSelection,
    groupCatalogSongs,
} from '../../utils/cifraclubCatalog';

const songs = [
    {
        name: 'A Canção',
        song_slug: 'a-cancao-principal',
        version_label: 'principal',
        version_tone: 'G',
        version_verified: false,
    },
    {
        name: 'A Cancao!',
        song_slug: 'a-cancao-verificada',
        version_label: 'simplificada',
        version_tone: 'A',
        version_verified: true,
    },
    {
        name: 'Outro Louvor',
        song_slug: 'outro-louvor',
        version_label: 'principal',
        version_tone: 'C',
        version_verified: false,
    },
];

function Harness({ onEnqueue = vi.fn() }) {
    const groups = useMemo(() => groupCatalogSongs(songs), []);
    const [selection, setSelection] = useState(() => getInitialCatalogSelection(groups));

    return (
        <ArtistCatalogSelector
            artist={{ name: 'Diante do Trono', songs }}
            selectedSlugs={selection}
            onSelectionChange={setSelection}
            onEnqueue={onEnqueue}
            isEnqueueing={false}
        />
    );
}

describe('ArtistCatalogSelector', () => {
    it('shows one preferred version selected per normalized title', () => {
        render(<Harness />);

        expect(screen.getByText('2 de 3 selecionadas')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', {
            name: /A Cancao!.*verificada.*simplificada.*tom A/i,
        })).toBeChecked();
        expect(screen.getByRole('checkbox', {
            name: /Outro Louvor.*principal.*tom C/i,
        })).toBeChecked();
        expect(screen.queryByRole('checkbox', {
            name: /A Canção.*principal.*tom G/i,
        })).not.toBeInTheDocument();
    });

    it('expands alternatives and allows independent selection', () => {
        render(<Harness />);

        fireEvent.click(screen.getByRole('button', {
            name: 'Mostrar versões de A Canção',
        }));
        const alternative = screen.getByRole('checkbox', {
            name: /A Canção.*principal.*tom G/i,
        });

        expect(alternative).not.toBeChecked();
        fireEvent.click(alternative);
        expect(alternative).toBeChecked();
        expect(screen.getByText('3 de 3 selecionadas')).toBeInTheDocument();
    });

    it('filters groups, selects visible preferred versions and clears selection', () => {
        render(<Harness />);

        fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }));
        expect(screen.getByText('0 de 3 selecionadas')).toBeInTheDocument();

        fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrar cifras' }), {
            target: { value: 'outro' },
        });

        const list = screen.getByRole('list', { name: 'Cifras disponíveis' });
        expect(within(list).getByText('Outro Louvor')).toBeInTheDocument();
        expect(within(list).queryByText('A Canção')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Selecionar visíveis' }));
        expect(screen.getByText('1 de 3 selecionadas')).toBeInTheDocument();
    });

    it('disables enqueue with no selection and submits the current selection', () => {
        const onEnqueue = vi.fn();
        render(<Harness onEnqueue={onEnqueue} />);

        const enqueue = screen.getByRole('button', {
            name: 'Adicionar 2 selecionadas à fila',
        });
        fireEvent.click(enqueue);
        expect(onEnqueue).toHaveBeenCalledOnce();

        fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }));
        expect(screen.getByRole('button', {
            name: 'Adicionar 0 selecionadas à fila',
        })).toBeDisabled();
    });
});
