UPDATE "contents"
SET "payload" = ("payload" - 'scenes') || CASE
  WHEN jsonb_typeof("payload" -> 'development') = 'string'
    THEN jsonb_build_object('development', to_jsonb(regexp_split_to_array(btrim("payload" ->> 'development'), E'\\s*;\\s*')))
  ELSE '{}'::jsonb
END
WHERE "payload" ? 'scenes' OR jsonb_typeof("payload" -> 'development') = 'string';

UPDATE "content_brief_versions"
SET "payload" = ("payload" - 'scenes') || CASE
  WHEN jsonb_typeof("payload" -> 'development') = 'string'
    THEN jsonb_build_object('development', to_jsonb(regexp_split_to_array(btrim("payload" ->> 'development'), E'\\s*;\\s*')))
  ELSE '{}'::jsonb
END
WHERE "payload" ? 'scenes' OR jsonb_typeof("payload" -> 'development') = 'string';
