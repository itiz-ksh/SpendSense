import * as React from 'react';
import { redirect } from 'next/navigation';
import { DashboardClient } from './components/DashboardClient';
import { getServerSession } from '@/api/middleware/auth';
import { getExpensesByUserId, getUserCreatedAt } from '@/data/expenses';

export default async function DashboardPage() {
  const session = await getServerSession();
  
  if (!session) {
    redirect('/login');
  }

  const [expenses, accountCreatedAt] = await Promise.all([
    getExpensesByUserId(session.userId),
    getUserCreatedAt(session.userId),
  ]);

  return <DashboardClient initialExpenses={expenses} accountCreatedAt={accountCreatedAt} />;
}
