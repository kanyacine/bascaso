"use client";

import { useState, type ReactNode } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Submit shortcut, for the fields that save without a separate click. */
  onEnter?: () => void;
  /** Extra controls rendered in the same row, after the reveal button. */
  children?: ReactNode;
  className?: string;
}

/** Masked API key field with a reveal toggle. Whether the key is currently
 *  shown is presentation state with no meaning outside this row, so it lives
 *  here instead of in every caller. */
export function ApiKeyInput({
  value,
  onChange,
  placeholder,
  onEnter,
  children,
  className,
}: ApiKeyInputProps) {
  const [show, setShow] = useState(false);

  // A field emptied by its owner (key saved, key removed, provider switched)
  // must not stay revealed for whatever is typed next. Adjusting during render
  // rather than in an effect – React re-renders before painting, so the input
  // is never shown in the wrong state.
  if (show && value === "") setShow(false);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono text-sm"
        onKeyDown={
          onEnter
            ? (e) => {
                if (e.key === "Enter") onEnter();
              }
            : undefined
        }
      />
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => setShow(!show)}
      >
        {show ? <EyeSlash size={16} /> : <Eye size={16} />}
      </Button>
      {children}
    </div>
  );
}
