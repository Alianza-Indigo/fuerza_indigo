'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { transaction } from '@/platform/db/unit-of-work';
import {
  issueSession,
  resolveSession,
  revokeSession,
  SUPERADMIN_COOKIE,
  sessionCookieOptions,
} from '@/platform/auth/session';
import { currentRootSessionVersion, rootActorId, verifyRootCredentials } from '@/platform/auth/superadmin';
import { checkRateLimit, RATE_LIMITS } from '@/platform/auth/rate-limit';
import { maskEmail, recordSecurity } from '@/platform/audit/audit-service';
import { requestContext } from '@/platform/http/request-context';
import { summarizeUserAgent } from '@/platform/kernel/ids';
import { textField } from '@/platform/http/form-fields';

export interface RootLoginState {
  readonly status: 'idle' | 'error';
  readonly message?: string;
  readonly retryAfterSeconds?: number;
}

/**
 * Acceso del Superadmin raíz (PRD §4.4).
 *
 * Su sesión es independiente de la ordinaria: cookie propia, vigencia corta y
 * `SameSite=Strict`. El límite de tasa es mucho más estrecho que el ordinario
 * por lo que está en juego, y **cada** intento —acierte o falle— deja rastro.
 */
export async function rootLoginAction(_previous: RootLoginState, formData: FormData): Promise<RootLoginState> {
  const context = await requestContext();
  const headerList = await headers();
  const email = textField(formData, 'email').trim();
  const masked = email === '' ? null : maskEmail(email);

  const limit = await checkRateLimit('SUPERADMIN_LOGIN', { ipHash: context.ipHash }, RATE_LIMITS.superadminLogin);
  if (!limit.allowed) {
    await transaction((tx) =>
      recordSecurity(tx, {
        kind: 'RATE_LIMITED',
        severity: 'CRITICAL',
        subjectLabel: masked,
        ipHash: context.ipHash,
        detail: { flow: 'superadmin_login' },
        correlationId: context.correlationId,
      }),
    );
    return {
      status: 'error',
      message: 'Demasiados intentos. Espera antes de volver a intentarlo.',
      retryAfterSeconds: limit.retryAfterSeconds,
    };
  }

  const check = await verifyRootCredentials(email, textField(formData, 'password'));

  // El evento se registra en ambos casos: un acceso raíz correcto es tan digno
  // de alerta como uno fallido.
  await transaction((tx) =>
    recordSecurity(tx, {
      kind: 'SUPERADMIN_LOGIN',
      severity: 'CRITICAL',
      subjectLabel: masked,
      ipHash: context.ipHash,
      userAgentClass: context.userAgentClass,
      detail: { outcome: check.ok ? 'correcto' : 'fallido' },
      correlationId: context.correlationId,
    }),
  );

  if (!check.ok) {
    return { status: 'error', message: 'El correo o la contraseña no coinciden.' };
  }

  const actorId = await rootActorId();
  const session = await transaction((tx) =>
    issueSession(tx, {
      userId: null,
      actorKind: 'ROOT_SUPERADMIN',
      sessionVersion: currentRootSessionVersion(),
      ipHash: context.ipHash,
      userAgentSummary: summarizeUserAgent(headerList.get('user-agent')),
      deviceLabel: 'Acceso de Superadmin',
    }),
  );

  void actorId;

  const cookieStore = await cookies();
  cookieStore.set(SUPERADMIN_COOKIE, session.token, sessionCookieOptions(session.expiresAt, true));

  redirect('/superadmin');
}

/**
 * Cierre de la sesión raíz.
 *
 * Revoca la fila en la base **antes** de borrar la cookie. Borrar solo la cookie
 * dejaba el testigo válido hasta vencer: quien lo hubiera copiado —de un
 * registro, de una captura, de un equipo compartido— seguía dentro después de
 * que la persona creyera haber salido (`D-F1-014`). La cookie es la copia que
 * tiene el navegador; la sesión es la fila.
 */
export async function rootLogoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SUPERADMIN_COOKIE)?.value ?? null;

  if (token !== null) {
    const context = await requestContext();
    const sesion = await resolveSession(token);
    if (sesion !== null) {
      await transaction(async (tx) => {
        await revokeSession(tx, sesion.sessionId, 'LOGOUT');
        await recordSecurity(tx, {
          kind: 'SUPERADMIN_ACTION',
          severity: 'WARNING',
          detail: { accion: 'cierre de sesión raíz' },
          subjectLabel: null,
          ipHash: context.ipHash,
          correlationId: context.correlationId,
        });
      });
    }
  }

  cookieStore.delete(SUPERADMIN_COOKIE);
  redirect('/superadmin/login');
}
