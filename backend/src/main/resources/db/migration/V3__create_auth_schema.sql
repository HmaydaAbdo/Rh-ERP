-- Schéma d'authentification et RBAC dynamique (rôles/permissions administrables via l'UI, deny
-- overrides individuels). Voir conventions/security.md et docs/rbac/.
--
-- "utilisateur" (jamais "user", mot réservé PostgreSQL) porte le compte de connexion, indépendant
-- de "employe" (référentiel des ouvriers de chantier synchronisé depuis l'ERP) mais avec un lien
-- optionnel (un même employé peut aussi être un utilisateur applicatif).

-- =========================================================================
-- permission — catalogue fixe des actions possibles (une ligne par domaine x action), seedé par
-- V4. Jamais créé/modifié depuis l'UI — seule l'association rôle/permission est administrable.
-- =========================================================================
CREATE TABLE permission (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(50)  NOT NULL,
    description VARCHAR(255) NOT NULL,
    CONSTRAINT uk_permission_code UNIQUE (code)
);

-- =========================================================================
-- role — administrable via l'UI (création libre, permissions assignées librement).
-- =========================================================================
CREATE TABLE role (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nom         VARCHAR(50)  NOT NULL,
    description VARCHAR(255),
    CONSTRAINT uk_role_nom UNIQUE (nom)
);

CREATE TABLE role_permission (
    role_id       BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permission_role       FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE CASCADE,
    CONSTRAINT fk_role_permission_permission FOREIGN KEY (permission_id) REFERENCES permission (id) ON DELETE CASCADE
);

-- =========================================================================
-- utilisateur — compte de connexion applicatif.
-- =========================================================================
CREATE TABLE utilisateur (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username           VARCHAR(50)  NOT NULL,
    email             VARCHAR(255) NOT NULL,
    mot_de_passe_hash VARCHAR(255) NOT NULL,
    actif             BOOLEAN      NOT NULL DEFAULT TRUE,
    employee_id       BIGINT,
    CONSTRAINT uk_utilisateur_username UNIQUE (username),
    CONSTRAINT uk_utilisateur_email    UNIQUE (email),
    CONSTRAINT fk_utilisateur_employee FOREIGN KEY (employee_id) REFERENCES employe (id)
);

CREATE INDEX idx_utilisateur_employee ON utilisateur (employee_id);

CREATE TABLE utilisateur_role (
    utilisateur_id BIGINT NOT NULL,
    role_id        BIGINT NOT NULL,
    PRIMARY KEY (utilisateur_id, role_id),
    CONSTRAINT fk_utilisateur_role_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateur (id) ON DELETE CASCADE,
    CONSTRAINT fk_utilisateur_role_role        FOREIGN KEY (role_id) REFERENCES role (id) ON DELETE CASCADE
);

-- Deny override individuel : présence d'une ligne = permission explicitement refusée à cet
-- utilisateur, quels que soient ses rôles (Règle : deny individuel > permissions des rôles).
CREATE TABLE utilisateur_permission_refusee (
    utilisateur_id BIGINT NOT NULL,
    permission_id  BIGINT NOT NULL,
    PRIMARY KEY (utilisateur_id, permission_id),
    CONSTRAINT fk_upr_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateur (id) ON DELETE CASCADE,
    CONSTRAINT fk_upr_permission  FOREIGN KEY (permission_id) REFERENCES permission (id) ON DELETE CASCADE
);

-- =========================================================================
-- refresh_token — opaque (jamais un JWT), à usage unique : chaque refresh fait pivoter le token et
-- invalide l'ancien. La réutilisation d'un token déjà consommé signale une compromission (voir
-- conventions/security.md).
-- =========================================================================
CREATE TABLE refresh_token (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    utilisateur_id BIGINT       NOT NULL,
    token_hash     VARCHAR(255) NOT NULL,
    expire_le      TIMESTAMP    NOT NULL,
    revoque        BOOLEAN      NOT NULL DEFAULT FALSE,
    cree_le        TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uk_refresh_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_refresh_token_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateur (id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_token_utilisateur ON refresh_token (utilisateur_id);

-- =========================================================================
-- reset_password_token — lien "mot de passe oublié" envoyé par email, à usage unique.
-- =========================================================================
CREATE TABLE reset_password_token (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    utilisateur_id BIGINT       NOT NULL,
    token_hash     VARCHAR(255) NOT NULL,
    expire_le      TIMESTAMP    NOT NULL,
    utilise        BOOLEAN      NOT NULL DEFAULT FALSE,
    cree_le        TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uk_reset_password_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_reset_password_token_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateur (id) ON DELETE CASCADE
);

CREATE INDEX idx_reset_password_token_utilisateur ON reset_password_token (utilisateur_id);
