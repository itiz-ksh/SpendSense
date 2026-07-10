"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

const COMMON_CURRENCIES = [
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'GBP', label: 'British Pound (£)' },
  { code: 'CAD', label: 'Canadian Dollar (C$)' },
  { code: 'AUD', label: 'Australian Dollar (A$)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'INR', label: 'Indian Rupee (₹)' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [currency, setCurrency] = React.useState('USD');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password, 
          currency, 
          country: 'US' // Defaulted for simplicity
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Registration failed');
      }

      router.refresh();
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="shadow-[var(--shadow-high)]">
      <CardHeader className="space-y-1">
        <CardTitle className="text-display-md text-center">Create an account</CardTitle>
        <CardDescription className="text-center">
          Enter your email below to create your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Button variant="secondary" className="w-full text-body-sm text-[var(--color-text-mute)] cursor-not-allowed">
              Google
            </Button>
            <Button variant="secondary" className="w-full text-body-sm text-[var(--color-text-mute)] cursor-not-allowed">
              Apple
            </Button>
          </div>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[var(--color-hairline-strong)]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[var(--color-canvas)] px-2 text-[var(--color-text-mute)]">
                Or continue with
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3 text-body-sm text-red-600 bg-red-50 border border-red-200 rounded-[var(--radius-sm)]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-body-sm-strong text-[var(--color-text-ink)]" htmlFor="email">Email</label>
              <Input 
                id="email" 
                type="email" 
                placeholder="m@example.com" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-body-sm-strong text-[var(--color-text-ink)]" htmlFor="password">Password</label>
              <Input 
                id="password" 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-body-sm-strong text-[var(--color-text-ink)]" htmlFor="currency">Primary Currency</label>
              <select 
                id="currency"
                className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-2 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sign Up
            </Button>
          </form>

          <div className="text-center text-body-sm text-[var(--color-text-mute)] mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-[var(--color-primary)] hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
