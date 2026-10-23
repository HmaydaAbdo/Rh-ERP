package staport.rh.audit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.auth.dtos.request.DenyPermissionsRequestDto;
import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.RoleUpdateRequestDto;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.dtos.request.UserUpdateRequestDto;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.dtos.response.UserResponseDto;
import staport.rh.auth.exceptions.ProtectedRoleException;
import staport.rh.auth.exceptions.RoleInUseException;
import staport.rh.auth.services.interfaces.IRoleService;
import staport.rh.auth.services.interfaces.IUserService;
import staport.rh.equipe.dtos.request.EquipeCreateRequestDto;
import staport.rh.equipe.dtos.request.EquipeUpdateRequestDto;
import staport.rh.equipe.dtos.response.EquipeResponseDto;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.dtos.request.FunctionUpdateRequestDto;
import staport.rh.function.dtos.response.FunctionResponseDto;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.exceptions.InvalidReferenceException;
import staport.rh.paie.exceptions.PaieGroupeModifieException;
import staport.rh.paie.services.interfaces.IPaieService;
import org.springframework.dao.DataIntegrityViolationException;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Scénarios d'audit des opérations métier (plan S1 à S5, S11 à S17, S34), sur la vraie chaîne : service, transaction,
 * aspect, Envers, PostgreSQL.
 */
class AuditOperationTest extends AuditIntegrationTestBase {

    @Autowired
    private IPaieService paieService;
    @Autowired
    private IFunctionService functionService;
    @Autowired
    private IEquipeService equipeService;
    @Autowired
    private IRoleService roleService;
    @Autowired
    private IUserService userService;

    private PaieCreateRequestDto nouveauBulletin(Referentiel ref, YearMonth periode) {
        return new PaieCreateRequestDto(ref.employeId(), periode, ref.fonctionId(), ref.chantierId(), ref.equipeId(), BigDecimal.valueOf(26),
                null, null, new BigDecimal("3000.00"), null, null, new BigDecimal("3000.00"), null);
    }

    private PaieUpdateRequestDto modificationBulletin(Referentiel ref, String observation) {
        return new PaieUpdateRequestDto(0L, ref.fonctionId(), ref.chantierId(), ref.equipeId(), BigDecimal.valueOf(26), null, null,
                new BigDecimal("3000.00"), null, null, new BigDecimal("3000.00"), observation);
    }

    private PaieSearchCriteria critereDuMois(YearMonth periode) {
        return new PaieSearchCriteria(null, null, periode, null, null, null);
    }

    @Test
    void creation_modification_et_suppression_d_un_bulletin_laissent_chacune_une_entree_liee_a_leur_revision() {
        Referentiel ref = donnees.creerReferentiel();

        PaieResponseDto cree = paieService.create(nouveauBulletin(ref, YearMonth.of(2031, 1)));
        Map<String, Object> creation = uneEntree("PAIE_CREATION", cree.id());
        assertThat(creation.get("categorie")).isEqualTo("OPERATION");
        assertThat(creation.get("resultat")).isEqualTo("SUCCES");
        assertThat(creation.get("type_operation")).isEqualTo("CREATE");
        assertThat(creation.get("entite_type")).isEqualTo("Paie");
        assertThat(creation.get("utilisateur_id")).isEqualTo(UTILISATEUR_ID);
        assertThat(creation.get("utilisateur_nom")).isEqualTo(UTILISATEUR_NOM);
        assertThat(creation.get("origine")).isEqualTo("API");
        assertThat(lignesAud("paie_aud", revisionDe(creation), (short) 0)).isEqualTo(1);

        paieService.update(cree.id(), modificationBulletin(ref, "corrigé"));
        Map<String, Object> modification = uneEntree("PAIE_MODIFICATION", cree.id());
        assertThat(modification.get("type_operation")).isEqualTo("UPDATE");
        assertThat(lignesAud("paie_aud", revisionDe(modification), (short) 1)).isEqualTo(1);

        paieService.delete(cree.id());
        Map<String, Object> suppression = uneEntree("PAIE_SUPPRESSION", cree.id());
        assertThat(suppression.get("type_operation")).isEqualTo("DELETE");
        assertThat(lignesAud("paie_aud", revisionDe(suppression), (short) 2)).isEqualTo(1);
    }

    @Test
    void creer_un_bulletin_synchronise_l_equipe_choisie_avec_la_fiche_employe() {
        Referentiel ref = donnees.creerReferentiel();
        EquipeResponseDto equipe = equipeService.create(new EquipeCreateRequestDto(
                "SYNC-" + Long.toHexString(System.nanoTime()), "Équipe synchronisée"));

        PaieResponseDto bulletin = paieService.create(new PaieCreateRequestDto(ref.employeId(), YearMonth.of(2031, 7),
                ref.fonctionId(), ref.chantierId(), equipe.id(), BigDecimal.valueOf(26), null, null,
                new BigDecimal("3000"), null, null, new BigDecimal("3000"), null));

        assertThat(jdbc.queryForObject("SELECT equipe_id FROM employe WHERE id = ?", Long.class, ref.employeId()))
                .isEqualTo(equipe.id());
        assertThat(paieService.findById(bulletin.id()).equipe().id()).isEqualTo(equipe.id());
    }

    @Test
    void une_modification_sans_changement_laisse_une_entree_et_une_revision_vide() {
        FunctionResponseDto fonction = functionService.create(new FunctionCreateRequestDto("F-" + Long.toHexString(System.nanoTime())));
        functionService.update(fonction.id(), new FunctionUpdateRequestDto(0L, fonction.libelle()));

        Map<String, Object> entree = uneEntree("FONCTION_MODIFICATION", fonction.id());

        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(lignesAud("fonction_aud", revisionDe(entree))).as("rien n'a changé : aucun instantané").isZero();
    }

    @Test
    void une_suppression_en_groupe_supprime_chaque_bulletin_sous_une_seule_entree_qui_decrit_le_perimetre() {
        YearMonth mois = YearMonth.of(2031, 2);
        Referentiel ref = donnees.creerReferentiel();
        List<Long> ids = List.of(donnees.creerBulletin(ref, mois));
        Referentiel autre = donnees.creerReferentiel();
        Referentiel encore = donnees.creerReferentiel();
        donnees.creerBulletin(autre, mois);
        donnees.creerBulletin(encore, mois);
        long avantDansLeMois = paieService.search(critereDuMois(mois), org.springframework.data.domain.Pageable.unpaged()).getTotalElements();

        long supprimes = paieService.deleteGroupe(critereDuMois(mois), avantDansLeMois);

        assertThat(supprimes).isEqualTo(avantDansLeMois).isGreaterThanOrEqualTo(3);
        Map<String, Object> entree = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE action = 'PAIE_SUPPRESSION_GROUPE' ORDER BY id DESC LIMIT 1");
        assertThat(entree.get("resultat")).isEqualTo("SUCCES");
        assertThat(((Number) entree.get("nombre_elements")).longValue()).isEqualTo(supprimes);
        assertThat(entree.get("perimetre").toString()).contains("2031-02").contains("\"nombreConfirme\"");
        // Chaque bulletin supprimé est dans la révision, avec tout son contenu : c'est le but de la suppression
        // entité par entité (une suppression en masse n'aurait laissé aucune trace).
        long revision = revisionDe(entree);
        assertThat(lignesAud("paie_aud", revision, (short) 2)).isEqualTo(supprimes);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM paie_aud WHERE rev = ? AND revtype = 2 AND salaire_total IS NULL",
                Long.class, revision)).isZero();
        assertThat(ids).isNotEmpty();
    }

    @Test
    void une_suppression_en_groupe_refusee_parce_que_le_nombre_a_change_est_tracee_et_ne_supprime_rien() {
        YearMonth mois = YearMonth.of(2031, 3);
        Referentiel ref = donnees.creerReferentiel();
        long bulletin = donnees.creerBulletin(ref, mois);
        long avant = jdbc.queryForObject("SELECT max(id) FROM audit_journal", Long.class);

        assertThatThrownBy(() -> paieService.deleteGroupe(critereDuMois(mois), 999_999))
                .isInstanceOf(PaieGroupeModifieException.class);

        Map<String, Object> entree = jdbc.queryForMap(
                "SELECT * FROM audit_journal WHERE id > ? AND action = 'PAIE_SUPPRESSION_GROUPE'", avant);
        assertThat(entree.get("resultat")).isEqualTo("ECHEC");
        assertThat(entree.get("motif")).isEqualTo("PaieGroupeModifieException");
        assertThat(entree.get("revision_id")).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM paie WHERE id = ?", Long.class, bulletin)).isEqualTo(1L);
    }

    @Test
    void une_operation_rejetee_trace_la_tentative_sans_rien_enregistrer() {
        Referentiel ref = donnees.creerReferentiel();
        PaieCreateRequestDto inconnu = new PaieCreateRequestDto(-1L, YearMonth.of(2031, 4), ref.fonctionId(), ref.chantierId(),
                null, BigDecimal.valueOf(26), null, null, BigDecimal.TEN, null, null, BigDecimal.TEN, null);
        long avant = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);

        assertThatThrownBy(() -> paieService.create(inconnu)).isInstanceOf(InvalidReferenceException.class);

        Map<String, Object> entree = jdbc.queryForMap("SELECT * FROM audit_journal WHERE id > ? AND action = 'PAIE_CREATION'", avant);
        assertThat(entree.get("resultat")).isEqualTo("ECHEC");
        assertThat(entree.get("motif")).isEqualTo("InvalidReferenceException");
        assertThat(entree.get("utilisateur_nom")).isEqualTo(UTILISATEUR_NOM);
    }

    @Test
    void une_transaction_annulee_apres_une_operation_reussie_ne_laisse_ni_entree_ni_revision() {
        Referentiel ref = donnees.creerReferentiel();
        long revisionsAvant = jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class);
        long entreesAvant = jdbc.queryForObject("SELECT count(*) FROM audit_journal", Long.class);

        assertThatThrownBy(() -> transaction.executeWithoutResult(statut -> {
            paieService.create(nouveauBulletin(ref, YearMonth.of(2031, 5)));
            throw new IllegalStateException("annulation voulue");
        })).isInstanceOf(IllegalStateException.class);

        // L'entrée « succès » est écrite dans la transaction de l'opération : elle est annulée avec elle.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_revision", Long.class)).isEqualTo(revisionsAvant);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_journal", Long.class)).isEqualTo(entreesAvant);
    }

    @Test
    void une_violation_de_contrainte_a_l_ecriture_est_tracee_comme_echec_et_reste_traduite() {
        Referentiel ref = donnees.creerReferentiel();
        donnees.creerBulletin(ref, YearMonth.of(2031, 6));

        // L'équipe est utilisée par un bulletin : la base refuse (clé étrangère) au moment du flush de l'aspect.
        assertThatThrownBy(() -> equipeService.delete(ref.equipeId()))
                .as("traduite comme avant (les gestionnaires d'exceptions des modules en dépendent)")
                .isInstanceOf(DataIntegrityViolationException.class);

        Map<String, Object> entree = uneEntree("EQUIPE_SUPPRESSION", ref.equipeId());
        assertThat(entree.get("resultat")).isEqualTo("ECHEC");
        assertThat(entree.get("motif")).isEqualTo("DataIntegrityViolationException");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM equipe WHERE id = ?", Long.class, ref.equipeId())).isEqualTo(1L);
    }

    @Test
    void supprimer_une_equipe_referencee_par_une_fiche_employe_est_refuse() {
        Referentiel ref = donnees.creerReferentiel();
        jdbc.update("UPDATE employe SET equipe_id = ? WHERE id = ?", ref.equipeId(), ref.employeId());

        assertThatThrownBy(() -> equipeService.delete(ref.equipeId()))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM equipe WHERE id = ?", Long.class, ref.equipeId())).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT equipe_id FROM employe WHERE id = ?", Long.class, ref.employeId())).isEqualTo(ref.equipeId());
        assertThat(uneEntree("EQUIPE_SUPPRESSION", ref.equipeId()).get("resultat")).isEqualTo("ECHEC");
    }

    @Test
    void modifier_le_code_d_une_equipe_actualise_le_code_affiche_sur_ses_bulletins_existants() {
        Referentiel ref = donnees.creerReferentiel();
        long bulletinId = donnees.creerBulletin(ref, YearMonth.of(2031, 6));
        EquipeResponseDto equipe = equipeService.findById(ref.equipeId());
        String nouveauCode = ("NOUVEAU-" + ref.suffixe()).toUpperCase(Locale.ROOT);

        equipeService.update(equipe.id(), new EquipeUpdateRequestDto(equipe.version(), nouveauCode, equipe.libelle()));

        assertThat(paieService.findById(bulletinId).equipe().code()).isEqualTo(nouveauCode);
    }

    @Test
    void un_compte_roles_et_permissions_refusees_sont_audites_avec_leurs_liaisons() {
        String s = Long.toHexString(System.nanoTime());
        Long permissionId = jdbc.queryForObject("SELECT id FROM permission WHERE code = 'PAIE_READ'", Long.class);
        RoleResponseDto role = roleService.create(new RoleCreateRequestDto("R-" + s, "rôle de test", Set.of(permissionId)));
        Map<String, Object> creationRole = uneEntree("ROLE_CREATION", role.id());
        assertThat(lignesAud("role_aud", revisionDe(creationRole), (short) 0)).isEqualTo(1);
        assertThat(lignesAud("role_permission_aud", revisionDe(creationRole), (short) 0)).isEqualTo(1);

        UserResponseDto compte = userService.create(new UserCreateRequestDto("u" + s, s + "@exemple.test", "motdepasse1", null, Set.of(role.id())));
        Map<String, Object> creationCompte = uneEntree("UTILISATEUR_CREATION", compte.id());
        assertThat(lignesAud("utilisateur_aud", revisionDe(creationCompte), (short) 0)).isEqualTo(1);
        assertThat(lignesAud("utilisateur_role_aud", revisionDe(creationCompte), (short) 0)).isEqualTo(1);

        // Désactivation : « actif » avant / après, et retrait du rôle.
        UserResponseDto desactive = userService.update(compte.id(), new UserUpdateRequestDto(compte.version(), compte.email(), false, null, Set.of()));
        Map<String, Object> modification = uneEntree("UTILISATEUR_MODIFICATION", compte.id());
        long revision = revisionDe(modification);
        assertThat(jdbc.queryForObject("SELECT actif FROM utilisateur_aud WHERE id = ? AND rev = ?", Boolean.class, compte.id(), revision)).isFalse();
        assertThat(lignesAud("utilisateur_role_aud", revision, (short) 2)).isEqualTo(1);

        userService.updateDeniedPermissions(compte.id(), new DenyPermissionsRequestDto(desactive.version(), Set.of(permissionId)));
        Map<String, Object> refus = uneEntree("UTILISATEUR_PERMISSIONS_REFUSEES", compte.id());
        assertThat(lignesAud("utilisateur_permission_refusee_aud", revisionDe(refus), (short) 0)).isEqualTo(1);

        roleService.update(role.id(), new RoleUpdateRequestDto(role.version(), "R-" + s, "décrit autrement", Set.of()));
        Map<String, Object> modificationRole = uneEntree("ROLE_MODIFICATION", role.id());
        assertThat(lignesAud("role_permission_aud", revisionDe(modificationRole), (short) 2)).isEqualTo(1);

        roleService.delete(role.id());
        Map<String, Object> suppressionRole = uneEntree("ROLE_SUPPRESSION", role.id());
        assertThat(lignesAud("role_aud", revisionDe(suppressionRole), (short) 2)).isEqualTo(1);
    }

    @Test
    void un_role_encore_attribue_n_est_pas_supprime_et_le_refus_est_trace() {
        String s = Long.toHexString(System.nanoTime());
        RoleResponseDto role = roleService.create(new RoleCreateRequestDto("R-" + s, null, Set.of()));
        userService.create(new UserCreateRequestDto("u" + s, s + "@exemple.test", "motdepasse1", null, Set.of(role.id())));

        assertThatThrownBy(() -> roleService.delete(role.id())).isInstanceOf(RoleInUseException.class);

        Map<String, Object> entree = uneEntree("ROLE_SUPPRESSION", role.id());
        assertThat(entree.get("resultat")).isEqualTo("ECHEC");
        assertThat(entree.get("motif")).isEqualTo("RoleInUseException");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM utilisateur_role WHERE role_id = ?", Long.class, role.id())).isEqualTo(1L);
    }

    @Test
    void le_role_administrateur_est_protege_contre_la_suppression() {
        Long adminId = jdbc.queryForObject("SELECT id FROM role WHERE nom = 'SYSTEM_ADMIN'", Long.class);

        assertThatThrownBy(() -> roleService.delete(adminId)).isInstanceOf(ProtectedRoleException.class);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM role WHERE id = ?", Long.class, adminId)).isEqualTo(1L);
        assertThat(entrees("ROLE_SUPPRESSION", adminId)).extracting(e -> e.get("resultat")).contains("ECHEC");
    }

    @Test
    void une_equipe_est_creee_puis_supprimee_sous_son_identifiant_de_cible() {
        EquipeResponseDto equipe = equipeService.create(new EquipeCreateRequestDto("Q" + Long.toHexString(System.nanoTime() % 100000), "Équipe " + System.nanoTime()));

        equipeService.delete(equipe.id());

        assertThat(uneEntree("EQUIPE_CREATION", equipe.id()).get("entite_type")).isEqualTo("Equipe");
        assertThat(lignesAud("equipe_aud", revisionDe(uneEntree("EQUIPE_SUPPRESSION", equipe.id())), (short) 2)).isEqualTo(1);
    }

    @Test
    void une_operation_volumineuse_supprime_mille_bulletins_sous_une_revision_et_une_entree() {
        YearMonth mois = YearMonth.of(2031, 7);
        Referentiel ref = donnees.creerReferentiel();
        int nombre = 1000;
        transaction.executeWithoutResult(statut -> {
            for (int i = 0; i < nombre; i++) {
                var employe = new staport.rh.employee.entities.Employee();
                employe.setNomPrenom("Vol " + ref.suffixe() + " " + i);
                employe.setCin("V" + ref.suffixe() + i);
                employe.setDateNaissance(java.time.LocalDate.of(1990, 1, 1));
                employe.setDateEmbauche(java.time.LocalDate.of(2020, 1, 1));
                employe.setFonction(em.getReference(staport.rh.function.entities.Function.class, ref.fonctionId()));
                employe.setChantier(em.getReference(staport.rh.chantier.entities.Chantier.class, ref.chantierId()));
                em.persist(employe);
                var paie = new staport.rh.paie.entities.Paie();
                paie.setEmployee(employe);
                paie.setPeriode(mois);
                paie.setFonction(em.getReference(staport.rh.function.entities.Function.class, ref.fonctionId()));
                paie.setChantier(em.getReference(staport.rh.chantier.entities.Chantier.class, ref.chantierId()));
                paie.setNombreJoursTravailles(BigDecimal.valueOf(26));
                paie.setSalaireMensuel(BigDecimal.TEN);
                paie.setSalaireTotal(BigDecimal.TEN);
                em.persist(paie);
            }
        });
        long dansLeMois = jdbc.queryForObject("SELECT count(*) FROM paie WHERE periode = 203107", Long.class);

        long supprimes = paieService.deleteGroupe(critereDuMois(mois), dansLeMois);

        assertThat(supprimes).isEqualTo(dansLeMois).isGreaterThanOrEqualTo(nombre);
        Map<String, Object> entree = jdbc.queryForMap("SELECT * FROM audit_journal WHERE action = 'PAIE_SUPPRESSION_GROUPE' ORDER BY id DESC LIMIT 1");
        assertThat(lignesAud("paie_aud", revisionDe(entree), (short) 2)).isEqualTo(supprimes);
    }
}
