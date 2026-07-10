import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-2 text-body-sm text-[var(--color-text-ink)] ring-offset-[var(--color-canvas-soft)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--color-text-mute)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--color-canvas-soft-2)] disabled:border-[var(--color-hairline-strong)]',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
