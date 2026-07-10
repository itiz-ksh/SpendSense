"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Login failed');
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
        <CardTitle className="text-display-md text-center">Log In</CardTitle>
        <CardDescription className="text-center">
          Enter your email and password to access your account
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
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sign In
            </Button>
          </form>

          <div className="text-center text-body-sm text-[var(--color-text-mute)] mt-4">
            Don't have an account?{' '}
            <Link href="/register" className="text-[var(--color-primary)] hover:underline">
              Sign up
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
