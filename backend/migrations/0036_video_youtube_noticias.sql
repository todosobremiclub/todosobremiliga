-- Agrega el campo opcional "Video de YouTube" a las Noticias de una Liga.
-- Se guarda el link tal cual lo carga la Liga (watch?v=..., youtu.be/...,
-- o ya en formato embed); el frontend público se encarga de convertirlo a
-- la URL de embed al momento de mostrarlo.
ALTER TABLE noticias ADD COLUMN IF NOT EXISTS video_youtube_url TEXT;
