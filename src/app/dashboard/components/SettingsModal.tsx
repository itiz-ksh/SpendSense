"use client";

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Plus, Moon, Sun, User, Palette, Tags, MessageSquare } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Tab = 'Account' | 'Appearance' | 'Customisation' | 'Feedback';

export function SettingsModal() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme, categories, addCategory, removeCategory } = useSettings();
  const [newCategory, setNewCategory] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('Account');

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategory.trim()) {
      addCategory(newCategory);
      setNewCategory('');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <span
          className="hover:text-[var(--color-text-ink)] cursor-pointer transition-colors font-medium text-body-sm"
          role="button"
          tabIndex={0}
        >
          Settings
        </span>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 flex w-full max-w-3xl translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-2xl shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md border border-white/20 dark:border-white/10 text-zinc-800 dark:text-zinc-100 min-h-[500px]">
          
          {/* Sidebar */}
          <div className="w-64 border-r border-zinc-200/50 dark:border-zinc-800/50 flex flex-col bg-white/30 dark:bg-zinc-950/30">
            <div className="p-6 pb-2">
              <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
            </div>
            
            <div className="flex-1 px-3 py-2 space-y-1">
              <button
                onClick={() => setActiveTab('Account')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'Account' 
                    ? 'bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white' 
                    : 'hover:bg-zinc-200/30 dark:hover:bg-zinc-800/30 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <User className="w-4 h-4" /> Account
              </button>
              
              <button
                onClick={() => setActiveTab('Appearance')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'Appearance' 
                    ? 'bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white' 
                    : 'hover:bg-zinc-200/30 dark:hover:bg-zinc-800/30 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <Palette className="w-4 h-4" /> Appearance
              </button>
              
              <button
                onClick={() => setActiveTab('Customisation')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'Customisation' 
                    ? 'bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white' 
                    : 'hover:bg-zinc-200/30 dark:hover:bg-zinc-800/30 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <Tags className="w-4 h-4" /> Customisation
              </button>
            </div>

            <div className="p-3">
              <button
                onClick={() => setActiveTab('Feedback')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'Feedback' 
                    ? 'bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white' 
                    : 'hover:bg-zinc-200/30 dark:hover:bg-zinc-800/30 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <MessageSquare className="w-4 h-4" /> Provide Feedback
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 relative flex flex-col">
            <Dialog.Close asChild>
              <button
                className="absolute right-4 top-4 rounded-full p-1.5 opacity-70 transition-opacity hover:opacity-100 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 focus:outline-none"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
            
            <div className="p-8 flex-1 overflow-y-auto">
              {activeTab === 'Account' && (
                <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2">
                  <div>
                    <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Account Profile</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Manage your basic account information.</p>
                  </div>
                  <div className="bg-white/50 dark:bg-zinc-950/50 rounded-xl p-5 border border-zinc-200/50 dark:border-zinc-800/50 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xl font-medium text-zinc-900 dark:text-zinc-100">
                      JD
                    </div>
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">John Doe</div>
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">john.doe@example.com</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'Appearance' && (
                <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2">
                  <div>
                    <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Appearance</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Customize how SpendSense AI looks on your device.</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setTheme('light')}
                      className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${
                        theme === 'light' 
                          ? 'border-zinc-900 dark:border-zinc-100 bg-white/80 dark:bg-zinc-800/80 shadow-md scale-[1.02]' 
                          : 'border-zinc-200/50 dark:border-zinc-800/50 bg-white/30 dark:bg-zinc-900/30 hover:bg-white/50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <Sun className="w-8 h-8 mb-3 text-zinc-900 dark:text-zinc-100" />
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">Light Mode</span>
                    </button>
                    
                    <button
                      onClick={() => setTheme('dark')}
                      className={`flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${
                        theme === 'dark' 
                          ? 'border-zinc-900 dark:border-zinc-100 bg-white/80 dark:bg-zinc-800/80 shadow-md scale-[1.02]' 
                          : 'border-zinc-200/50 dark:border-zinc-800/50 bg-white/30 dark:bg-zinc-900/30 hover:bg-white/50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <Moon className="w-8 h-8 mb-3 text-zinc-900 dark:text-zinc-100" />
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">Dark Mode</span>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'Customisation' && (
                <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2">
                  <div>
                    <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Payment Classifications</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                      Manage labels used to categorize your transactions. System labels cannot be removed.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const isSystem = ['Food', 'Rent', 'Entertainment', 'Others'].includes(cat);
                      return (
                        <div
                          key={cat}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/50 dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50 text-sm"
                        >
                          <span className="text-zinc-900 dark:text-zinc-100">{cat}</span>
                          {!isSystem && (
                            <button
                              onClick={() => removeCategory(cat)}
                              className="text-zinc-500 hover:text-red-500 transition-colors focus:outline-none ml-1"
                              aria-label={`Remove ${cat}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <form onSubmit={handleAddCategory} className="flex items-center gap-2 pt-2">
                    <Input
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      placeholder="New label (e.g. Utilities)"
                      className="flex-1 bg-white/50 dark:bg-zinc-950/50 border-zinc-200/50 dark:border-zinc-800/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    />
                    <Button type="submit" disabled={!newCategory.trim()} className="gap-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900">
                      <Plus className="w-4 h-4" /> Add
                    </Button>
                  </form>
                </div>
              )}

              {activeTab === 'Feedback' && (
                <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2">
                  <div>
                    <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Provide Feedback</h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Help us improve SpendSense AI.</p>
                  </div>
                  <div className="space-y-4">
                    <textarea 
                      className="w-full h-32 p-3 rounded-lg bg-white/50 dark:bg-zinc-950/50 border border-zinc-200/50 dark:border-zinc-800/50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                      placeholder="What's on your mind?"
                    />
                    <Button className="bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900">
                      Submit Feedback
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
