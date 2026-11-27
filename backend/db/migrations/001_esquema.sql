CREATE TABLE IF NOT EXISTS partida (
  id        VARCHAR(40) PRIMARY KEY,
  modalidad VARCHAR(20) NOT NULL,
  estado    VARCHAR(20) NOT NULL,
  version   INT NOT NULL DEFAULT 0,
  snapshot  JSONB NOT NULL,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ronda_cierre (
  partida_id VARCHAR(40) NOT NULL REFERENCES partida(id),
  ronda      INT NOT NULL,
  cierra_id  VARCHAR(40) NOT NULL,
  deltas     JSONB NOT NULL,
  cerrada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (partida_id, ronda)   -- idempotencia: una sola ronda valida por numero
);
