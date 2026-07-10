"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QuickAddForm } from './QuickAddForm';

import { SpendingHeatmap } from './SpendingHeatmap';
import type { ExpenseRecord } from '@/data/types';

interface DashboardClientProps {
  initialExpenses: ExpenseRecord[];
  accountCreatedAt: string | null;
}

export function DashboardClient({ initialExpenses, accountCreatedAt }: DashboardClientProps) {
  const [expenses, setExpenses] = React.useState<ExpenseRecord[]>(initialExpenses);

  // Sync with server-rendered initialExpenses in case of soft navigation
  React.useEffect(() => {
    setExpenses(initialExpenses);
  }, [initialExpenses]);

  // Calculate real metrics based on the reactive state
  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);

  const categoryTotals = expenses.reduce((acc, e) => {
    const amt = parseFloat(e.amount.toString());
    acc[e.category] = (acc[e.category] || 0) + amt;
    return acc;
  }, {} as Record<string, number>);
  
  let topCategory = 'N/A';
  let topCategoryPercentage = 0;
  
  if (totalSpent > 0) {
    const topEntry = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    if (topEntry) {
      topCategory = topEntry[0];
      topCategoryPercentage = Math.round((topEntry[1] / totalSpent) * 100);
    }
  }

  const handleAddSuccess = (newExpenses: ExpenseRecord[]) => {
    setExpenses(prev => [...newExpenses, ...prev]);
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-display-lg text-[var(--color-text-ink)]">Overview</h1>
          <p className="text-body-sm text-[var(--color-text-body)]">Welcome back. Here is your recent financial activity.</p>
        </div>
        <div className="flex items-center gap-3">
          <QuickAddForm onAddSuccess={handleAddSuccess} />
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm-strong text-[var(--color-text-body)]">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-display-xl font-mono tabular-nums tracking-tight">
              ${totalSpent.toFixed(2)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm-strong text-[var(--color-text-body)]">Top Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-display-lg tracking-tight">{topCategory}</div>
            <p className="text-body-sm text-[var(--color-text-mute)] pt-1">{topCategoryPercentage}% of your total spend</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-body-sm-strong text-[var(--color-text-body)]">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-display-lg tracking-tight">{expenses.length}</div>
            <p className="text-body-sm text-[var(--color-text-mute)] pt-1">Logged expenses</p>
          </CardContent>
        </Card>
      </div>

      {/* Spending Heatmap */}
      <SpendingHeatmap expenses={expenses} accountCreatedAt={accountCreatedAt} />

      {/* Ledger History List */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Ledger</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="text-caption-mono text-[var(--color-text-mute)] border-b border-[var(--color-hairline)] uppercase">
                <tr>
                  <th className="pb-3 px-4 font-normal">Date</th>
                  <th className="pb-3 px-4 font-normal">Description</th>
                  <th className="pb-3 px-4 font-normal">Category</th>
                  <th className="pb-3 px-4 font-normal text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-hairline)]">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[var(--color-text-mute)]">
                      No transactions found. Click "Quick Add" to log your first expense.
                    </td>
                  </tr>
                ) : (
                  expenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-[var(--color-canvas-soft-2)] transition-colors group">
                      <td className="py-4 px-4 text-[var(--color-text-body)] whitespace-nowrap">
                        {expense.date}
                      </td>
                      <td className="py-4 px-4 font-medium text-[var(--color-text-ink)]">
                        {expense.description}
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-pill-sm)] text-xs font-medium bg-[var(--color-canvas-soft-2)] text-[var(--color-text-ink)] border border-[var(--color-hairline)]">
                          {expense.category}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-mono tabular-nums font-medium text-[var(--color-text-ink)]">
                        ${parseFloat(expense.amount.toString()).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
