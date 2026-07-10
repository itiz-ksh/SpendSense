import * as React from 'react';
import Image from 'next/image';
import { SettingsModal } from './components/SettingsModal';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-black/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {/* Owl Coin Logo */}
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white dark:bg-black flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
              <Image
                src="/owl-logo.png"
                alt="SpendSense AI owl coin logo"
                width={32}
                height={32}
                className="object-contain dark:invert"
                priority
              />
            </div>
            <span className="text-display-md text-[var(--color-text-ink)] tracking-tight">
              SpendSense <span className="font-normal text-[var(--color-text-body)]">AI</span>
            </span>
          </div>
          <nav className="flex items-center space-x-6 text-body-sm text-[var(--color-text-body)]">
            <span className="text-[var(--color-text-ink)] font-medium">Dashboard</span>
            <SettingsModal />
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-6 space-y-8">
        {children}
      </main>
    </div>
  );
}

