import { describe, expect, it } from 'vitest';

import { createIndigoAmbassadorSchema, updateIndigoAmbassadorSchema } from '@/modules/admin';

describe('Embajadores Índigo', () => {
  it('normaliza el correo y conserva únicamente los datos del afiliador', () => {
    const result = createIndigoAmbassadorSchema.safeParse({
      givenName: ' Ana ',
      familyName: ' Pérez ',
      secondFamilyName: '',
      email: ' ANA@EJEMPLO.MX ',
      phone: '',
      territory: 'Chihuahua',
      notes: '',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.email).toBe('ana@ejemplo.mx');
    expect(result.data.secondFamilyName).toBeUndefined();
  });

  it('exige motivo para cambiar datos o estado', () => {
    const result = updateIndigoAmbassadorSchema.safeParse({
      ambassadorId: '01991d2e-5f80-73db-9e7e-4f6389005e12',
      rowVersion: 0,
      givenName: 'Ana',
      familyName: 'Pérez',
      secondFamilyName: '',
      email: 'ana@ejemplo.mx',
      phone: '',
      territory: 'Chihuahua',
      notes: '',
      status: 'SUSPENDED',
      reason: 'corto',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === 'reason')).toBe(true);
  });
});
