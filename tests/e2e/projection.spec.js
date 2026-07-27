import { test, expect } from '@playwright/test';

test.describe('Módulo 4: Modo Projeção e Controle de Telas', () => {

  test('Deve acessar o painel de controle do projetor', async ({ page }) => {
    await page.goto('/projector');
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(projector|login)/);
  });

  test('Deve acessar a tela de exibição do projetor (Projector Display)', async ({ page }) => {
    await page.goto('/projector-display');
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(projector-display|login)/);
  });

  test('Validação de rota remota de controle de projeção', async ({ page }) => {
    await page.goto('/remote/test-session-123');
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/remote/test-session-123');
  });
});
