"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface FormDirtyContextValue {
  isDirty: boolean;
  isSaving: boolean;
  setDirty: (dirty: boolean) => void;
  /** Pages register a save handler; the header button calls it. */
  onSave: () => void;
  registerSave: (handler: () => void | Promise<void>) => void;
  /** Pages register a discard handler; the header button calls it. */
  onDiscard: () => void;
  registerDiscard: (handler: () => void) => void;
  /** Guard a navigation action – prompts to save if dirty. */
  guardNavigation: (onProceed: () => void) => void;
  /** Pages call this with current validation errors (empty array = valid). */
  setValidationErrors: (errors: string[]) => void;
  hasValidationErrors: boolean;
}

const FormDirtyContext = createContext<FormDirtyContextValue>({
  isDirty: false,
  isSaving: false,
  setDirty: () => {},
  onSave: () => {},
  registerSave: () => {},
  onDiscard: () => {},
  registerDiscard: () => {},
  guardNavigation: (onProceed) => onProceed(),
  setValidationErrors: () => {},
  hasValidationErrors: false,
});

export function FormDirtyProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);
  const saveRef = useRef<(() => void | Promise<void>) | null>(null);
  const discardRef = useRef<(() => void) | null>(null);
  const validationErrorsRef = useRef<string[]>([]);
  const [hasValidationErrors, setHasValidationErrors] = useState(false);

  const setDirty = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  const registerSave = useCallback((handler: () => void | Promise<void>) => {
    saveRef.current = handler;
  }, []);

  const registerDiscard = useCallback((handler: () => void) => {
    discardRef.current = handler;
  }, []);

  const onDiscard = useCallback(() => {
    if (!discardRef.current) return;
    discardRef.current();
    setIsDirty(false);
  }, []);

  const setValidationErrors = useCallback((errors: string[]) => {
    validationErrorsRef.current = errors;
    setHasValidationErrors(errors.length > 0);
  }, []);

  const onSave = useCallback(async () => {
    if (!saveRef.current) return;
    const errors = validationErrorsRef.current;
    if (errors.length > 0) {
      if (errors.length === 1) {
        toast.error(`Cannot save – ${errors[0]}`);
      } else {
        toast.error(
          `Cannot save – some fields exceed character limits:\n${errors.map((e) => `• ${e}`).join("\n")}`,
        );
      }
      return;
    }
    setIsSaving(true);
    try {
      await saveRef.current();
    } finally {
      setIsSaving(false);
    }
  }, []);

  const guardNavigation = useCallback(
    (onProceed: () => void) => {
      if (!isDirty) {
        onProceed();
        return;
      }
      pendingRef.current = onProceed;
      setGuardOpen(true);
    },
    [isDirty],
  );

  // Auto-close dialog if dirty state clears (e.g. save completed)
  useEffect(() => {
    if (!isDirty && guardOpen) {
      setGuardOpen(false);
      pendingRef.current?.();
      pendingRef.current = null;
    }
  }, [isDirty, guardOpen]);

  function handleDiscard() {
    if (discardRef.current) discardRef.current();
    setIsDirty(false);
    setGuardOpen(false);
    pendingRef.current?.();
    pendingRef.current = null;
  }

  function handleCancel() {
    setGuardOpen(false);
    pendingRef.current = null;
  }

  return (
    <FormDirtyContext.Provider
      value={{ isDirty, isSaving, setDirty, onSave, registerSave, onDiscard, registerDiscard, guardNavigation, setValidationErrors, hasValidationErrors }}
    >
      {children}
      <AlertDialog open={guardOpen} onOpenChange={(open) => !open && handleCancel()}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes that will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormDirtyContext.Provider>
  );
}

export function useFormDirty() {
  return useContext(FormDirtyContext);
}
