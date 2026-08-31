-- Wine Radar — full schema
-- Run this in the Supabase SQL Editor for a new project.

create extension if not exists "uuid-ossp";

-- Watchlist: producers / regions / varietals the digest prioritises
create table if not exists watchlist (
  id uuid primary key default uuid_generate_v4(),
  label text not null,
  category text not null,            -- 'producer' | 'region' | 'varietal' | 'topic'
  priority int default 2,            -- 1 = core, 2 = secondary, 3 = broad interest
  active boolean default true,
  created_at timestamptz default now()
);

-- Critic/publication sources for the standard research sections
create table if not exists sources (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  critic text,
  tier int not null,                 -- 0 = industry data, 1 = independent anchor, 2 = commercially embedded, 3 = narrative, 4 = local/actionable
  active boolean default true,
  created_at timestamptz default now()
);

-- Substack writers, tracked separately from the critic tier system.
-- Ranking is A (high-value) through D (low signal/noise), not fixed - the research
-- itself is expected to promote/demote writers and propose new ones over time.
create table if not exists substack_writers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  publication text,                  -- e.g. "Everyday Drinking", "The Sauce"
  tier text not null default 'B' check (tier in ('A', 'B', 'C', 'D')),
  strength_area text,                -- e.g. "Burgundy", "value", "emerging producers"
  ranking_notes text,                -- why they're at this tier, updated as it changes
  active boolean default true,
  created_at timestamptz default now()
);

-- Recent purchases - feeds the Hit List so it builds on what the collector already has, not just repeats it
create table if not exists purchases (
  id uuid primary key default uuid_generate_v4(),
  description text not null,
  purchased_at date,
  created_at timestamptz default now()
);

-- Forwarded emails / notes - subscriber-only info (release dates, allocations) awaiting the next generation
create table if not exists captures (
  id uuid primary key default uuid_generate_v4(),
  raw_text text not null,
  created_at timestamptz default now(),
  consumed boolean default false     -- marked true once folded into an issue
);

-- Issues: stored as an array of {key, label, text, updated_at} sections, not one blob -
-- this lets each future generation compare against the matching prior section specifically.
create table if not exists issues (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  title text not null,
  sections jsonb not null,           -- [{ key, label, text, queries, updated_at }]
  status text default 'complete'     -- 'complete' | 'partial' (some sections failed)
);

-- Seed watchlist
insert into watchlist (label, category, priority) values
  ('Moss Wood', 'producer', 1),
  ('Cullen', 'producer', 1),
  ('Woodlands', 'producer', 1),
  ('Pierro', 'producer', 1),
  ('Leeuwin Estate', 'producer', 1),
  ('Vasse Felix', 'producer', 1),
  ('Giant Steps', 'producer', 1),
  ('Tolpuddle', 'producer', 1),
  ('Curly Flat', 'producer', 2),
  ('Bindi', 'producer', 1),
  ('By Farr', 'producer', 1),
  ('Felton Road', 'producer', 1),
  ('Giaconda', 'producer', 1),
  ('Lake''s Folly', 'producer', 2),
  ('Elanto Vineyard', 'producer', 1),
  ('Larry Cherubino', 'producer', 2),
  ('Chateau Pontet-Canet', 'producer', 1),
  ('Massolino', 'producer', 1),
  ('Paolo Scavino', 'producer', 2),
  ('Gaja', 'producer', 2),
  ('Monchiero', 'producer', 2),
  ('Margaret River', 'region', 1),
  ('Gevrey-Chambertin', 'region', 1),
  ('Burgundy', 'region', 1),
  ('Champagne', 'region', 1),
  ('Barolo', 'region', 1),
  ('Bordeaux left bank', 'region', 1),
  ('Yarra Valley', 'region', 2),
  ('Tasmania', 'region', 2),
  ('Mornington Peninsula', 'region', 2),
  ('Macedon Ranges', 'region', 2),
  ('Sparkling', 'varietal', 1),
  ('Chardonnay', 'varietal', 1),
  ('Pinot Noir', 'varietal', 1),
  ('Cabernet Sauvignon', 'varietal', 1),
  ('Langtons Classification', 'topic', 1)
on conflict do nothing;

-- Seed sources with tier assignments
insert into sources (name, critic, tier) values
  ('Wine Australia', null, 0),
  ('Winetitles', null, 0),
  ('ozwinereview.com', null, 0),
  ('Winefront', 'Mike Bennie / Campbell Mattinson / Jeni Port', 1),
  ('Wine Advocate', 'Erin Larkin', 1),
  ('Halliday Wine Companion', null, 2),
  ('Ray Jordan Wine', 'Ray Jordan', 2),
  ('Matthew Jukes', 'Matthew Jukes', 2),
  ('AFR / Life & Luxury', 'Max Allen', 3),
  ('Gourmet Traveller WINE', null, 3),
  ('JancisRobinson.com', null, 3),
  ('Qantas Magazine', null, 3),
  ('Lamont''s Cottesloe', null, 4),
  ('1533 Cellars / Ethereal Wines', 'Burgundy/Piedmont specialist, Glen Iris VIC', 4),
  ('Prince Wine Store', 'broad fine wine, France/Italy/Australia, Melbourne+Sydney', 4),
  ('Boccaccio Cellars', 'Burgundy/European specialist, Burghound-listed', 4),
  ('Mountain & Row', 'Italian/Nebbiolo specialist - Barolo, Barbaresco, Alto Piemonte', 4),
  ('MW Wines', 'mature/back-vintage specialist - Bordeaux, Burgundy, Barolo, Australian back vintages', 4),
  ('Nicks Wine Merchants', 'broad national search, lesser-known and hard-to-find bottles', 4),
  ('Vintrepid', 'Burgundy/Loire grower-direct discovery importer', 4),
  ('Rathdowne Cellars', 'Burgundy specialist, Burghound-listed', 4),
  ('Heart & Soil / Vin de Garde', 'Burgundy/Germany importer, pre-arrival and bin-end offers', 4),
  ('Langtons', 'auctions, secondary market, and direct per-producer/vintage product pages', 4)
on conflict do nothing;

-- Seed the actual Substack hierarchy
insert into substack_writers (name, publication, tier, strength_area) values
  ('Anthony Rose', 'anthonyrosewine.substack.com', 'A', 'broad critical authority, Louis Roederer Columnist of the Year'),
  ('Jason Wilson', 'Everyday Drinking', 'A', 'wine culture, accessible critical writing'),
  ('Jaclene Liew', null, 'A', null),
  ('Charlie Brown', 'The Sauce', 'A', 'independent retail perspective, value'),
  ('George Nordahl', null, 'A', null),
  ('Tom Wark', null, 'B', 'US wine business and industry commentary'),
  ('Giles MacDonogh', null, 'B', 'wine history and mature wines'),
  ('Sam Dixon Brown', null, 'B', null),
  ('Simon J. Woolf', null, 'B', 'natural/orange wine, Central and Eastern Europe'),
  ('Ivo', 'Things in Bottles', 'B', null)
on conflict do nothing;
