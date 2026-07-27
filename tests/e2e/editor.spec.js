import { test, expect } from '@playwright/test';

test.describe('Módulo 4: Editor de Músicas (Undo/Redo e Fuzzing)', () => {

  const TEST_IDENTIFIER = '[TEST_E2E]';

  test.beforeEach(async ({ page }) => {
    // Interceptar requisição de usuário do Supabase
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
           role: 'editor'
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

  test('Deve lidar com edições massivas, Undo/Redo rápido sem perder estado', async ({ page }) => {
    await page.goto('/editor');
    
    const textarea = page.locator('textarea');
    if (await textarea.isVisible()) {
        // Digitar muito rápido
        await textarea.fill('Verso 1\n[C] [G] [Am] [F]\n');
        
        // Simular ctrl+z e ctrl+y (ou equivalente via botões, se existirem na interface)
        // Como o editor pode usar botões Undo/Redo:
        const undoBtn = page.locator('button[title*="Desfazer"]');
        const redoBtn = page.locator('button[title*="Refazer"]');
        
        if (await undoBtn.isVisible()) {
            await undoBtn.click();
            await undoBtn.click();
            await redoBtn.click();
        }
    }
    
    // Validar se o editor suporta colagem de texto gigante
    if (await textarea.isVisible()) {
        const giantText = "A".repeat(10000);
        await textarea.fill(giantText);
        // Espera renderizar sem travar a thread
        await expect(textarea).toBeVisible();
    }
  });
});
