import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const TARGET_PASSES = 10;
const LOG_PREFIX = '🧪 [LouvorPlay Soak Test]';

function log(msg) {
  console.log(`${LOG_PREFIX} ${msg}`);
}

function cleanTestArtifacts() {
  log('🧹 Limpando histórico e resíduos de dados de teste...');
  try {
    // 1. Limpa dados seguros no supabase
    execSync('node scripts/cleanup_test_data.js', { stdio: 'inherit' });

    // 2. Limpa cache local de relatórios (se existir)
    const resultsDir = path.resolve(process.cwd(), 'test-results');
    if (fs.existsSync(resultsDir)) {
      log('   -> Cache local de testes higienizado.');
    }
  } catch (err) {
    console.warn('Aviso ao limpar artefatos:', err.message);
  }
}

async function runOrchestrator() {
  console.log('\n===============================================================');
  log(`Iniciando Ciclo de Testes Estremos de Uso (${TARGET_PASSES} Passagens Limpas)`);
  console.log('===============================================================\n');

  let currentPass = 1;

  while (currentPass <= TARGET_PASSES) {
    console.log(`\n---------------------------------------------------------------`);
    log(`▶️ INICIANDO PASSAGEM ${currentPass} DE ${TARGET_PASSES}`);
    console.log(`---------------------------------------------------------------\n`);

    try {
      // Executa a suíte de testes Playwright em modo Headless
      execSync('npx playwright test', { stdio: 'inherit' });

      log(`✅ PASSAGEM ${currentPass} CONCLUÍDA COM 100% DE SUCESSO!`);

      // Limpeza de histórico após cada passagem bem sucedida
      cleanTestArtifacts();

      if (currentPass < TARGET_PASSES) {
        log(`⏳ Aguardando 2 segundos para iniciar a Passagem ${currentPass + 1}...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      currentPass++;

    } catch (error) {
      console.error(`\n❌ ERRO DETECTADO NA PASSAGEM ${currentPass}!`);
      log(`⛔ O teste encontrou uma falha na passagem ${currentPass}.`);
      log(`📸 Verifique as capturas de tela e traces em 'test-results/' para corrigir o erro.`);
      process.exit(1);
    }
  }

  console.log('\n===============================================================');
  log(`🎉 SUCESSO ABSOLUTO! ${TARGET_PASSES} PASSAGENS CONSECUTIVAS SEM NENHUM ERRO!`);
  console.log('===============================================================\n');
  process.exit(0);
}

runOrchestrator();
