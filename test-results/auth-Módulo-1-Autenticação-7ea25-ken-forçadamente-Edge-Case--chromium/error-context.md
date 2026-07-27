# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.js >> Módulo 1: Autenticação, Cadastro e Sessão (Blindagem) >> Deve criar conta de teste, fazer login duplo e expirar token forçadamente (Edge Case)
- Location: tests/e2e/auth.spec.js:45:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text="Criar Conta"')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic:
    - img "Worship"
  - img "LouvorPlay" [ref=e5]
  - generic [ref=e6]:
    - generic [ref=e7]:
      - heading "Bem-vindo de volta" [level=1] [ref=e8]
      - paragraph [ref=e9]: Entre para acessar suas cifras
    - generic [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]: Email
        - textbox "seu@email.com" [ref=e17]
      - generic [ref=e18]:
        - generic [ref=e19]:
          - generic [ref=e20]: Senha
          - button "Esqueci minha senha" [ref=e21] [cursor=pointer]
        - generic [ref=e22]:
          - textbox "••••••••" [ref=e26]
          - button [ref=e27] [cursor=pointer]
      - button "Entrar" [ref=e31] [cursor=pointer]
    - button "Não tem conta? Cadastre-se" [ref=e35] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Módulo 1: Autenticação, Cadastro e Sessão (Blindagem)', () => {
  4  | 
  5  |   const TEST_IDENTIFIER = '[TEST_E2E]';
  6  |   const fuzzedEmail = `fuzzing_${Date.now()}@example.com`;
  7  |   const fuzzedPassword = `Pass!@#${Date.now()}`;
  8  |   
  9  |   test('Deve bloquear tentativas de login maliciosas (Fuzzing) sem quebrar o UI', async ({ page }) => {
  10 |     await page.goto('/login');
  11 |     
  12 |     // Tentar login com SQL Injection e Strings gigantes
  13 |     const maliciousStrings = [
  14 |       "' OR 1=1 --",
  15 |       "<div><script>alert(1)</script></div>",
  16 |       "A".repeat(5000), // Fuzzing de tamanho (ansiedade do usuário/robôs)
  17 |       "🤠🌍🌈🔥" // Emojis (unicode bounds)
  18 |     ];
  19 | 
  20 |     for (const maliciousStr of maliciousStrings) {
  21 |       await page.fill('input[type="email"]', maliciousStr);
  22 |       await page.fill('input[type="password"]', 'senha_qualquer');
  23 |       await page.click('button[type="submit"]');
  24 |       
  25 |       // O UI não deve quebrar (tela branca), deve continuar exibindo o form
  26 |       await expect(page.locator('form')).toBeVisible();
  27 |       // O botão deve voltar ao estado habilitado após falhar
  28 |       await expect(page.locator('button[type="submit"]')).toBeEnabled();
  29 |     }
  30 |   });
  31 | 
  32 |   test('Deve impedir acessos não autenticados a rotas privadas e redirecionar para /login', async ({ page }) => {
  33 |     // Limpar estado
  34 |     await page.context().clearCookies();
  35 |     
  36 |     const privateRoutes = ['/repertoire', '/playlists', '/settings', '/projector'];
  37 |     
  38 |     for (const route of privateRoutes) {
  39 |       await page.goto(route);
  40 |       // Deve sempre redirecionar para login quando não logado
  41 |       await expect(page).toHaveURL(/.*\/login/);
  42 |     }
  43 |   });
  44 | 
  45 |   test('Deve criar conta de teste, fazer login duplo e expirar token forçadamente (Edge Case)', async ({ page }) => {
  46 |     // Interceptar signup
  47 |     await page.route('**/auth/v1/signup', async route => {
  48 |       await route.fulfill({
  49 |         status: 200,
  50 |         contentType: 'application/json',
  51 |         body: JSON.stringify({
  52 |           user: { id: 'fake_new_id', email: fuzzedEmail },
  53 |           session: { access_token: 'fake_token' }
  54 |         })
  55 |       });
  56 |     });
  57 | 
  58 |     // 1. Criar Conta com sufixo de teste
  59 |     await page.goto('/login');
  60 |     
  61 |     // Simula clique rápido ansioso no botão de alternar para cadastro
> 62 |     await page.click('text="Criar Conta"');
     |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  63 |     await page.click('text="Login"');
  64 |     await page.click('text="Criar Conta"');
  65 |     
  66 |     await page.fill('input[type="text"]', `${TEST_IDENTIFIER} Usuário Fuzzing`);
  67 |     await page.fill('input[type="email"]', fuzzedEmail);
  68 |     await page.fill('input[type="password"]', fuzzedPassword);
  69 |     
  70 |     // Duplo clique rápido no submit (Race condition check)
  71 |     await page.click('button[type="submit"]');
  72 |     
  73 |     // Esperar carregamento e dashboard (Repertório)
  74 |     await expect(page).toHaveURL(/.*\/repertoire/, { timeout: 15000 });
  75 |     
  76 |     // 2. Fuzzing no LocalStorage (simular expiração/corrupção de token)
  77 |     await page.evaluate(() => {
  78 |       // Corromper o token do Supabase
  79 |       Object.keys(window.localStorage).forEach(key => {
  80 |         if (key.includes('supabase.auth.token')) {
  81 |           window.localStorage.setItem(key, '{"currentSession":{"access_token":"fake_expired_token"}}');
  82 |         }
  83 |       });
  84 |     });
  85 |     
  86 |     // Recarregar a página com token corrompido
  87 |     await page.reload();
  88 |     
  89 |     // O app deve perceber que a sessão é inválida e deslogar com segurança
  90 |     await expect(page).toHaveURL(/.*\/login/);
  91 |   });
  92 | 
  93 | });
  94 | 
```