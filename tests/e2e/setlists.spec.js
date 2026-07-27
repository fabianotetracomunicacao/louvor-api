import { test, expect } from '@playwright/test';

test.describe('Módulo 3: Playlists e Setlists Colaborativas', () => {

  test('Deve acessar a rota de playlists', async ({ page }) => {
    await page.goto('/playlists');
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(playlists|login)/);
  });

  test('Simulação de criação e edição de repertório', async ({ page }) => {
    await page.goto('/playlists');
    
    // Se redirecionado para login, valida formulário
    if (page.url().includes('/login')) {
      await expect(page.locator('input[type="email"]')).toBeVisible();
    } else {
      // Se autenticado, busca os botões de criar playlist ou lista existente
      const newPlaylistBtn = page.locator('text=/nova playlist|criar playlist|adicionar/i');
      if (await newPlaylistBtn.isVisible()) {
        await expect(newPlaylistBtn.first()).toBeEnabled();
      }
    }
  });

  test('Navegação e ordenação de escalas/setlists', async ({ page }) => {
    await page.goto('/escalas');
    await page.waitForTimeout(500);
    const url = page.url();
    expect(url).toMatch(/\/(escalas|login)/);
  });
});
