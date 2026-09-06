import { describe, expect, it } from 'vitest';
import { accesoDeLaFicha, moduloDeLaFicha } from '@/modules/ecosystem/domain/link';

/**
 * La última línea antes de mandar a alguien fuera del sitio.
 *
 * La base ya impone que una dirección guardada sea absoluta y por HTTPS, y esa
 * regla se prueba contra el motor en `ecosystem-schema`. Aquí se prueba lo
 * otro: que **la decisión de enseñar el botón no dependa de que esa regla siga
 * en pie**. Son dos defensas y tienen que ser independientes; si esta función
 * solo funcionara porque la base filtra antes, bastaría relajar la base —o leer
 * de otro sitio algún día— para que apareciera un botón hacia donde no debe.
 *
 * Por eso se prueba con lo que la base nunca dejaría entrar. `javascript:` es
 * el caso que importa: no es una dirección mal escrita, es código ejecutándose
 * en la sesión de quien pulsa.
 */
describe('accesoDeLaFicha', () => {
  it('devuelve la dirección cuando es absoluta y cifrada', () => {
    expect(accesoDeLaFicha('https://cian.example/acceso')).toBe('https://cian.example/acceso');
  });

  it('no devuelve nada cuando no hay dirección', () => {
    expect(accesoDeLaFicha(null)).toBeNull();
  });

  it('trata la cadena vacía como ausencia, no como dirección', () => {
    expect(accesoDeLaFicha('')).toBeNull();
  });

  it('rechaza una dirección sin cifrar', () => {
    expect(accesoDeLaFicha('http://cian.example')).toBeNull();
  });

  it('rechaza una dirección relativa, que no sacaría a nadie del sitio', () => {
    expect(accesoDeLaFicha('/cian')).toBeNull();
  });

  it('rechaza un esquema que ejecuta código en la sesión de quien pulsa', () => {
    expect(accesoDeLaFicha('javascript:alert(1)')).toBeNull();
    expect(accesoDeLaFicha('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rechaza el intento de colar el esquema bueno dentro de otro', () => {
    expect(accesoDeLaFicha('javascript:void("https://cian.example")')).toBeNull();
  });
});

describe('moduloDeLaFicha', () => {
  it('traduce cada acento a su módulo del sistema de diseño', () => {
    expect(moduloDeLaFicha('CIAN')).toBe('cian');
    expect(moduloDeLaFicha('CENI')).toBe('ceni');
    expect(moduloDeLaFicha('ALIANZA')).toBe('alianza');
    expect(moduloDeLaFicha('SINDICATO')).toBe('sindicato');
    expect(moduloDeLaFicha('HERRAMIENTAS')).toBe('herramientas');
  });

  it('una ficha sin acento se pinta como herramienta, no sin color', () => {
    expect(moduloDeLaFicha(null)).toBe('herramientas');
  });
});
