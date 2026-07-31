"use client";

import { Check, Circle } from "@phosphor-icons/react";
import { useTranslations } from "@/lib/i18n/locale-context";
import { passwordRules } from "@/lib/managed/client";

/** Live checklist under a new-password field: every rule the account will be held to,
 *  shown before it is broken rather than as a rejection afterwards. Neutral until the
 *  field is touched – a form that opens covered in red errors reads as broken, not
 *  helpful. */
export function PasswordRules({ password, confirm }: { password: string; confirm: string }) {
  const t = useTranslations();
  const touched = password.length > 0;
  return (
    <ul className="space-y-1">
      {passwordRules(password, confirm).map((rule) => (
        <li
          key={rule.key}
          className={`flex items-center gap-1.5 text-xs ${
            rule.ok ? "text-green-600" : touched ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {rule.ok ? <Check size={12} weight="bold" /> : <Circle size={12} />}
          {t(rule.key)}
        </li>
      ))}
    </ul>
  );
}
