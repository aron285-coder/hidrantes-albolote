// docs/18 RV-36: qué dice comprobar-auth según la configuración de Auth. Solo lee; aquí se prueba la
// lectura de las dos fuentes y la evaluación del riesgo.

import { describe, expect, it } from 'vitest';
import { desdeAjustes, desdeGestion, evaluar } from './comprobar-auth.ts';

describe('comprobar-auth', () => {
  it('lee la Management API', () => {
    expect(desdeGestion({ disable_signup: false, external_email_enabled: true, mailer_autoconfirm: true })).toEqual({
      registroCerrado: false,
      correo: true,
      autoconfirmar: true,
    });
  });

  it('lee /auth/v1/settings', () => {
    expect(desdeAjustes({ disable_signup: true, external: { email: false }, mailer_autoconfirm: false })).toEqual({
      registroCerrado: true,
      correo: false,
      autoconfirmar: false,
    });
  });

  it('registro por correo abierto sin confirmación: riesgo alto', () => {
    expect(evaluar({ registroCerrado: false, correo: true, autoconfirmar: true }).nivel).toBe('alto');
  });

  it('abierto con confirmación: medio', () => {
    expect(evaluar({ registroCerrado: false, correo: true, autoconfirmar: false }).nivel).toBe('medio');
  });

  it('cerrado, o sin correo: bajo', () => {
    expect(evaluar({ registroCerrado: true, correo: true, autoconfirmar: true }).nivel).toBe('bajo');
    expect(evaluar({ registroCerrado: false, correo: false, autoconfirmar: true }).nivel).toBe('bajo');
  });

  // docs/19 RV-68: el vínculo manual de identidades deja unir una cuenta de correo con una de Google.
  it('informa de security_manual_linking_enabled y, activo, lo señala como riesgo para RV-36', () => {
    const e = desdeGestion({ disable_signup: true, security_manual_linking_enabled: true });
    expect(e.vinculoManual).toBe(true);
    const r = evaluar(e);
    expect(r.nivel).toBe('medio');
    expect(r.texto).toMatch(/security_manual_linking_enabled/);
    expect(r.texto).toMatch(/RV-36/);
    expect(evaluar({ ...e, registroCerrado: false, correo: true, autoconfirmar: true }).nivel).toBe('alto');
    // Apagado, o sin saberlo (el endpoint público no lo dice), no cambia nada.
    expect(desdeGestion({ security_manual_linking_enabled: false }).vinculoManual).toBe(false);
    expect(desdeAjustes({ disable_signup: true }).vinculoManual).toBeUndefined();
    expect(evaluar({ registroCerrado: true, correo: true, autoconfirmar: false, vinculoManual: false }).nivel).toBe(
      'bajo',
    );
  });

  it('el texto nunca pide cambiar nada desde aquí: es una recomendación para uniformidad', () => {
    for (const autoconfirmar of [true, false]) {
      expect(evaluar({ registroCerrado: false, correo: true, autoconfirmar }).texto).toMatch(/uniformidad/);
    }
  });
});
