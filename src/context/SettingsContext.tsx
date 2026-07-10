"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { SYSTEM_CATEGORIES } from '@/data/types';

type ThemeMode = 'light' | 'dark';

interface SettingsContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  categories: string[];
  addCategory: (category: string) => void;
  removeCategory: (category: string) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [categories, setCategoriesState] = useState<string[]>([...SYSTEM_CATEGORIES]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Hydrate from localStorage
    const storedTheme = localStorage.getItem('theme') as ThemeMode;
    if (storedTheme) {
      setThemeState(storedTheme);
      if (storedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      }
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setThemeState('dark');
      document.documentElement.classList.add('dark');
    }

    const storedCats = localStorage.getItem('custom_categories');
    if (storedCats) {
      try {
        const parsed = JSON.parse(storedCats);
        if (Array.isArray(parsed)) {
          setCategoriesState([...SYSTEM_CATEGORIES, ...parsed]);
        }
      } catch (e) {
        // ignore
      }
    }
    setMounted(true);
  }, []);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const addCategory = (category: string) => {
    const trimmed = category.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    
    const newCustoms = [...categories.filter(c => !SYSTEM_CATEGORIES.includes(c)), trimmed];
    localStorage.setItem('custom_categories', JSON.stringify(newCustoms));
    setCategoriesState([...SYSTEM_CATEGORIES, ...newCustoms]);
  };

  const removeCategory = (category: string) => {
    if (SYSTEM_CATEGORIES.includes(category)) return; // Cannot remove system categories
    
    const newCustoms = categories.filter(c => c !== category && !SYSTEM_CATEGORIES.includes(c));
    localStorage.setItem('custom_categories', JSON.stringify(newCustoms));
    setCategoriesState([...SYSTEM_CATEGORIES, ...newCustoms]);
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <SettingsContext.Provider value={{ theme: 'light', setTheme: () => {}, categories: [...SYSTEM_CATEGORIES], addCategory: () => {}, removeCategory: () => {} }}>
        <div style={{ visibility: 'hidden' }}>{children}</div>
      </SettingsContext.Provider>
    );
  }

  return (
    <SettingsContext.Provider value={{ theme, setTheme, categories, addCategory, removeCategory }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
