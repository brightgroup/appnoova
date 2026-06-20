-- Proveedor de voz: google (Gemini Live) | elevenlabs (Agents premium)
alter table public.voice_agents
  add column if not exists voice_provider text not null default 'google',
  add column if not exists elevenlabs_agent_id text,
  add column if not exists elevenlabs_voice_id text;

alter table public.voice_agents
  drop constraint if exists voice_agents_voice_provider_check;

alter table public.voice_agents
  add constraint voice_agents_voice_provider_check
  check (voice_provider in ('google', 'elevenlabs'));

comment on column public.voice_agents.voice_provider is 'google = Gemini Live; elevenlabs = ElevenAgents premium';
comment on column public.voice_agents.elevenlabs_agent_id is 'ID remoto en ElevenLabs ConvAI';
comment on column public.voice_agents.elevenlabs_voice_id is 'voice_id TTS en ElevenLabs';
