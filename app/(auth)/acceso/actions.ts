'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { login } from '@/modules/identity';
import { logout as endSession } from '@/modules/identity';
import { SESSION_COOKIE, sessionCookieOptions } from '@/platform/auth/session';
import { currentActor, deviceLabelFrom, requestContext } from '@/platform/http/request-context';
import { classifyUserAgent, summarizeUserAgent } from '@/platform/kernel/ids';
import { textField } from '@/platform/http/form-fields';

/**
 * Acciones de servidor del inicio de sesión.
 *
 * Toda la validación ocurre en el servidor. El formulario funciona sin
 * JavaScript: es un `<form>` con `action`, de modo que una conexión lenta o un
 * guion que no cargó no dejan a nadie sin poder entrar (PRD §5.4).
 */

export interface AuthFormState {
  readonly status: 'idle' | 'error';
  readonly message?: string;
  readonly fieldErrors?: Record<string, string[]>;
  /** Segundos que conviene esperar cuando el límite de tasa se activó. */
  readonly retryAfterSeconds?: number;
}

export async function loginAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const context = await requestContext();
  const headerList = await headers();
  const userAgent = headerList.get('user-agent');

  const result = await login(
    {
      email: textField(formData, 'email'),
      password: textField(formData, 'password'),
    },
    {
      correlationId: context.correlationId,
      ipHash: context.ipHash,
      userAgentSummary: summarizeUserAgent(userAgent),
      deviceLabel: deviceLabelFrom(summarizeUserAgent(userAgent)),
    },
  );

  if (!result.ok) {
    const error = result.error;
    return {
      status: 'error',
      message: error.message,
      ...(error.details === undefined ? {} : { fieldErrors: error.details }),
      ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, result.data.token, sessionCookieOptions(result.data.expiresAt, false));

  redirect('/mi/seguridad');
}

export async function logoutAction(): Promise<void> {
  const actor = await currentActor();
  await endSession(actor);

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);

  redirect('/acceso');
}

/** Clasificación del agente, expuesta para las pruebas de registro. */
export async function userAgentClass(): Promise<string> {
  const headerList = await headers();
  return classifyUserAgent(headerList.get('user-agent'));
}
