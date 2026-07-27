import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_PASSES = 10;
const LOG_PREFIX = '🧪 [LouvorPlay Soak Test]';

function log(msg) {
  console.log(`${LOG_PREFIX} ${msg}`);
}

async function saveReportToDatabase(passNumber, isFinal = false) {
  try {
    const reportPath = path.resolve(process.cwd(), 'test-results', 'report.json');
    if (!fs.existsSync(reportPath)) {
      log('Aviso: Arquivo report.json não encontrado. (Pode ter falhado antes de gerar)');
      return;
    }
    
    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const stats = reportData.stats || {};
    
    const passedTests = stats.expected || 0;
    const failedTests = stats.unexpected || 0;
    const totalTests = passedTests + failedTests + (stats.skipped || 0) + (stats.flaky || 0);
    const totalTimeMs = stats.duration || 0;
    const status = failedTests > 0 ? 'failed' : 'success';
    
    const { error } = await supabase.from('e2e_reports').insert({
      status: status,
      total_passes: TARGET_PASSES,
      total_tests: totalTests,
      passed_tests: passedTests,
      failed_tests: failedTests,
      total_time_ms: Math.round(totalTimeMs),
      details: { message: `Relatório da Passagem ${passNumber}` } // Salvando leve para não estourar DB
    });

    if (error) throw error;
    log('💾 Relatório oficial enviado para o painel Admin no Supabase.');
  } catch(err) {
    console.error('Falha ao salvar relatório no Supabase:', err.message);
  }
}

function cleanTestArtifacts() {
  log('🧹 Limpando histórico e resíduos de dados de teste...');
  try {
    execSync('node scripts/cleanup_test_data.js', { stdio: 'inherit' });
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
      execSync('npx playwright test', { stdio: 'inherit' });
      log(`✅ PASSAGEM ${currentPass} CONCLUÍDA COM 100% DE SUCESSO!`);
      
      await saveReportToDatabase(currentPass);
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
      await saveReportToDatabase(currentPass);
      process.exit(1);
    }
  }

  console.log('\n===============================================================');
  log(`🎉 SUCESSO ABSOLUTO! ${TARGET_PASSES} PASSAGENS CONSECUTIVAS SEM NENHUM ERRO!`);
  console.log('===============================================================\n');
  process.exit(0);
}

runOrchestrator();
