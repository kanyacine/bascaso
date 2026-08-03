import { db } from "@/db";
import { managedAccount } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/encryption";

export interface ManagedSession {
  email: string;
  accessToken: string;
  refreshToken: string;
  /** Access token expiry, epoch seconds. */
  expiresAt: number;
}

export function saveManagedSession(session: ManagedSession): void {
  const { email, ...tokens } = session;
  const encrypted = encrypt(JSON.stringify({ ...tokens }));
  db.delete(managedAccount).run();
  db.insert(managedAccount).values({
    email,
    encryptedSession: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    encryptedDek: encrypted.encryptedDek,
  }).run();
}

export function getManagedSession(): ManagedSession | null {
  const row = db.select().from(managedAccount).get();
  if (!row) return null;
  const tokens = JSON.parse(decrypt({
    ciphertext: row.encryptedSession,
    iv: row.iv,
    authTag: row.authTag,
    encryptedDek: row.encryptedDek,
  })) as Omit<ManagedSession, "email">;
  return { email: row.email, ...tokens };
}

export function clearManagedSession(): void {
  db.delete(managedAccount).run();
}

/** Is a cloud account linked? Does not decrypt the session: the row's presence is
 *  enough, and this question is asked on every tier resolution – including when the
 *  master key has changed and decryption would throw. */
export function hasManagedAccount(): boolean {
  return db.select({ email: managedAccount.email }).from(managedAccount).get() != null;
}
