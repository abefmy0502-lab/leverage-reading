-- 🩹 actions.id に gen_random_uuid() の DEFAULT が設定されていない環境で、
-- INSERT 時に「null value in column "id" of relation "actions" violates
-- not-null constraint」が発生するのを防ぐ。
--
-- 本来 actions テーブル作成時に DEFAULT を入れていたつもりが入っていない
-- 環境があるため、idempotent な ALTER で安全に補填する。
--
-- クライアント側 (useBooks.js) でも crypto.randomUUID() を使って事前に
-- UUID を生成するようにしているので、この SQL は二重防衛。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'actions'
      AND column_name = 'id'
      AND (column_default IS NULL OR column_default NOT LIKE '%gen_random_uuid%')
  ) THEN
    ALTER TABLE public.actions ALTER COLUMN id SET DEFAULT gen_random_uuid();
    RAISE NOTICE 'actions.id default set to gen_random_uuid()';
  ELSE
    RAISE NOTICE 'actions.id already has gen_random_uuid() default';
  END IF;
END $$;
