'use client';

import { useState } from "react";
import LiquidityGateway from "@/components/LiquidityGateway";
import DiasporaGateway from "@/components/DiasporaGateway";

type Tab = 'local' | 'diaspora';

export default function Home() {
  const [tab, setTab] = useState<Tab>('local');

  return (
    <main className="flex-1 flex flex-col items-center min-h-screen pt-8 px-4">
      {/* Tab switcher */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-6 w-full max-w-md">
        <button
          onClick={() => setTab('local')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === 'local' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🇿🇼 Zimbabwe
        </button>
        <button
          onClick={() => setTab('diaspora')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
            tab === 'diaspora' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ✈️ Diaspora Send
        </button>
      </div>

      {tab === 'local' ? <LiquidityGateway /> : <DiasporaGateway />}
    </main>
  );
}
