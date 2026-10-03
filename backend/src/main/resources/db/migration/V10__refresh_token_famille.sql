-- Famille de Refresh Tokens : tous les tokens issus d'une même connexion (login puis rotations
-- successives) partagent la même famille. La réutilisation d'un token déjà consommé révoque toute sa
-- famille (voir AuthService.refresh) — les sessions ouvertes sur d'autres appareils ne sont pas touchées.
-- Les tokens existants reçoivent chacun leur propre famille (ils ne peuvent plus être reliés entre eux).
ALTER TABLE refresh_token ADD COLUMN famille VARCHAR(36);
UPDATE refresh_token SET famille = gen_random_uuid()::text;
ALTER TABLE refresh_token ALTER COLUMN famille SET NOT NULL;
CREATE INDEX idx_refresh_token_famille ON refresh_token (famille);
