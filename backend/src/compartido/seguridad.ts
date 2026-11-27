/**
 * Cabeceras de defensa en profundidad para todo lo que sirve la app.
 * La interfaz no usa scripts ni estilos en linea, asi que la CSP puede ser estricta: aunque algun dia
 * se colara un XSS, el navegador no ejecutaria codigo que no venga de este mismo origen.
 */
export const CABECERAS_SEGURIDAD: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};
