'use client';

import { useActionState, useState } from 'react';
import { ErrorNotice, Field, RadioGroup, Select, SubmitButton, SuccessNotice } from '@/design-system/primitives';
import { createRedirectAction, type RedirectState } from './actions';

const INICIAL: RedirectState = { status: 'idle' };

/**
 * Alta de una redirección.
 *
 * El destino es una cosa o la otra, nunca las dos, y el formulario lo enseña
 * así en vez de dejar dos campos donde solo uno cuenta. Sin JavaScript se ven
 * los dos campos y el módulo rechaza el envío que traiga ambos: la validación
 * de verdad está donde está probada.
 */
export function RedirectForm({ paginas }: { paginas: readonly { id: string; label: string }[] }) {
  const hayPaginas = paginas.length > 0;
  const [estado, accion, pendiente] = useActionState(createRedirectAction, INICIAL);
  const [tipo, setTipo] = useState<'PAGINA' | 'RUTA'>(hayPaginas ? 'PAGINA' : 'RUTA');
  const errores = estado.fieldErrors ?? {};

  return (
    <form action={accion} className="space-y-6">
      {estado.status === 'error' && estado.message !== undefined && <ErrorNotice title={estado.message} />}
      {estado.status === 'ok' && <SuccessNotice title={estado.message ?? 'Creada'} />}

      <Field
        name="fromSlug"
        label="Dirección vieja"
        hint="Sin la barra inicial. Por ejemplo: comunicado-2025."
        required
        {...(errores['fromSlug'] === undefined ? {} : { errors: errores['fromSlug'] })}
      />

      <RadioGroup
        name="tipoDeDestino"
        legend="¿A dónde lleva?"
        options={
          hayPaginas
            ? [
                {
                  value: 'PAGINA',
                  label: 'A una página del gestor',
                  hint: 'La redirección sigue a la página si cambia de dirección.',
                },
                {
                  value: 'RUTA',
                  label: 'A una ruta fija',
                  hint: 'Para destinos que no son páginas del gestor, como /noticias.',
                },
              ]
            : [
                {
                  value: 'RUTA',
                  label: 'A una ruta fija',
                  hint: 'Para apuntar a una página del gestor hacen falta facultades para consultarlo, y tu nombramiento no las tiene.',
                },
              ]
        }
        value={tipo}
        onChange={(valor) => setTipo(valor as 'PAGINA' | 'RUTA')}
        {...(errores['toPageId'] === undefined ? {} : { errors: errores['toPageId'] })}
      />

      {tipo === 'PAGINA' ? (
        <Select
          name="destino"
          label="Página de destino"
          required
          options={paginas.map((pagina) => ({ value: pagina.id, label: pagina.label }))}
          {...(errores['toPageId'] === undefined ? {} : { errors: errores['toPageId'] })}
        />
      ) : (
        <Field
          name="destino"
          label="Ruta de destino"
          hint="Empieza con una barra. Por ejemplo: /noticias."
          required
          {...(errores['toPath'] === undefined ? {} : { errors: errores['toPath'] })}
        />
      )}

      <RadioGroup
        name="permanent"
        legend="¿Es definitiva?"
        help="Una redirección permanente le dice a los buscadores que trasladen lo que ya tenían. Una temporal no."
        options={[
          { value: 'PERMANENTE', label: 'Sí, el contenido se mudó para quedarse' },
          { value: 'TEMPORAL', label: 'No, es por ahora' },
        ]}
        value="PERMANENTE"
      />

      <SubmitButton>{pendiente ? 'Creando…' : 'Crear la redirección'}</SubmitButton>
      <p aria-live="polite" className="sr-only">
        {pendiente ? 'Creando la redirección' : ''}
      </p>
    </form>
  );
}
