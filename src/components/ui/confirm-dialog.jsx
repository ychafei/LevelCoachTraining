import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ConfirmDialog({
  open,
  onOpenChange,
  title = 'Are you sure?',
  description,
  consequences = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  requireTyped,
  onConfirm,
}) {
  const [typed, setTyped] = useState('');
  // Reset the typed value every time the dialog opens so a previous match doesn't
  // carry over into the next confirm prompt.
  useEffect(() => { if (open) setTyped(''); }, [open]);

  const typedOk = !requireTyped || typed === requireTyped;

  const actionClass =
    variant === 'destructive'
      ? cn(buttonVariants(), 'bg-red-600 text-white hover:bg-red-700')
      : cn(buttonVariants());

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-bold tracking-[-0.01em]">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {consequences.length > 0 && (
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            {consequences.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
        {requireTyped && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground mb-1.5">
              Type <code className="font-mono bg-secondary text-foreground px-1.5 py-0.5 rounded text-[11px]">{requireTyped}</code> to confirm.
            </p>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireTyped}
              className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="font-semibold">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!typedOk}
            onClick={onConfirm}
            className={cn(
              actionClass,
              'font-semibold',
              !typedOk && 'opacity-50 cursor-not-allowed pointer-events-none',
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useConfirm() {
  const [state, setState] = useState({ open: false, opts: {} });
  const resolverRef = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ open: true, opts });
    });
  }, []);

  const handleOpenChange = useCallback((open) => {
    if (!open && resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setState((s) => ({ ...s, open }));
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
    setState((s) => ({ ...s, open: false }));
  }, []);

  const dialog = (
    <ConfirmDialog
      open={state.open}
      onOpenChange={handleOpenChange}
      onConfirm={handleConfirm}
      {...state.opts}
    />
  );

  return { confirm, dialog };
}
