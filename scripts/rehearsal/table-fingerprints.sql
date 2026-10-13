-- Every table in the public schema: "table|row count|md5 of all rows". Read-only, works on any schema version.
-- Two databases with identical output hold identical data (row order independent).
\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
SELECT format('SELECT %L, count(*), md5(coalesce(string_agg(t::text, E''\n'' ORDER BY t::text), '''')) FROM public.%I t', table_name, table_name)
FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name
\gexec
