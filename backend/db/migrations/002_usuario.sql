-- Usuarios con PIN: la identidad (id) es la que figura en las partidas, asi el historial sobrevive a reinicios.
CREATE TABLE IF NOT EXISTS usuario (
  id     VARCHAR(40) PRIMARY KEY,
  nombre VARCHAR(20) NOT NULL,
  clave  VARCHAR(20) NOT NULL UNIQUE,   -- nombre en minusculas: "Ana" y "ana" son la misma persona
  sal    VARCHAR(64) NOT NULL,
  huella VARCHAR(128) NOT NULL,         -- scrypt(PIN, sal); el PIN nunca se guarda
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partida_jugadores_gin ON partida USING GIN ((snapshot->'jugadores') jsonb_path_ops);
