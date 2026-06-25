-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Create usage tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
  user_id    uuid  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    text  NOT NULL,
  usage_date date  NOT NULL DEFAULT CURRENT_DATE,
  count      int   NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature, usage_date)
);

-- 2. Row-level security — users can only read their own rows
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON usage_tracking FOR SELECT
  USING (auth.uid() = user_id);

-- 3. Atomic upsert function (service role only — bypasses RLS)
CREATE OR REPLACE FUNCTION increment_usage(
  p_user_id uuid,
  p_feature  text,
  p_date     date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO usage_tracking (user_id, feature, usage_date, count)
  VALUES (p_user_id, p_feature, p_date, 1)
  ON CONFLICT (user_id, feature, usage_date)
  DO UPDATE SET count = usage_tracking.count + 1;
END;
$$;
