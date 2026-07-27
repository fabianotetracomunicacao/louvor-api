import React, { useState, useEffect } from 'react';
import { DiagnosticsService } from '../services/DiagnosticsService';
import { ShieldCheck, Activity, Database, KeyRound, Globe, HardDrive, Radio, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, Trash2, ChevronRight, Zap, Bot } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

export function AdminDiagnosticsPage() {
  const { isSuperAdmin, isChurchAdmin } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [currentReport, setCurrentReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [latestE2EReport, setLatestE2EReport] = useState(null);

  // Restringe acesso a administradores
  if (!isSuperAdmin && !isChurchAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  useEffect(() => {
    const savedHistory = DiagnosticsService.getHistory();
    setHistory(savedHistory);
    if (savedHistory.length > 0) {
      setCurrentReport(savedHistory[0]);
    }
    DiagnosticsService.fetchLatestE2EReport().then(setLatestE2EReport);
  }, []);

  const handleRunCheckup = async () => {
    setIsRunning(true);
    try {
      const report = await DiagnosticsService.runFullDiagnostics();
      setCurrentReport(report);
      setHistory(DiagnosticsService.getHistory());
      const e2e = await DiagnosticsService.fetchLatestE2EReport();
      setLatestE2EReport(e2e);
    } catch (err) {
      console.error('Erro ao rodar diagnósticos:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleClearHistory = () => {
    DiagnosticsService.clearHistory();
    setHistory([]);
    setCurrentReport(null);
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'Database': return <Database className="w-5 h-5 text-indigo-500" />;
      case 'Auth': return <KeyRound className="w-5 h-5 text-purple-500" />;
      case 'API': return <Globe className="w-5 h-5 text-blue-500" />;
      case 'Storage': return <HardDrive className="w-5 h-5 text-amber-500" />;
      case 'Realtime': return <Radio className="w-5 h-5 text-emerald-500" />;
      default: return <Activity className="w-5 h-5 text-slate-500" />;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ok':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> 100% Operacional
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5" /> Atenção
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800">
            <XCircle className="w-3.5 h-3.5" /> Erro Detectado
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 p-6 md:p-8 text-white shadow-xl border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-black uppercase tracking-wider border border-purple-500/30">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              Painel de Estabilidade & Diagnósticos
            </div>
            <h1 className="text-3xl font-black tracking-tight">Saúde e Estresse do Sistema</h1>
            <p className="text-sm text-slate-300 max-w-xl">
              Monitore a integridade do banco de dados, regras RLS, permissões de autenticação, latência de rede e serviços em tempo real.
            </p>
          </div>

          <button
            onClick={handleRunCheckup}
            disabled={isRunning}
            className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold shadow-lg shadow-purple-600/30 hover:shadow-purple-600/50 transition-all duration-200 disabled:opacity-50 active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-5 h-5 ${isRunning ? 'animate-spin' : ''}`} />
            {isRunning ? 'Executando Checkup...' : 'Rodar Checkup Completo'}
          </button>
        </div>
      </div>

      {/* Main Status Cards */}
      {currentReport ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Overall Health Score Card */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-5">
              <div className={`p-4 rounded-2xl ${
                currentReport.healthScore === 100 
                  ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                  : currentReport.healthScore >= 70
                  ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                  : 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400'
              }`}>
                <Zap className="w-8 h-8" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Score de Saúde</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white">
                  {currentReport.healthScore}%
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentReport.healthScore === 100 ? 'Todos os módulos 100% OK' : 'Atenção em alguns subsistemas'}
                </p>
              </div>
            </div>

            {/* Total Latency Card */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-5">
              <div className="p-4 rounded-2xl bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                <Clock className="w-8 h-8" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Tempo Total do Teste</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white">
                  {currentReport.totalTimeMs} <span className="text-lg font-bold text-slate-400">ms</span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Resposta ultra-rápida das APIs</p>
              </div>
            </div>

            {/* Last Check Timestamp */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-5">
              <div className="p-4 rounded-2xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
                <Activity className="w-8 h-8" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Última Verificação</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white leading-snug">
                  {new Date(currentReport.timestamp).toLocaleTimeString('pt-BR')}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(currentReport.timestamp).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>

          {/* E2E Robots Card */}
          {latestE2EReport && (
            <div className="p-6 rounded-3xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 shadow-sm mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black text-indigo-900 dark:text-indigo-400 flex items-center gap-2">
                  <Bot className="w-6 h-6" />
                  Última Bateria de Testes de Uso (Robôs E2E)
                </h2>
                {latestE2EReport.status === 'success' ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                    <CheckCircle2 className="w-4 h-4" /> Passou em Todos
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800">
                    <XCircle className="w-4 h-4" /> Falhas Detectadas
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-400 uppercase">Testes Passaram</p>
                  <p className="text-2xl font-black text-emerald-600">{latestE2EReport.passed_tests}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-400 uppercase">Testes Falharam</p>
                  <p className="text-2xl font-black text-red-600">{latestE2EReport.failed_tests}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-400 uppercase">Duração (Total)</p>
                  <p className="text-2xl font-black text-slate-700 dark:text-slate-200">
                    {(latestE2EReport.total_time_ms / 1000).toFixed(1)}s
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-400 uppercase">Data da Execução</p>
                  <p className="text-lg font-bold text-slate-700 dark:text-slate-200 mt-1 leading-tight">
                    {new Date(latestE2EReport.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Module Breakdown Grid */}
          <div className="space-y-4">
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              Resultado Detalhado por Módulo
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentReport.modules.map((mod) => (
                <div
                  key={mod.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 transition hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                        {getCategoryIcon(mod.category)}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                          {mod.name}
                        </h3>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Latência: {mod.latencyMs} ms
                        </span>
                      </div>
                    </div>
                    {getStatusBadge(mod.status)}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 font-mono">
                    {mod.details}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 px-4 rounded-3xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
          <Activity className="w-12 h-12 text-slate-400 mx-auto animate-pulse" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">Nenhum Diagnóstico Executado Ainda</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Clique no botão acima para rodar a bateria de testes de saúde e verificar se o banco de dados, APIs e serviços estão 100% operacionais.
          </p>
          <button
            onClick={handleRunCheckup}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Rodar Primeiro Checkup
          </button>
        </div>
      )}

      {/* History Section */}
      {history.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-500" />
              Histórico de Execuções Recentes ({history.length})
            </h2>

            <button
              onClick={handleClearHistory}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-600 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" /> Limpar Histórico
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
            {history.map((h) => (
              <div
                key={h.id}
                onClick={() => setCurrentReport(h)}
                className={`p-4 flex items-center justify-between cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-850 ${
                  currentReport?.id === h.id ? 'bg-purple-50/50 dark:bg-purple-950/20' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${
                    h.healthScore === 100 ? 'bg-emerald-500' : h.healthScore >= 70 ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Checkup {new Date(h.timestamp).toLocaleString('pt-BR')}
                    </p>
                    <p className="text-xs text-slate-400">
                      Score: {h.healthScore}% • Tempo: {h.totalTimeMs} ms
                    </p>
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-slate-400" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
