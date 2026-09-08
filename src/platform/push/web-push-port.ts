import { createECDH, createCipheriv, hkdfSync, randomBytes, createSign } from 'node:crypto';
import { env } from '@/platform/config/env';
import { logger } from '@/platform/observability/logger';

/**
 * Puerto de notificaciones web con adaptadores intercambiables (PRD §16.2, Fase 9
 * bloque D; ADR-0172).
 *
 * La entrega web es la del estándar: un mensaje cifrado extremo a extremo hacia
 * el navegador de la persona (RFC 8291), firmado ante el servicio de push con
 * VAPID (RFC 8292). El servidor no habla con un SDK de terceros, sino con el
 * endpoint que el propio navegador entregó al suscribirse: es el mismo criterio
 * de «puerto, no SDK» del resto del sistema (ADR-0137). La clave privada VAPID
 * firma cada envío y **vive en el entorno, nunca en la base**.
 */

export interface WebPushSubscription {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

export interface WebPushMessage {
  readonly title: string;
  readonly body: string;
  readonly url: string;
}

export interface WebPushSendResult {
  /** Entregado al servicio de push. */
  readonly delivered: boolean;
  /** El endpoint ya no vale (410/404): la suscripción debe olvidarse. */
  readonly gone: boolean;
  /** Código del servicio de push, cuando lo hubo. */
  readonly statusCode: number | null;
}

export interface WebPushPort {
  readonly name: string;
  readonly capability: 'DELIVERS' | 'LOGS_ONLY' | 'UNAVAILABLE';
  readonly capabilityDetail: string;
  send(subscription: WebPushSubscription, message: WebPushMessage): Promise<WebPushSendResult>;
}

/* -------------------------------------------------------------------------- */
/* Utilidades de base64url y claves                                           */
/* -------------------------------------------------------------------------- */

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/** Clave privada P-256 (32 bytes) a PKCS8, para firmar el JWT de VAPID. */
function rawP256PrivateToPkcs8(privateRaw: Buffer, publicRaw: Buffer) {
  const header = Buffer.from('308187020100301306072a8648ce3d020106082a8648ce3d030107046d306b0201010420', 'hex');
  const mid = Buffer.from('a144034200', 'hex');
  const der = Buffer.concat([header, privateRaw, mid, publicRaw]);
  return { key: der, format: 'der' as const, type: 'pkcs8' as const };
}

/* -------------------------------------------------------------------------- */
/* VAPID (RFC 8292)                                                           */
/* -------------------------------------------------------------------------- */

function vapidHeaders(endpoint: string): { Authorization: string } | null {
  const config = env();
  const priv = config.WEB_PUSH_VAPID_PRIVATE_KEY;
  const pub = config.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const subject = config.WEB_PUSH_VAPID_SUBJECT;
  if (priv === '' || pub === '' || subject === '') return null;

  const audience = new URL(endpoint).origin;
  const header = toBase64Url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = toBase64Url(
    Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject })),
  );
  const signingInput = `${header}.${payload}`;

  const publicRaw = fromBase64Url(pub);
  const privateRaw = fromBase64Url(priv);
  const signer = createSign('SHA256');
  signer.update(signingInput);
  // Firma DER → concatenada r||s de 64 bytes, que es lo que ES256 (JWS) espera.
  const der = signer.sign({ ...rawP256PrivateToPkcs8(privateRaw, publicRaw), dsaEncoding: 'ieee-p1363' });
  const jwt = `${signingInput}.${toBase64Url(der)}`;

  return { Authorization: `vapid t=${jwt}, k=${pub}` };
}

/* -------------------------------------------------------------------------- */
/* Cifrado del contenido (RFC 8291 / aes128gcm RFC 8188)                      */
/* -------------------------------------------------------------------------- */

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync('sha256', ikm, salt, info, length));
}

/** Cifra el mensaje para la suscripción, en codificación aes128gcm. */
function encryptPayload(subscription: WebPushSubscription, plaintext: Buffer): Buffer {
  const uaPublic = fromBase64Url(subscription.keys.p256dh);
  const authSecret = fromBase64Url(subscription.keys.auth);

  const server = createECDH('prime256v1');
  server.generateKeys();
  const serverPublic = server.getPublicKey(); // 65 bytes, sin comprimir
  const sharedSecret = server.computeSecret(uaPublic);

  // PRK combinado (RFC 8291 §3.3): info = "WebPush: info" \0 ua_public server_public
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, serverPublic]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);

  // El registro lleva un delimitador 0x02 (último registro) antes del relleno.
  const record = Buffer.concat([plaintext, Buffer.from([0x02])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  // Cabecera aes128gcm (RFC 8188 §2.1): salt(16) rs(4) idlen(1) keyid(server_public)
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const idlen = Buffer.from([serverPublic.length]);
  return Buffer.concat([salt, rs, idlen, serverPublic, encrypted]);
}

/* -------------------------------------------------------------------------- */
/* Adaptadores                                                                */
/* -------------------------------------------------------------------------- */

const consoleAdapter: WebPushPort = {
  name: 'console',
  capability: 'LOGS_ONLY',
  capabilityDetail: 'adaptador de consola: los avisos web se registran y no salen del servidor',
  send: (subscription) => {
    logger.info('Aviso web no enviado (adaptador de consola)', {
      module: 'push',
      context: { endpoint: new URL(subscription.endpoint).origin },
    });
    return Promise.resolve({ delivered: false, gone: false, statusCode: null });
  },
};

const unavailableAdapter: WebPushPort = {
  name: 'unavailable',
  capability: 'UNAVAILABLE',
  capabilityDetail: 'faltan las claves VAPID (WEB_PUSH_VAPID_*): ningún aviso web saldrá',
  send: () => Promise.resolve({ delivered: false, gone: false, statusCode: null }),
};

const vapidAdapter: WebPushPort = {
  name: 'vapid',
  capability: 'DELIVERS',
  capabilityDetail: 'adaptador VAPID/RFC 8291 configurado',
  send: async (subscription, message) => {
    const headers = vapidHeaders(subscription.endpoint);
    if (headers === null) return { delivered: false, gone: false, statusCode: null };

    const plaintext = Buffer.from(JSON.stringify({ title: message.title, body: message.body, url: message.url }));
    const body = encryptPayload(subscription, plaintext);

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
      },
      body: new Uint8Array(body),
    });

    // 404/410: el navegador retiró la suscripción; hay que olvidarla.
    const gone = response.status === 404 || response.status === 410;
    return { delivered: response.ok, gone, statusCode: response.status };
  },
};

function adapter(): WebPushPort {
  const config = env();
  if (config.WEB_PUSH_VAPID_PRIVATE_KEY === '' || config.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY === '' || config.WEB_PUSH_VAPID_SUBJECT === '') {
    return config.NODE_ENV === 'production' ? unavailableAdapter : consoleAdapter;
  }
  return vapidAdapter;
}

let override: WebPushPort | null = null;

/** Lo que el adaptador vigente puede hacer. Lo consulta la verificación de salud. */
export function webPushCapability(): { capability: WebPushPort['capability']; detail: string; name: string } {
  const port = override ?? adapter();
  return { capability: port.capability, detail: port.capabilityDetail, name: port.name };
}

/** Solo para pruebas: captura los avisos sin salida real. */
export function setWebPushForTests(port: WebPushPort | null): void {
  override = port;
}

export function webPushPort(): WebPushPort {
  return override ?? adapter();
}
