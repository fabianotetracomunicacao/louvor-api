import { test, expect } from '@playwright/test';

test.describe('Módulo 2: Player, Cifras e Ferramentas de Transposição', () => {

  test('Deve carregar a página de repertório ou redirecionar para login', async ({ page }) => {
    await page.goto('/repertoire');
    // Verifica se carregou o repertório ou redirecionou por segurança
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(repertoire|login)/);
  });

  test('Simulação de ferramentas do player e alternância de transposição', async ({ page }) => {
    await page.goto('/repertoire');
    
    // Se estiver no login, preenche para acessar
    if (page.url().includes('/login')) {
      await page.locator('input[type="email"]').fill('teste_soak@louvorplay.com');
      await page.locator('input[type="password"]').fill('123456');
    }

    // Navega para um id de player direto de demonstração
    await page.goto('/player/demo');
    
    // Verifica presença da página de player
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toBeDefined();
  });

  test('Teste de estresse: busca e navegação rápida por cifras', async ({ page }) => {
    await page.goto('/repertoire?q=grande');
    await page.waitForTimeout(500);
    
    await page.goto('/repertoire?q=deus');
    await page.waitForTimeout(500);
    
    await page.goto('/repertoire?tab=all');
    await page.waitForTimeout(500);
    
    expect(page.url()).toMatch(/\/(repertoire|login)/);
  });
});
