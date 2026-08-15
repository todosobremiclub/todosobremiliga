-- ============================================================================
-- Todo Sobre mi Liga — Esquema inicial de Base de Datos (Fase 1)
-- Motor: PostgreSQL (Render)
-- Ejecutar UNA sola vez contra la base, por ejemplo desde DBeaver o psql.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- necesaria para gen_random_uuid()

-- ============================================================================
-- 1. LIGAS
-- Alta por el Super Admin. Cada Liga es un "tenant" dentro de la plataforma.
-- ============================================================================
CREATE TABLE ligas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            VARCHAR(150) NOT NULL,
  slug              VARCHAR(150) NOT NULL UNIQUE,          -- para URLs del sitio público (/liga/mi-liga)
  logo_url          TEXT,
  direccion         VARCHAR(255),
  telefono          VARCHAR(50),
  email_contacto    VARCHAR(150),
  color_primario    VARCHAR(20),                            -- branding, ej "#0033AA"
  color_secundario  VARCHAR(20),
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. CLUBES
-- Entidad global: un club puede participar en más de una Liga a la vez
-- (por eso NO tiene liga_id directo; la relación va por club_liga).
-- ============================================================================
CREATE TABLE clubes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            VARCHAR(150) NOT NULL,
  logo_url          TEXT,
  direccion         VARCHAR(255),
  telefono          VARCHAR(50),
  email_contacto    VARCHAR(150),
  cuit              VARCHAR(20),
  color_primario    VARCHAR(20),
  color_secundario  VARCHAR(20),
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. CLUB_LIGA
-- Membresía de un club dentro de una liga (many-to-many).
-- ============================================================================
CREATE TABLE club_liga (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id       UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  club_id       UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  fecha_alta    DATE NOT NULL DEFAULT CURRENT_DATE,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (liga_id, club_id)
);

-- ============================================================================
-- 4. USUARIOS
-- Login de todo el sistema. El rol determina qué puede ver/hacer.
-- liga_id / club_id quedan NULL según corresponda al rol.
-- ============================================================================
CREATE TABLE usuarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(150) NOT NULL UNIQUE,
  password_hash   VARCHAR(255),                 -- NULL si el login es 100% Firebase
  firebase_uid    VARCHAR(150) UNIQUE,
  nombre          VARCHAR(150) NOT NULL,
  rol             VARCHAR(30) NOT NULL CHECK (rol IN ('super_admin', 'liga_admin', 'club_admin', 'jugador')),
  liga_id         UUID REFERENCES ligas(id) ON DELETE CASCADE,
  club_id         UUID REFERENCES clubes(id) ON DELETE CASCADE,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login    TIMESTAMPTZ,
  creado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. TORNEOS
-- Acá vive la configuración multi-deporte: cada torneo define su propio
-- deporte, formato de juego y sistema de puntos (jsonb flexible).
-- ============================================================================
CREATE TABLE torneos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id             UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  nombre              VARCHAR(150) NOT NULL,               -- ej "Apertura 2026"
  deporte             VARCHAR(30) NOT NULL CHECK (deporte IN ('futbol', 'voley', 'handball', 'basquet', 'futsal', 'otro')),
  temporada           VARCHAR(20),                          -- ej "2026"
  formato_juego       VARCHAR(30) NOT NULL DEFAULT 'todos_contra_todos'
                        CHECK (formato_juego IN ('todos_contra_todos', 'grupos_playoffs', 'liguilla_ida_vuelta', 'eliminacion_directa')),
  sistema_puntaje     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- ej futbol: {"victoria":3,"empate":1,"derrota":0}
                                                              -- ej voley:  {"3-0":3,"3-1":3,"3-2":2,"2-3":1,"1-3":0,"0-3":0}
  config_extra        JSONB NOT NULL DEFAULT '{}'::jsonb,    -- reglas puntuales del torneo (ida y vuelta, descuentos, etc.)
  fecha_inicio        DATE,
  fecha_fin           DATE,
  estado              VARCHAR(20) NOT NULL DEFAULT 'planificado'
                        CHECK (estado IN ('planificado', 'en_curso', 'finalizado', 'suspendido')),
  creado_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. CATEGORIAS
-- Categorías de juego dentro de un torneo (ej: Primera, Sub-15, Femenino).
-- ============================================================================
CREATE TABLE categorias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id     UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  nombre        VARCHAR(100) NOT NULL,
  genero        VARCHAR(20) CHECK (genero IN ('masculino', 'femenino', 'mixto')),
  edad_minima   INTEGER,
  edad_maxima   INTEGER,
  orden         INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- 7. EQUIPOS_TORNEO
-- Inscripción de un club a una categoría dentro de un torneo.
-- Es la entidad que realmente "juega" el fixture (no el club directamente),
-- porque un mismo club puede tener un equipo en varias categorías.
-- ============================================================================
CREATE TABLE equipos_torneo (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id     UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  categoria_id  UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  club_id       UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  grupo         VARCHAR(20),                     -- ej "Zona A", para formato grupos_playoffs
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (torneo_id, categoria_id, club_id)
);

-- ============================================================================
-- 8. JUGADORES
-- Personas que un club registra como jugadores/socios habilitados a jugar.
-- ============================================================================
CREATE TABLE jugadores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre            VARCHAR(100) NOT NULL,
  apellido          VARCHAR(100) NOT NULL,
  dni               VARCHAR(20) NOT NULL,
  fecha_nacimiento  DATE,
  foto_url          TEXT,
  posicion          VARCHAR(50),
  numero_camiseta   INTEGER,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, dni)
);

-- ============================================================================
-- 9. FICHAJES
-- Solicitud formal de habilitación de un jugador ante una Liga, sujeta a
-- aprobación. Es el corazón del "Módulo de Fichajes".
-- ============================================================================
CREATE TABLE fichajes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador_id        UUID NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  club_id           UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  liga_id           UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  torneo_id         UUID REFERENCES torneos(id) ON DELETE SET NULL,
  categoria_id      UUID REFERENCES categorias(id) ON DELETE SET NULL,
  documentos        JSONB NOT NULL DEFAULT '[]'::jsonb,     -- urls de DNI, foto, certificado médico, etc.
  estado            VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo    TEXT,
  aprobado_por      UUID REFERENCES usuarios(id),
  fecha_solicitud   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_resolucion  TIMESTAMPTZ
);

-- ============================================================================
-- 10. CARNETS
-- Carnet digital que el club presenta el día de partido (una vez aprobado
-- el fichaje).
-- ============================================================================
CREATE TABLE carnets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jugador_id        UUID NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  torneo_id         UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  fichaje_id        UUID REFERENCES fichajes(id) ON DELETE SET NULL,
  codigo_qr         VARCHAR(255) NOT NULL UNIQUE,
  vigente_desde     DATE NOT NULL DEFAULT CURRENT_DATE,
  vigente_hasta     DATE,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 11. PARTIDOS (fixture + resultados)
-- Columnas genéricas para poder representar tanto resultados de "gol"
-- (fútbol, handball, futsal) como de "sets" (vóley).
-- ============================================================================
CREATE TABLE partidos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id             UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  categoria_id          UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  equipo_local_id       UUID NOT NULL REFERENCES equipos_torneo(id) ON DELETE CASCADE,
  equipo_visitante_id   UUID NOT NULL REFERENCES equipos_torneo(id) ON DELETE CASCADE,
  fecha                 DATE,
  hora                  TIME,
  sede                  VARCHAR(150),
  jornada               INTEGER,                             -- número de fecha/ronda
  estado                VARCHAR(20) NOT NULL DEFAULT 'programado'
                          CHECK (estado IN ('programado', 'jugado', 'suspendido', 'walkover', 'cancelado')),
  resultado_local       INTEGER,                              -- goles o sets ganados, según deporte
  resultado_visitante   INTEGER,
  detalle_resultado     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- ej sets de vóley: {"sets":[[25,20],[23,25],[25,18]]}
  observaciones         TEXT,
  creado_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 12. TABLA_POSICIONES
-- Cache/materialización de la tabla de posiciones, recalculada tras cada
-- partido cargado (evita recalcular todo en cada consulta pública).
-- ============================================================================
CREATE TABLE tabla_posiciones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id           UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  categoria_id        UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  equipo_torneo_id    UUID NOT NULL REFERENCES equipos_torneo(id) ON DELETE CASCADE,
  partidos_jugados    INTEGER NOT NULL DEFAULT 0,
  ganados             INTEGER NOT NULL DEFAULT 0,
  empatados           INTEGER NOT NULL DEFAULT 0,
  perdidos            INTEGER NOT NULL DEFAULT 0,
  a_favor             INTEGER NOT NULL DEFAULT 0,
  en_contra           INTEGER NOT NULL DEFAULT 0,
  diferencia          INTEGER NOT NULL DEFAULT 0,
  puntos              INTEGER NOT NULL DEFAULT 0,
  actualizado_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (torneo_id, categoria_id, equipo_torneo_id)
);

-- ============================================================================
-- 13. NOTICIAS
-- ============================================================================
CREATE TABLE noticias (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id         UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  titulo          VARCHAR(200) NOT NULL,
  contenido       TEXT NOT NULL,
  imagen_url      TEXT,
  destacada       BOOLEAN NOT NULL DEFAULT FALSE,
  estado          VARCHAR(20) NOT NULL DEFAULT 'publicada' CHECK (estado IN ('borrador', 'publicada', 'archivada')),
  autor_id        UUID REFERENCES usuarios(id),
  publicado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 14. NOTIFICACIONES
-- Enviadas por la Liga a uno o todos los clubes.
-- ============================================================================
CREATE TABLE notificaciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id       UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  club_id       UUID REFERENCES clubes(id) ON DELETE CASCADE,  -- NULL = para todos los clubes de la liga
  titulo        VARCHAR(200) NOT NULL,
  mensaje       TEXT NOT NULL,
  tipo          VARCHAR(30) NOT NULL DEFAULT 'general',
  enviado_por   UUID REFERENCES usuarios(id),
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notificaciones_lecturas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id   UUID NOT NULL REFERENCES notificaciones(id) ON DELETE CASCADE,
  usuario_id        UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  leida_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (notificacion_id, usuario_id)
);

-- ============================================================================
-- 15. AGENDA_EVENTOS
-- ============================================================================
CREATE TABLE agenda_eventos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id       UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  titulo        VARCHAR(200) NOT NULL,
  descripcion   TEXT,
  fecha         DATE NOT NULL,
  hora          TIME,
  lugar         VARCHAR(200),
  tipo          VARCHAR(30) NOT NULL DEFAULT 'evento' CHECK (tipo IN ('reunion', 'capacitacion', 'evento', 'partido', 'otro')),
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 16. GASTOS / INGRESOS
-- Contabilidad de la Liga (no de los clubes).
-- ============================================================================
CREATE TABLE gastos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id           UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  concepto          VARCHAR(200) NOT NULL,
  categoria         VARCHAR(50),
  monto             NUMERIC(12,2) NOT NULL,
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  comprobante_url   TEXT,
  creado_por        UUID REFERENCES usuarios(id),
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ingresos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id           UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  club_id           UUID REFERENCES clubes(id) ON DELETE SET NULL,  -- ej cuota de afiliación de un club
  concepto          VARCHAR(200) NOT NULL,
  categoria         VARCHAR(50),
  monto             NUMERIC(12,2) NOT NULL,
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  comprobante_url   TEXT,
  creado_por        UUID REFERENCES usuarios(id),
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDICES DE APOYO
-- ============================================================================
CREATE INDEX idx_clubes_liga           ON club_liga (liga_id);
CREATE INDEX idx_usuarios_liga         ON usuarios (liga_id);
CREATE INDEX idx_usuarios_club         ON usuarios (club_id);
CREATE INDEX idx_torneos_liga          ON torneos (liga_id);
CREATE INDEX idx_categorias_torneo     ON categorias (torneo_id);
CREATE INDEX idx_equipos_torneo_torneo ON equipos_torneo (torneo_id, categoria_id);
CREATE INDEX idx_jugadores_club        ON jugadores (club_id);
CREATE INDEX idx_fichajes_estado       ON fichajes (liga_id, estado);
CREATE INDEX idx_partidos_torneo_cat   ON partidos (torneo_id, categoria_id);
CREATE INDEX idx_partidos_fecha        ON partidos (fecha);
CREATE INDEX idx_noticias_liga         ON noticias (liga_id, publicado_at);
CREATE INDEX idx_notificaciones_liga   ON notificaciones (liga_id);
CREATE INDEX idx_gastos_liga_fecha     ON gastos (liga_id, fecha);
CREATE INDEX idx_ingresos_liga_fecha   ON ingresos (liga_id, fecha);
