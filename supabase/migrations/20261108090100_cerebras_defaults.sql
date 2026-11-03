-- ADR 0018: every provider is allowed by default. New projects get Cerebras too. Existing projects
-- that still allow every earlier provider (the default) get it as well; a project the owner has
-- narrowed keeps exactly the providers the owner chose.
alter table public.project_model_settings
  alter column allowed_providers
  set default '{anthropic,openai,gemini,xai,deepseek,groq,openrouter,cerebras}';

update public.project_model_settings
set allowed_providers = array_append(allowed_providers, 'cerebras'::public.model_provider)
where allowed_providers @> '{anthropic,openai,gemini,xai,deepseek,groq,openrouter}'
  and not ('cerebras'::public.model_provider = any (allowed_providers));
