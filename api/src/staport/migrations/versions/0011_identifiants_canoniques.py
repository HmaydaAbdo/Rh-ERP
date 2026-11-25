"""Identifiants canoniques : fusion des doublons d'employés et de fonctions, puis garde-fous en base (KAN-319).

L'import de la paie du 06/11/2026 a créé des doublons parce que l'identité ne neutralisait que la casse et les espaces
aux extrémités : « XY 100200 » et « XY100200 » étaient deux CIN, « OP.  COMPACTEUR » et « OP. COMPACTEUR » deux
fonctions, et un CIN abîmé par Excel (`9.00000E+11` pour `900000000001`) a donné une nouvelle fiche.

La révision, dans une seule transaction :
1. fusionne les employés d'un même CIN canonique (majuscules, sans espaces), et la fiche dont le CIN est abîmé avec la
   fiche de même nom et de mêmes dates dont le CIN est valide. La fiche **En poste** est conservée (elle porte l'état du
   dernier mois de paie, ADR 0010) et reçoit le CIN valide ; les bulletins, heures supplémentaires et comptes de l'autre
   fiche lui sont rattachés ; le faux départ de l'autre fiche (« Sortie sans motif ») est supprimé ;
2. fusionne les fonctions de même libellé canonique (la plus ancienne est conservée) ;
3. met sous forme canonique les CIN, les libellés de fonction et d'équipe, les codes d'équipe et de chantier ;
4. ajoute les contraintes CHECK qui refusent désormais toute autre écriture (`domains/common/cles.py`).

Un conflit (deux bulletins du même mois pour la même personne) arrête la migration au lieu de perdre une donnée.
Chaque ligne modifiée ou supprimée a sa ligne `_aud` dans une révision MIGRATION, avec ses entrées de journal
(gabarit de `conventions/database.md`). Idempotente : sans doublon ni écriture non canonique, elle n'écrit rien.

Revision ID: 0011_identifiants_canoniques
Revises: 0010_role_charge_rh
"""

from alembic import op

revision = "0011_identifiants_canoniques"
down_revision = "0010_role_charge_rh"
branch_labels = None
depends_on = None

# Copie dans `<table>_aud` l'état courant d'une ligne (avant une suppression, après une modification).
AUDITER = """
CREATE FUNCTION pg_temp.auditer(p_table TEXT, p_id BIGINT, p_rev BIGINT, p_type INTEGER) RETURNS VOID AS $f$
DECLARE
    v_colonnes TEXT;
BEGIN
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO v_colonnes
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table || '_aud' AND column_name NOT IN ('id', 'rev', 'revtype');
    EXECUTE format('INSERT INTO %I (id, rev, revtype, %s) SELECT id, $1, $2, %s FROM %I WHERE id = $3',
                   p_table || '_aud', v_colonnes, v_colonnes, p_table)
      USING p_rev, p_type, p_id;
END
$f$ LANGUAGE plpgsql;
"""

CORRIGER = r"""
DO $$
DECLARE
    v_rev       BIGINT;
    v_request   TEXT := gen_random_uuid()::text;
    v_migration CONSTANT TEXT := '0011_identifiants_canoniques';
    v_f         RECORD;
    v_l         RECORD;
    v_fusions   JSONB := '[]'::jsonb;
    v_fonctions JSONB := '[]'::jsonb;
    v_cins      INTEGER := 0;
    v_textes    INTEGER := 0;
    v_entites   TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- 1. Employés à fusionner : (fiche absorbée, fiche conservée, CIN final).
    CREATE TEMPORARY TABLE fusion_employe (absorbe BIGINT, survivant BIGINT, cin TEXT) ON COMMIT DROP;
    WITH g AS (
        SELECT id, statut, UPPER(regexp_replace(cin, '\s', '', 'g')) AS k FROM employe
    ), choix AS (
        SELECT DISTINCT ON (k) k, id FROM g
         WHERE k IN (SELECT k FROM g GROUP BY k HAVING count(*) > 1)
         ORDER BY k, (statut = 'ACTIF') DESC, id DESC
    )
    INSERT INTO fusion_employe SELECT g.id, c.id, g.k FROM g JOIN choix c USING (k) WHERE g.id <> c.id;
    -- CIN abîmé (ponctuation, notation scientifique d'Excel) : la fiche de même nom et de mêmes dates au CIN valide.
    INSERT INTO fusion_employe
    SELECT CASE WHEN m.statut = 'ACTIF' OR b.statut <> 'ACTIF' THEN b.id ELSE m.id END,
           CASE WHEN m.statut = 'ACTIF' OR b.statut <> 'ACTIF' THEN m.id ELSE b.id END,
           UPPER(regexp_replace(b.cin, '\s', '', 'g'))
      FROM employe m
      JOIN employe b
        ON b.id <> m.id
       AND UPPER(regexp_replace(btrim(b.nom_prenom), '\s+', ' ', 'g'))
           = UPPER(regexp_replace(btrim(m.nom_prenom), '\s+', ' ', 'g'))
       AND b.date_naissance = m.date_naissance
       AND b.date_embauche = m.date_embauche
     WHERE UPPER(regexp_replace(m.cin, '\s', '', 'g')) !~ '^[A-Z0-9]+$'
       AND UPPER(regexp_replace(b.cin, '\s', '', 'g')) ~ '^[A-Z0-9]+$'
       AND NOT EXISTS (SELECT 1 FROM fusion_employe f WHERE f.absorbe IN (m.id, b.id) OR f.survivant IN (m.id, b.id));

    -- 2. Fonctions à fusionner : la plus ancienne de chaque libellé canonique est conservée.
    CREATE TEMPORARY TABLE fusion_fonction (absorbe BIGINT, survivant BIGINT) ON COMMIT DROP;
    WITH g AS (SELECT id, UPPER(regexp_replace(btrim(libelle), '\s+', ' ', 'g')) AS k FROM fonction)
    INSERT INTO fusion_fonction
    SELECT g.id, m.id FROM g JOIN (SELECT k, min(id) AS id FROM g GROUP BY k HAVING count(*) > 1) m USING (k)
     WHERE g.id <> m.id;

    IF NOT EXISTS (SELECT 1 FROM fusion_employe) AND NOT EXISTS (SELECT 1 FROM fusion_fonction)
       AND NOT EXISTS (SELECT 1 FROM employe WHERE cin <> UPPER(regexp_replace(cin, '\s', '', 'g')))
       AND NOT EXISTS (SELECT 1 FROM fonction WHERE libelle <> regexp_replace(btrim(libelle), '\s+', ' ', 'g'))
       AND NOT EXISTS (SELECT 1 FROM equipe WHERE code <> regexp_replace(btrim(code), '\s+', ' ', 'g')
                                               OR libelle <> regexp_replace(btrim(libelle), '\s+', ' ', 'g'))
       AND NOT EXISTS (SELECT 1 FROM chantier WHERE code <> regexp_replace(btrim(code), '\s+', ' ', 'g')) THEN
        RETURN;
    END IF;

    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', v_request, NULL)
    RETURNING id INTO v_rev;

    FOR v_f IN SELECT * FROM fusion_employe ORDER BY survivant LOOP
        IF EXISTS (SELECT 1 FROM paie a JOIN paie s ON s.periode = a.periode
                    WHERE a.employee_id = v_f.absorbe AND s.employee_id = v_f.survivant)
           OR EXISTS (SELECT 1 FROM heures_supp a JOIN heures_supp s
                        ON s.periode = a.periode AND s.chantier_id = a.chantier_id
                      WHERE a.employee_id = v_f.absorbe AND s.employee_id = v_f.survivant) THEN
            RAISE EXCEPTION 'Fusion impossible des employés % et % : bulletins ou heures du même mois des deux côtés',
                v_f.absorbe, v_f.survivant;
        END IF;
        FOR v_l IN UPDATE paie SET employee_id = v_f.survivant, version = version + 1
                    WHERE employee_id = v_f.absorbe RETURNING id LOOP
            PERFORM pg_temp.auditer('paie', v_l.id, v_rev, 1);
        END LOOP;
        FOR v_l IN UPDATE heures_supp SET employee_id = v_f.survivant, version = version + 1
                    WHERE employee_id = v_f.absorbe RETURNING id LOOP
            PERFORM pg_temp.auditer('heures_supp', v_l.id, v_rev, 1);
        END LOOP;
        FOR v_l IN UPDATE utilisateur SET employee_id = v_f.survivant, version = version + 1
                    WHERE employee_id = v_f.absorbe RETURNING id LOOP
            PERFORM pg_temp.auditer('utilisateur', v_l.id, v_rev, 1);
        END LOOP;
        -- Le départ de la fiche absorbée est faux quand la personne est restée en poste ; sinon il est repris.
        FOR v_l IN SELECT es.id FROM employe_sortie es WHERE es.employee_id = v_f.absorbe
                      AND ((SELECT statut FROM employe WHERE id = v_f.survivant) = 'ACTIF'
                           OR EXISTS (SELECT 1 FROM employe_sortie s2
                                       WHERE s2.employee_id = v_f.survivant AND s2.periode = es.periode)) LOOP
            PERFORM pg_temp.auditer('employe_sortie', v_l.id, v_rev, 2);
            DELETE FROM employe_sortie WHERE id = v_l.id;
        END LOOP;
        FOR v_l IN UPDATE employe_sortie SET employee_id = v_f.survivant, version = version + 1
                    WHERE employee_id = v_f.absorbe RETURNING id LOOP
            PERFORM pg_temp.auditer('employe_sortie', v_l.id, v_rev, 1);
        END LOOP;
        PERFORM pg_temp.auditer('employe', v_f.absorbe, v_rev, 2);
        DELETE FROM employe WHERE id = v_f.absorbe;
        UPDATE employe SET cin = v_f.cin, version = version + 1 WHERE id = v_f.survivant AND cin <> v_f.cin;
        IF FOUND THEN
            PERFORM pg_temp.auditer('employe', v_f.survivant, v_rev, 1);
        END IF;
        v_fusions := v_fusions || jsonb_build_object('absorbe', v_f.absorbe, 'conserve', v_f.survivant, 'cin', v_f.cin);
    END LOOP;

    FOR v_f IN SELECT * FROM fusion_fonction ORDER BY survivant LOOP
        FOR v_l IN UPDATE employe SET fonction_id = v_f.survivant, version = version + 1
                    WHERE fonction_id = v_f.absorbe RETURNING id LOOP
            PERFORM pg_temp.auditer('employe', v_l.id, v_rev, 1);
        END LOOP;
        FOR v_l IN UPDATE paie SET fonction_id = v_f.survivant, version = version + 1
                    WHERE fonction_id = v_f.absorbe RETURNING id LOOP
            PERFORM pg_temp.auditer('paie', v_l.id, v_rev, 1);
        END LOOP;
        FOR v_l IN UPDATE heures_supp SET fonction_id = v_f.survivant, version = version + 1
                    WHERE fonction_id = v_f.absorbe RETURNING id LOOP
            PERFORM pg_temp.auditer('heures_supp', v_l.id, v_rev, 1);
        END LOOP;
        PERFORM pg_temp.auditer('fonction', v_f.absorbe, v_rev, 2);
        DELETE FROM fonction WHERE id = v_f.absorbe;
        v_fonctions := v_fonctions || jsonb_build_object('absorbee', v_f.absorbe, 'conservee', v_f.survivant);
    END LOOP;

    -- 3. Écritures canoniques.
    FOR v_l IN UPDATE employe SET cin = UPPER(regexp_replace(cin, '\s', '', 'g')), version = version + 1
                WHERE cin <> UPPER(regexp_replace(cin, '\s', '', 'g')) RETURNING id LOOP
        PERFORM pg_temp.auditer('employe', v_l.id, v_rev, 1);
        v_cins := v_cins + 1;
    END LOOP;
    FOR v_l IN UPDATE fonction SET libelle = regexp_replace(btrim(libelle), '\s+', ' ', 'g'), version = version + 1
                WHERE libelle <> regexp_replace(btrim(libelle), '\s+', ' ', 'g') RETURNING id LOOP
        PERFORM pg_temp.auditer('fonction', v_l.id, v_rev, 1);
        v_textes := v_textes + 1;
    END LOOP;
    FOR v_l IN UPDATE equipe SET code = regexp_replace(btrim(code), '\s+', ' ', 'g'),
                                 libelle = regexp_replace(btrim(libelle), '\s+', ' ', 'g'), version = version + 1
                WHERE code <> regexp_replace(btrim(code), '\s+', ' ', 'g')
                   OR libelle <> regexp_replace(btrim(libelle), '\s+', ' ', 'g') RETURNING id LOOP
        PERFORM pg_temp.auditer('equipe', v_l.id, v_rev, 1);
        v_textes := v_textes + 1;
    END LOOP;
    FOR v_l IN UPDATE chantier SET code = regexp_replace(btrim(code), '\s+', ' ', 'g'), version = version + 1
                WHERE code <> regexp_replace(btrim(code), '\s+', ' ', 'g') RETURNING id LOOP
        PERFORM pg_temp.auditer('chantier', v_l.id, v_rev, 1);
        v_textes := v_textes + 1;
    END LOOP;

    SELECT array_agg(DISTINCT e) INTO v_entites FROM unnest(ARRAY[
        CASE WHEN jsonb_array_length(v_fusions) > 0 OR v_cins > 0 OR jsonb_array_length(v_fonctions) > 0
             THEN 'staport.rh.employee.entities.Employee' END,
        CASE WHEN jsonb_array_length(v_fusions) > 0 THEN 'staport.rh.employee.entities.EmployeeSortie' END,
        CASE WHEN jsonb_array_length(v_fusions) > 0 OR jsonb_array_length(v_fonctions) > 0
             THEN 'staport.rh.paie.entities.Paie' END,
        CASE WHEN jsonb_array_length(v_fusions) > 0 OR jsonb_array_length(v_fonctions) > 0
             THEN 'staport.rh.heuresupp.entities.HeureSupp' END,
        CASE WHEN jsonb_array_length(v_fonctions) > 0 OR v_textes > 0 THEN 'staport.rh.function.entities.Function' END,
        CASE WHEN v_textes > 0 THEN 'staport.rh.equipe.entities.Equipe' END,
        CASE WHEN v_textes > 0 THEN 'staport.rh.chantier.entities.Chantier' END
    ]) AS e WHERE e IS NOT NULL;
    INSERT INTO audit_revision_entite (revision_id, entite) SELECT v_rev, unnest(v_entites);

    IF jsonb_array_length(v_fusions) > 0 THEN
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        VALUES (now(), 'OPERATION', 'EMPLOYE_FUSION', 'DELETE', 'SUCCES', 'Système', 'MIGRATION', v_request,
                jsonb_array_length(v_fusions),
                jsonb_build_object('migration', v_migration, 'fusions', v_fusions), v_rev);
    END IF;
    IF jsonb_array_length(v_fonctions) > 0 THEN
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        VALUES (now(), 'OPERATION', 'FONCTION_FUSION', 'DELETE', 'SUCCES', 'Système', 'MIGRATION', v_request,
                jsonb_array_length(v_fonctions), jsonb_build_object('migration', v_migration, 'fusions', v_fonctions),
                v_rev);
    END IF;
    IF v_cins > 0 THEN
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        VALUES (now(), 'OPERATION', 'EMPLOYE_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION', v_request,
                v_cins, jsonb_build_object('migration', v_migration, 'regle', 'CIN_CANONIQUE'), v_rev);
    END IF;
    IF v_textes > 0 THEN
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        VALUES (now(), 'OPERATION', 'REFERENTIEL_NORMALISATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION',
                v_request, v_textes, jsonb_build_object('migration', v_migration, 'regle', 'ESPACES_REDUITS'), v_rev);
    END IF;
END $$;
"""

# Garde-fous : posés sans relire la table (NOT VALID), puis validés quand toutes les lignes les respectent.
# Un CIN encore abîmé sans fiche jumelle (autre environnement) ne bloque pas le démarrage :
# la contrainte protège les écritures.
CONTRAINTES = r"""
ALTER TABLE employe ADD CONSTRAINT ck_employe_cin_canonique CHECK (cin ~ '^[A-Z0-9]+$') NOT VALID;
ALTER TABLE fonction ADD CONSTRAINT ck_fonction_libelle_canonique
    CHECK (libelle = regexp_replace(btrim(libelle), '\s+', ' ', 'g')) NOT VALID;
ALTER TABLE equipe ADD CONSTRAINT ck_equipe_code_canonique
    CHECK (code = regexp_replace(btrim(code), '\s+', ' ', 'g')) NOT VALID;
ALTER TABLE equipe ADD CONSTRAINT ck_equipe_libelle_canonique
    CHECK (libelle = regexp_replace(btrim(libelle), '\s+', ' ', 'g')) NOT VALID;
ALTER TABLE chantier ADD CONSTRAINT ck_chantier_code_canonique
    CHECK (code = regexp_replace(btrim(code), '\s+', ' ', 'g')) NOT VALID;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM employe WHERE cin !~ '^[A-Z0-9]+$') THEN
        ALTER TABLE employe VALIDATE CONSTRAINT ck_employe_cin_canonique;
    ELSE
        RAISE WARNING 'CIN non canoniques restants : ck_employe_cin_canonique reste NOT VALID';
    END IF;
END $$;
ALTER TABLE fonction VALIDATE CONSTRAINT ck_fonction_libelle_canonique;
ALTER TABLE equipe VALIDATE CONSTRAINT ck_equipe_code_canonique;
ALTER TABLE equipe VALIDATE CONSTRAINT ck_equipe_libelle_canonique;
ALTER TABLE chantier VALIDATE CONSTRAINT ck_chantier_code_canonique;
"""


def upgrade() -> None:
    op.execute(AUDITER)
    op.execute(CORRIGER)
    op.execute(CONTRAINTES)
    op.execute("DROP FUNCTION pg_temp.auditer(TEXT, BIGINT, BIGINT, INTEGER)")


def downgrade() -> None:
    """Les fusions ne se défont pas (données corrigées) ; seules les contraintes sont retirées."""
    op.execute("""
    ALTER TABLE chantier DROP CONSTRAINT IF EXISTS ck_chantier_code_canonique;
    ALTER TABLE equipe DROP CONSTRAINT IF EXISTS ck_equipe_libelle_canonique;
    ALTER TABLE equipe DROP CONSTRAINT IF EXISTS ck_equipe_code_canonique;
    ALTER TABLE fonction DROP CONSTRAINT IF EXISTS ck_fonction_libelle_canonique;
    ALTER TABLE employe DROP CONSTRAINT IF EXISTS ck_employe_cin_canonique;
    """)
