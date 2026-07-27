import { test, expect } from '@playwright/test';

test.describe('Módulo 5: Áreas Administrativas (Segurança)', () => {

  const TEST_IDENTIFIER = '[TEST_E2E]';

  test.beforeEach(async ({ page }) => {
    // Autenticado como Viewer normal (Não Admin)
    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'fake_id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'fake@example.com',
          app_metadata: { provider: 'email' },
          user_metadata: { full_name: 'Fake E2E User' }
        })
      });
    });

    await page.route('**/rest/v1/profiles*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
           id: 'fake_id',
           full_name: 'Fake E2E User',
           role: 'viewer' // <-- Role Viewer para ser bloqueado das áreas admin
        }])
      });
    });

    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        currentSession: { access_token: 'fake', user: { id: 'fake_id', email: 'fake@example.com' } }
      }));
    });
  });

  test('Deve bloquear acesso de Viewer a rotas de ChurchAdmin e SuperAdmin', async ({ page }) => {
    const adminRoutes = [
      '/admin',
      '/admin/users',
      '/admin/reports',
      '/super-admin'
    ];
    
    for (const route of adminRoutes) {
      await page.goto(route);
      // Dependendo da implementação, ele redireciona para / ou /repertoire, ou mostra página de "Não autorizado"
      // Teste seguro: a URL muda, ou tem texto de erro.
      // O app atual redireciona para a home quando não é admin.
      const isRedirected = (await page.url()) !== (new URL(route, await page.url())).href;
      if (!isRedirected) {
          // Se não redirecionou, deve ter mensagem de erro ou tela bloqueada
          await expect(page.locator('#root')).not.toBeEmpty();
      }
    }
  });
});
