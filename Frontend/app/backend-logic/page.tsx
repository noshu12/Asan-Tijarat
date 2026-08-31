"use client";

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Terminal,
  Play,
  CheckCircle2,
  Server,
  Database,
  Cpu,
  ShieldCheck,
  Zap,
  RefreshCw,
  Code,
  DollarSign
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface ApiLog {
  id: string;
  timestamp: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  status: number;
  durationMs: number;
  payload: Record<string, unknown>;
  response: Record<string, unknown>;
}

/**
 * 🛠️ BACKEND LOGIC — Developer API simulator playground.
 * Lets visitors preview the backend behaviour: role switching
 * (Shopkeeper / Supplier) and the API playground.
 */
export default function BackendLogicPage() {
  const { role, login } = useAuth();
  const { addToCart, items } = useCart();
  const { showToast } = useToast();

  const [logs, setLogs] = useState<ApiLog[]>([
    {
      id: 'log_1',
      timestamp: new Date().toLocaleTimeString(),
      endpoint: '/api/v1/ai/recommendations?city=Karachi&category=Rice',
      method: 'GET',
      status: 200,
      durationMs: 42,
      payload: { city: 'Karachi', userId: 'usr_shop_1' },
      response: {
        status: 'success',
        algorithm: 'Collaborative_Filtering_v2',
        recommendationsCount: 6,
        topItem: 'Basmati Rice Premium Super Kernel'
      }
    }
  ]);

  const [activeTab, setActiveTab] = useState<'endpoints' | 'triggers' | 'logs'>('endpoints');
  const [selectedLog, setSelectedLog] = useState<ApiLog | null>(null);

  const addLog = (
    endpoint: string,
    method: 'GET' | 'POST',
    payload: Record<string, unknown>,
    response: Record<string, unknown>
  ) => {
    const newLog: ApiLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      endpoint,
      method,
      status: 200,
      durationMs: Math.floor(Math.random() * 60) + 20,
      payload,
      response
    };
    setLogs((prev) => [newLog, ...prev]);
    setSelectedLog(newLog);
  };

  const simulateOrderCreation = () => {
    addLog(
      '/api/v1/orders/create-escrow',
      'POST',
      {
        buyerId: 'usr_shop_1',
        supplierId: 'usr_supp_1',
        items: [{ productId: 'prod_1', qty: 50, price: 4500 }],
        paymentMethod: 'JazzCash_Escrow',
        escrowLocked: true
      },
      {
        orderId: 'ord_' + Math.floor(Math.random() * 9000 + 1000),
        status: 'Confirmed',
        escrowHoldId: 'ESCROW_PK_99214',
        message: 'Funds successfully locked in State Bank approved digital escrow.'
      }
    );
    showToast('Backend: Order created & Escrow locked successfully!', 'success');
  };
  const simulateEscrowPayout = () => {
    addLog(
      '/api/v1/payments/escrow/release',
      'POST',
      {
        orderId: 'AT-2026-001',
        releaseToIban: 'PK89MEZN0001234567890102',
        beneficiary: 'Ahmed Khan Enterprises'
      },
      {
        transferredAmountPKR: 225000,
        '1linkTraceNo': '1LINK_TRX_8849201',
        status: 'SETTLED_TO_SUPPLIER_BANK'
      }
    );
    try {
      confetti({ particleCount: 80, spread: 60 });
    } catch (e) {}
    showToast('Backend: Escrow payout settled to Supplier IBAN!', 'success');
  };
  const simulateAIForecast = () => {
    addLog(
      '/api/v1/ai/forecast',
      'POST',
      {
        productId: 'prod_1',
        city: 'Karachi',
        horizonDays: 30,
        algorithm: 'ARIMA_Prophet_Hybrid'
      },
      {
        forecastId: 'fcst_' + Math.floor(Math.random() * 9000 + 1000),
        predictions: [
          { date: '2026-09-01', demandUnits: 1240, confidence: 0.92 },
          { date: '2026-09-08', demandUnits: 1380, confidence: 0.90 },
          { date: '2026-09-15', demandUnits: 1515, confidence: 0.88 }
        ],
        rmse: 42.3,
        message: 'Demand forecast generated for Mandi Karachi.'
      }
    );
    showToast('Backend: AI demand forecast generated!', 'success');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-900 text-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-800/80 border border-slate-700 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="w-6 h-6 text-amber-400" />
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Backend Logic Simulator & API Playground
              </h1>
              <Badge variant="warning">Developer Inspection Mode</Badge>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Verify that every button in Asan Tijarat triggers active state changes, mock endpoints, and live data payloads.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Current Role:</span>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 uppercase">
              {role}
            </span>
          </div>
        </div>

        {/* Quick Role Switchers */}
        <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            1-Click Role Switcher:
          </span>
          <button
            onClick={() => { login('shopkeeper'); showToast('Switched to Shopkeeper'); }}
            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-white transition"
          >
            🏪 Shopkeeper
          </button>
          <button
            onClick={() => { login('supplier'); showToast('Switched to Supplier'); }}
            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-white transition"
          >
            🏭 Supplier
          </button>
        </div>

        {/* Interactive Triggers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div className="p-5 rounded-2xl bg-slate-800/90 border border-slate-700 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                <Database className="w-4 h-4" />
                <span>Simulate Order Checkout</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Creates a bulk order lot and locks funds in simulated 1-Link escrow.
              </p>
            </div>
            <Button onClick={simulateOrderCreation} className="w-full text-xs font-bold">
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Trigger POST /api/orders
            </Button>
          </div>

          <div className="p-5 rounded-2xl bg-slate-800/90 border border-slate-700 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
                <Cpu className="w-4 h-4" />
                <span>Simulate AI ARIMA Forecast</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Invokes the machine learning time-series demand engine for Pakistan mandis.
              </p>
            </div>
            <Button onClick={simulateAIForecast} className="w-full text-xs font-bold bg-amber-500 hover:bg-amber-600">
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Trigger POST /api/ai/forecast
            </Button>
          </div>

          <div className="p-5 rounded-2xl bg-slate-800/90 border border-slate-700 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2 text-blue-400 text-sm font-bold">
                <DollarSign className="w-4 h-4" />
                <span>Simulate Escrow Bank Payout</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Transfers held escrow funds into supplier&apos;s Meezan / Habib Bank account.
              </p>
            </div>
            <Button onClick={simulateEscrowPayout} className="w-full text-xs font-bold bg-blue-600 hover:bg-blue-700">
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Trigger POST /api/escrow/release
            </Button>
          </div>

        </div>

        {/* Live Terminal & Logs Console */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Logs List */}
          <div className="p-5 rounded-3xl bg-black/40 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
              <span className="font-bold flex items-center gap-1.5">
                <Server className="w-4 h-4 text-emerald-400" />
                Live Request Logs ({logs.length})
              </span>
              <button onClick={() => setLogs([])} className="hover:text-white transition">Clear</button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {logs.map((log) => (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                    selectedLog?.id === log.id
                      ? 'bg-slate-800 border-emerald-500'
                      : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold text-[10px]">
                      {log.method}
                    </span>
                    <span className="text-slate-200 truncate">{log.endpoint}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-emerald-400 font-bold">{log.status} OK</span>
                    <span className="text-slate-500">{log.durationMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* JSON Inspector */}
          <div className="p-5 rounded-3xl bg-black/40 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
              <span className="font-bold flex items-center gap-1.5">
                <Code className="w-4 h-4 text-amber-400" />
                Payload & Response Inspector
              </span>
              <span className="text-[10px] text-slate-500">JSON output</span>
            </div>

            {selectedLog ? (
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-emerald-400 max-h-96 overflow-auto text-[11px] leading-relaxed">
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            ) : (
              <p className="text-slate-500 italic p-6 text-center">
                Click any log or trigger an action to inspect JSON payload.
              </p>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}