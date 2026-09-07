import { logger } from '@/platform/observability/logger';

/**
 * Puerto del proveedor de IA con adaptadores intercambiables (ADR-0016 aplicado
 * a la IA; PRD §15.1, Fase 8).
 *
 * El mismo patrón que el cobro y el correo: una interfaz estrecha, un adaptador
 * de red que se puede sustituir **entero** en las pruebas sin simular un módulo,
 * y una sola dependencia —`fetch`— en lugar del SDK del proveedor. Se decidió
 * así por lo mismo que en ADR-0016: una biblioteca menos que auditar, y un puerto
 * que en las pruebas se reemplaza por un doble que cuenta llamadas, que es como
 * se comprueba la degradación sin inventar una caída (ADR-0130, ADR-0139).
 *
 * **La política no vive aquí.** Este puerto solo habla con el proveedor. Quién
 * puede llamar, con qué límites, qué se registra y cuándo se cae al camino
 * humano lo decide `ai-service.ts`, que es el único que invoca este puerto. Un
 * puerto que además decidiera la política sería un sitio por el que saltársela.
 */

export interface AiGenerateInput {
  /** La clave, ya resuelta por su nombre de variable (ADR-0136). Nunca se registra. */
  readonly apiKey: string;
  readonly model: string;
  readonly systemText: string;
  /** El texto a enviar, ya minimizado o redactado por quien llama. */
  readonly userText: string;
  readonly temperature: number;
  readonly maxOutputTokens: number;
  /** Corte de espera. Sin esto, una petición colgada colgaría el camino asistido. */
  readonly timeoutMs: number;
}

export interface AiGenerateOutput {
  readonly text: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/** El proveedor no respondió a tiempo. Se distingue del error para la bitácora. */
export class AiProviderTimeoutError extends Error {
  constructor(readonly afterMs: number) {
    super(`El proveedor de IA no respondió en ${afterMs} ms.`);
    this.name = 'AiProviderTimeoutError';
  }
}

export interface AiProviderPort {
  readonly name: string;
  generate(input: AiGenerateInput): Promise<AiGenerateOutput>;
}

/* -------------------------------------------------------------------------- */
/* Adaptador HTTP de Gemini — solo servidor                                   */
/* -------------------------------------------------------------------------- */

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * El adaptador de red **no puede correr en el navegador**. Llevaría la clave al
 * cliente, que es justo lo que la regla de `NEXT_PUBLIC_` prohíbe (PRD §21) y lo
 * que el control `C-F8-01` sostiene desde fuera. Este guardia lo impide también
 * desde dentro, en tiempo de ejecución, para que un `import` equivocado falle en
 * voz alta en lugar de filtrar el secreto en silencio.
 */
function assertSoloServidor(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      'El adaptador de Gemini es solo de servidor: llamarlo desde el cliente expondría la clave del proveedor (PRD §15.1).',
    );
  }
}

const geminiHttpAdapter: AiProviderPort = {
  name: 'gemini-http',

  generate: async (input) => {
    assertSoloServidor();

    if (input.apiKey === '') {
      // No debería llegar aquí: el servicio degrada antes de invocar el puerto
      // cuando no hay clave. Se comprueba igual, porque un puerto que manda una
      // petición sin credencial produce un error del proveedor que se confunde
      // con una caída suya.
      throw new Error('El adaptador de Gemini se invocó sin clave. Es un defecto de quien llama: debió degradar antes.');
    }

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), input.timeoutMs);

    try {
      const respuesta = await fetch(
        `${GEMINI_API}/models/${encodeURIComponent(input.model)}:generateContent`,
        {
          method: 'POST',
          // La clave va en la cabecera y no en la dirección: una dirección con la
          // clave dentro acaba en el registro de accesos de cualquier intermediario.
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': input.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: input.systemText }] },
            contents: [{ role: 'user', parts: [{ text: input.userText }] }],
            generationConfig: {
              temperature: input.temperature,
              maxOutputTokens: input.maxOutputTokens,
              // La forma se valida después contra el esquema de la versión del
              // prompt; pedirla en JSON reduce lo que hay que rechazar.
              responseMimeType: 'application/json',
            },
          }),
          signal: controlador.signal,
        },
      );

      if (!respuesta.ok) {
        // El cuerpo del error del proveedor puede citar fragmentos de lo enviado;
        // no se registra. Solo el código, que es lo que hace falta para diagnosticar.
        logger.error('El proveedor de IA rechazó la petición', {
          module: 'ai',
          outcome: 'failed',
          context: { status: respuesta.status },
        });
        throw new Error(`El proveedor de IA respondió ${respuesta.status}.`);
      }

      const payload = (await respuesta.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

      return {
        text,
        promptTokens: payload.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AiProviderTimeoutError(input.timeoutMs);
      }
      throw error;
    } finally {
      clearTimeout(temporizador);
    }
  },
};

/* -------------------------------------------------------------------------- */
/* Selección y sustitución                                                    */
/* -------------------------------------------------------------------------- */

let override: AiProviderPort | null = null;

/** El adaptador vigente. Hoy solo Gemini. */
export function aiProvider(): AiProviderPort {
  return override ?? geminiHttpAdapter;
}

/** Solo para pruebas: sustituye el puerto entero sin tocar la red. */
export function setAiProviderForTests(port: AiProviderPort | null): void {
  override = port;
}
