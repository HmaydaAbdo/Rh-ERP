-- Les identifiants textuels comparables sont uniques après suppression des espaces extérieurs
-- et sans tenir compte de la casse. Les prérequis sont contrôlés avant de remplacer les index.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM employe GROUP BY UPPER(BTRIM(cin, E' \t\n\r\f\013')) HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Doublons de CIN après trim et sans casse : résoudre les lignes avant V27';
    END IF;
    IF EXISTS (SELECT 1 FROM fonction GROUP BY UPPER(BTRIM(libelle, E' \t\n\r\f\013')) HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Doublons de Fonction après trim et sans casse : résoudre les lignes avant V27';
    END IF;
    IF EXISTS (SELECT 1 FROM chantier GROUP BY UPPER(BTRIM(code, E' \t\n\r\f\013')) HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Doublons de code Chantier après trim et sans casse : résoudre les lignes avant V27';
    END IF;
    IF EXISTS (SELECT 1 FROM equipe GROUP BY UPPER(BTRIM(code, E' \t\n\r\f\013')) HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Doublons de code Équipe après trim et sans casse : résoudre les lignes avant V27';
    END IF;
    IF EXISTS (SELECT 1 FROM equipe GROUP BY UPPER(BTRIM(libelle, E' \t\n\r\f\013')) HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Doublons de libellé Équipe après trim et sans casse : résoudre les lignes avant V27';
    END IF;
    IF EXISTS (SELECT 1 FROM utilisateur GROUP BY UPPER(BTRIM(username, E' \t\n\r\f\013')) HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Doublons de username après trim et sans casse : résoudre les lignes avant V27';
    END IF;
    IF EXISTS (SELECT 1 FROM utilisateur GROUP BY UPPER(BTRIM(email, E' \t\n\r\f\013')) HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Doublons de courriel après trim et sans casse : résoudre les lignes avant V27';
    END IF;
    IF EXISTS (SELECT 1 FROM role GROUP BY UPPER(BTRIM(nom, E' \t\n\r\f\013')) HAVING COUNT(*) > 1) THEN
        RAISE EXCEPTION 'Doublons de nom de rôle après trim et sans casse : résoudre les lignes avant V27';
    END IF;
END;
$$;

-- NOT VALID protège immédiatement toutes les nouvelles écritures et mises à jour, tout en
-- permettant de traiter séparément les anciennes valeurs entourées d'espaces.
ALTER TABLE employe ADD CONSTRAINT ck_employe_cin_sans_espaces_exterieurs
    CHECK (cin = BTRIM(cin, E' \t\n\r\f\013') AND BTRIM(cin, E' \t\n\r\f\013') <> '') NOT VALID;
ALTER TABLE fonction ADD CONSTRAINT ck_fonction_libelle_sans_espaces_exterieurs
    CHECK (libelle = BTRIM(libelle, E' \t\n\r\f\013') AND BTRIM(libelle, E' \t\n\r\f\013') <> '') NOT VALID;
ALTER TABLE chantier ADD CONSTRAINT ck_chantier_code_sans_espaces_exterieurs
    CHECK (code = BTRIM(code, E' \t\n\r\f\013') AND BTRIM(code, E' \t\n\r\f\013') <> '') NOT VALID;
ALTER TABLE equipe ADD CONSTRAINT ck_equipe_code_sans_espaces_exterieurs
    CHECK (code = BTRIM(code, E' \t\n\r\f\013') AND BTRIM(code, E' \t\n\r\f\013') <> '') NOT VALID;
ALTER TABLE equipe ADD CONSTRAINT ck_equipe_libelle_sans_espaces_exterieurs
    CHECK (libelle = BTRIM(libelle, E' \t\n\r\f\013') AND BTRIM(libelle, E' \t\n\r\f\013') <> '') NOT VALID;
ALTER TABLE utilisateur ADD CONSTRAINT ck_utilisateur_username_sans_espaces_exterieurs
    CHECK (username = BTRIM(username, E' \t\n\r\f\013') AND BTRIM(username, E' \t\n\r\f\013') <> '') NOT VALID;
ALTER TABLE utilisateur ADD CONSTRAINT ck_utilisateur_email_sans_espaces_exterieurs
    CHECK (email = BTRIM(email, E' \t\n\r\f\013') AND BTRIM(email, E' \t\n\r\f\013') <> '') NOT VALID;
ALTER TABLE role ADD CONSTRAINT ck_role_nom_sans_espaces_exterieurs
    CHECK (nom = BTRIM(nom, E' \t\n\r\f\013') AND BTRIM(nom, E' \t\n\r\f\013') <> '') NOT VALID;

DROP INDEX uk_employe_cin_upper;
CREATE UNIQUE INDEX uk_employe_cin_normalise ON employe (UPPER(BTRIM(cin, E' \t\n\r\f\013')));

DROP INDEX uk_fonction_libelle_upper;
CREATE UNIQUE INDEX uk_fonction_libelle_normalise ON fonction (UPPER(BTRIM(libelle, E' \t\n\r\f\013')));

DROP INDEX uk_chantier_code_upper;
CREATE UNIQUE INDEX uk_chantier_code_normalise ON chantier (UPPER(BTRIM(code, E' \t\n\r\f\013')));

ALTER TABLE utilisateur DROP CONSTRAINT uk_utilisateur_username;
ALTER TABLE utilisateur DROP CONSTRAINT uk_utilisateur_email;
CREATE UNIQUE INDEX uk_utilisateur_username_normalise ON utilisateur (UPPER(BTRIM(username, E' \t\n\r\f\013')));
CREATE UNIQUE INDEX uk_utilisateur_email_normalise ON utilisateur (UPPER(BTRIM(email, E' \t\n\r\f\013')));

ALTER TABLE role DROP CONSTRAINT uk_role_nom;
CREATE UNIQUE INDEX uk_role_nom_normalise ON role (UPPER(BTRIM(nom, E' \t\n\r\f\013')));
