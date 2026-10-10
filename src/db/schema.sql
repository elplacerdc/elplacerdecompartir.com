-- PostgreSQL 18 Schema for El Placer de Compartir & The Corset Society
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_nombre VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  whatsapp VARCHAR(50) UNIQUE,
  rol VARCHAR(50) CHECK (rol IN ('hombre_solo', 'mujer_sola', 'pareja', 'otro')),
  ciudad VARCHAR(100) DEFAULT 'Bogotá',
  origen VARCHAR(100) DEFAULT 'web_comunidad',
  afiliado_id VARCHAR(100),
  corset_vip BOOLEAN DEFAULT false,
  primer_pago_acreditado BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS afiliados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias VARCHAR(100) UNIQUE NOT NULL,
  nombre VARCHAR(255),
  whatsapp VARCHAR(50),
  email VARCHAR(255),
  clicks INT DEFAULT 0,
  referidos_pagados INT DEFAULT 0,
  entradas_ganadas INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  evento VARCHAR(100) DEFAULT 'luna_llena',
  tipo_entrada VARCHAR(50) NOT NULL, -- 'pareja', 'single', 'unicornio'
  tipo_pago VARCHAR(50) NOT NULL, -- 'total', 'reserva_40'
  monto_pagado NUMERIC(12, 2) NOT NULL,
  metodo_pago VARCHAR(50), -- 'dlocal_go', 'nequi', 'bre_b'
  referencia_transaccion VARCHAR(255),
  estado VARCHAR(50) DEFAULT 'pendiente', -- 'pendiente', 'confirmado', 'rechazado'
  afiliado_ref VARCHAR(100),
  ticket_hash VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_whatsapp ON leads(whatsapp);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_afiliados_alias ON afiliados(alias);
CREATE INDEX IF NOT EXISTS idx_event_tickets_hash ON event_tickets(ticket_hash);

CREATE TABLE IF NOT EXISTS event_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento VARCHAR(100) NOT NULL,
  concepto VARCHAR(255) NOT NULL,
  monto NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_expenses_evento ON event_expenses(evento);
