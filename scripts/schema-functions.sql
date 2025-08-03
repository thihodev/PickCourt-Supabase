-- Function to get table schema information
CREATE OR REPLACE FUNCTION get_table_schema()
RETURNS TABLE (
  table_name text,
  column_name text,
  data_type text,
  is_nullable text,
  column_default text,
  is_primary_key boolean,
  foreign_table text,
  foreign_column text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.table_name::text,
    c.column_name::text,
    c.data_type::text,
    c.is_nullable::text,
    c.column_default::text,
    CASE 
      WHEN pk.column_name IS NOT NULL THEN true 
      ELSE false 
    END as is_primary_key,
    fk.foreign_table_name::text as foreign_table,
    fk.foreign_column_name::text as foreign_column
  FROM information_schema.columns c
  LEFT JOIN (
    SELECT 
      kcu.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
  ) pk ON c.table_name = pk.table_name AND c.column_name = pk.column_name
  LEFT JOIN (
    SELECT 
      kcu.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu 
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
  ) fk ON c.table_name = fk.table_name AND c.column_name = fk.column_name
  WHERE c.table_schema = 'public'
    AND c.table_name NOT LIKE 'pg_%'
    AND c.table_name NOT LIKE 'sql_%'
    AND c.table_name NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns', 'raster_columns', 'raster_overviews')
  ORDER BY c.table_name, c.ordinal_position;
END;
$$;

-- Function to get enum information
CREATE OR REPLACE FUNCTION get_enum_info()
RETURNS TABLE (
  enum_name text,
  enum_values text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.typname::text as enum_name,
    array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] as enum_values
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  WHERE t.typtype = 'e'
  GROUP BY t.typname
  ORDER BY t.typname;
END;
$$;