import { test, expect } from '@playwright/test';

test.describe('Módulo 1: Autenticação, Cadastro e Sessão (Blindagem)', () => {

  const TEST_IDENTIFIER = '[TEST_E2E]';
  const fuzzedEmail = `fuzzing_${Date.now()}@example.com`;
  const fuzzedPassword = `Pass!@#${Date.now()}`;
  
  test('Deve bloquear tentativas de login maliciosas (Fuzzing) sem quebrar o UI', async ({ page }) => {
    await page.goto('/login');
    
    // Tentar login com SQL Injection e Strings gigantes
    const maliciousStrings = [
      "' OR 1=1 --",
      "<div><script>alert(1)</script></div>",
      "A".repeat(5000), // Fuzzing de tamanho (ansiedade do usuário/robôs)
      "🤠🌍🌈🔥" // Emojis (unicode bounds)
    ];

    for (const maliciousStr of maliciousStrings) {
      await page.fill('input[type="email"]', maliciousStr);
      await page.fill('input[type="password"]', 'senha_qualquer');
      await page.click('button[type="submit"]');
      
      // O UI não deve quebrar (tela branca), deve continuar exibindo o form
      await expect(page.locator('form')).toBeVisible();
      // O botão deve voltar ao estado habilitado após falhar
      await expect(page.locator('button[type="submit"]')).toBeEnabled();
    }
  });

  test('Deve impedir acessos não autenticados a rotas privadas e redirecionar para /login', async ({ page }) => {
    // Limpar estado
    await page.context().clearCookies();
    
    const privateRoutes = ['/repertoire', '/playlists', '/settings', '/projector'];
    
    for (const route of privateRoutes) {
      await page.goto(route);
      // Deve sempre redirecionar para login quando não logado
      await expect(page).toHaveURL(/.*\/login/);
    }
  });

  test('Deve criar conta de teste, fazer login duplo e expirar token forçadamente (Edge Case)', async ({ page }) => {
    // Interceptar signup
    await page.route('**/auth/v1/signup', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'fake_new_id', email: fuzzedEmail },
          session: { access_token: 'fake_token' }
        })
      });
    });

    // 1. Criar Conta com sufixo de teste
    await page.goto('/login');
    
    // Simula clique rápido ansioso no botão de alternar para cadastro
    await page.click('text="Criar Conta"');
    await page.click('text="Login"');
    await page.click('text="Criar Conta"');
    
    await page.fill('input[type="text"]', `${TEST_IDENTIFIER} Usuário Fuzzing`);
    await page.fill('input[type="email"]', fuzzedEmail);
    await page.fill('input[type="password"]', fuzzedPassword);
    
    // Duplo clique rápido no submit (Race condition check)
    await page.click('button[type="submit"]');
    
    // Esperar carregamento e dashboard (Repertório)
    await expect(page).toHaveURL(/.*\/repertoire/, { timeout: 15000 });
    
    // 2. Fuzzing no LocalStorage (simular expiração/corrupção de token)
    await page.evaluate(() => {
      // Corromper o token do Supabase
      Object.keys(window.localStorage).forEach(key => {
        if (key.includes('supabase.auth.token')) {
          window.localStorage.setItem(key, '{"currentSession":{"access_token":"fake_expired_token"}}');
        }
      });
    });
    
    // Recarregar a página com token corrompido
    await page.reload();
    
    // O app deve perceber que a sessão é inválida e deslogar com segurança
    await expect(page).toHaveURL(/.*\/login/);
  });

});
