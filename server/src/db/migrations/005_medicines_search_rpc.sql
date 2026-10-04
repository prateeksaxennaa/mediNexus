-- Improve medicines full-text search quality and expose ranked RPC search.

ALTER TABLE medicines DROP COLUMN search_vector;

ALTER TABLE medicines
ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(medicine_name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(composition, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(therapeutic_class, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(chemical_class, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(uses, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(side_effects, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(substitutes, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(description, '')), 'B')
) STORED;

CREATE INDEX IF NOT EXISTS idx_medicines_search ON medicines USING GIN (search_vector);

CREATE OR REPLACE FUNCTION public.search_medicines(p_query TEXT, p_limit INT DEFAULT 25)
RETURNS TABLE (
  id UUID,
  medicine_name TEXT,
  composition TEXT,
  therapeutic_class TEXT,
  chemical_class TEXT,
  uses TEXT,
  side_effects TEXT,
  substitutes TEXT,
  description TEXT,
  image_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.medicine_name,
    m.composition,
    m.therapeutic_class,
    m.chemical_class,
    m.uses,
    m.side_effects,
    m.substitutes,
    m.description,
    m.image_url,
    ts_rank_cd(m.search_vector, q) AS rank
  FROM medicines m,
       websearch_to_tsquery('english', trim(p_query)) AS q
  WHERE trim(coalesce(p_query, '')) <> ''
    AND m.search_vector @@ q
  ORDER BY rank DESC, m.medicine_name ASC
  LIMIT LEAST(GREATEST(coalesce(p_limit, 25), 1), 100);
$$;

GRANT EXECUTE ON FUNCTION public.search_medicines(TEXT, INT) TO anon, authenticated, service_role;
