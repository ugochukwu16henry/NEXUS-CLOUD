-- Cerebras joins the model providers (ADR 0008, 0018). A new enum value can't be used in the same
-- transaction that adds it, so the defaults are updated in the next migration.
alter type public.model_provider add value if not exists 'cerebras';
