# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: player.spec.js >> Módulo 2: Player, Cifras e Interação Extrema >> Deve lidar com modo Offline simulado sem quebrar
- Location: tests/e2e/player.spec.js:64:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text="Playlists"')

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - generic:
    - img "Worship"
  - img "LouvorPlay" [ref=f1e5]
  - generic [ref=f1e6]:
    - generic [ref=f1e7]:
      - heading "Bem-vindo de volta" [level=1] [ref=f1e8]
      - paragraph [ref=f1e9]: Entre para acessar suas cifras
    - generic [ref=f1e10]:
      - generic [ref=f1e11]:
        - generic [ref=f1e12]: Email
        - textbox "seu@email.com" [ref=f1e17]
      - generic [ref=f1e18]:
        - generic [ref=f1e19]:
          - generic [ref=f1e20]: Senha
          - button "Esqueci minha senha" [ref=f1e21] [cursor=pointer]
        - generic [ref=f1e22]:
          - textbox "••••••••" [ref=f1e26]
          - button [ref=f1e27] [cursor=pointer]
      - button "Entrar" [ref=f1e31] [cursor=pointer]
    - button "Não tem conta? Cadastre-se" [ref=f1e35] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Módulo 2: Player, Cifras e Interação Extrema', () => {
  4  |   const TEST_IDENTIFIER = '[TEST_E2E]';
  5  | 
  6  |   test.beforeEach(async ({ page }) => {
  7  |     // Interceptar requisição de usuário do Supabase para forçar login válido
  8  |     await page.route('**/auth/v1/user', async route => {
  9  |       await route.fulfill({
  10 |         status: 200,
  11 |         contentType: 'application/json',
  12 |         body: JSON.stringify({
  13 |           id: 'fake_id',
  14 |           aud: 'authenticated',
  15 |           role: 'authenticated',
  16 |           email: 'fake@example.com',
  17 |           app_metadata: { provider: 'email' },
  18 |           user_metadata: { full_name: 'Fake E2E User' }
  19 |         })
  20 |       });
  21 |     });
  22 | 
  23 |     await page.route('**/rest/v1/profiles*', async route => {
  24 |       await route.fulfill({
  25 |         status: 200,
  26 |         contentType: 'application/json',
  27 |         body: JSON.stringify([{
  28 |            id: 'fake_id',
  29 |            full_name: 'Fake E2E User',
  30 |            role: 'editor' // Forçar role de editor para permitir interações
  31 |         }])
  32 |       });
  33 |     });
  34 | 
  35 |     await page.goto('/');
  36 |     await page.evaluate(() => {
  37 |       window.localStorage.setItem('supabase.auth.token', JSON.stringify({
  38 |         currentSession: { access_token: 'fake', user: { id: 'fake_id', email: 'fake@example.com' } }
  39 |       }));
  40 |     });
  41 |   });
  42 | 
  43 |   test('Deve suportar troca ultra-rápida de tonalidades (Transposição Stress Test)', async ({ page }) => {
  44 |     // Acessa uma música qualquer ou o editor para ver cifras
  45 |     // Como dependemos de dados reais, vamos forçar uma visualização se possível, ou usar a barra lateral
  46 |     await page.goto('/repertoire');
  47 |     
  48 |     // Supondo que tem um botão de transposição visível ou podemos acessar uma música
  49 |     // Se o repertório estiver vazio, o teste pode não achar.
  50 |     // Para simular stress, vamos focar na busca:
  51 |     const searchInput = page.locator('input[placeholder*="Buscar"]');
  52 |     
  53 |     // Fuzzing na busca
  54 |     for(let i=0; i<10; i++) {
  55 |        await searchInput.fill(`Música ${i}`);
  56 |        await page.waitForTimeout(50); // Digitação rápida
  57 |        await searchInput.fill('');
  58 |     }
  59 |     
  60 |     // Verificar se a tela não crashou (deve ter a lista ou empty state)
  61 |     await expect(page.locator('.lucide-search')).toBeVisible();
  62 |   });
  63 | 
  64 |   test('Deve lidar com modo Offline simulado sem quebrar', async ({ context, page }) => {
  65 |     await page.goto('/repertoire');
  66 |     
  67 |     // Ficar offline
  68 |     await context.setOffline(true);
  69 |     
  70 |     // Tentar acessar abas que exigem internet
> 71 |     await page.click('text="Playlists"');
     |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  72 |     
  73 |     // O sistema deve tratar lindamente ou exibir o indicador offline
  74 |     // (Dependendo da implementação, pode ter um alerta ou só falhar gracefully)
  75 |     // Apenas validamos que a tela não ficou branca (div#root vazio)
  76 |     const root = page.locator('#root');
  77 |     await expect(root).not.toBeEmpty();
  78 |     
  79 |     // Voltar online
  80 |     await context.setOffline(false);
  81 |   });
  82 | });
  83 | 
```