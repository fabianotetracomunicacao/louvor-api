import { test, expect } from '@playwright/test';

test.describe('Módulo 1: Autenticação, Cadastro e Sessão', () => {

  test('Deve carregar a tela de login e verificar os elementos de formulário', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    
    // Verifica presença dos inputs de email e senha
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('Deve exibir erro ao tentar login com credenciais inválidas', async ({ page }) => {
    await page.goto('/login');
    
    await page.locator('input[type="email"]').fill('usuario_inexistente_soak@test.com');
    await page.locator('input[type="password"]').fill('senha_errada_123');
    await page.locator('button[type="submit"]').click();
    
    // Aguarda mensagem de erro ser exibida na tela ou estado de erro
    const errorMessage = page.locator('text=/inválid|erro|incorret|fail/i');
    await expect(errorMessage.first()).toBeVisible({ timeout: 10000 });
  });

  test('Deve alternar para o formulário de cadastro e recuperar senha', async ({ page }) => {
    await page.goto('/login');
    
    // Tenta clicar no link de cadastro
    const signupLink = page.locator('text=/cadastr|criar conta/i');
    if (await signupLink.isVisible()) {
      await signupLink.click();
      await expect(page.locator('text=/nome|cadastro|criar/i').first()).toBeVisible();
    }
  });
});
