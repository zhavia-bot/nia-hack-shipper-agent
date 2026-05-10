"use client";

import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <motion.button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onCancel}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <div className="mt-2 text-sm text-muted-foreground">{body}</div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={busy}
              >
                {cancelLabel}
              </Button>
              <Button
                size="sm"
                variant={destructive ? "destructive" : "default"}
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? "Working…" : confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
