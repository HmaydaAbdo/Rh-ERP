package staport.rh.audit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.web.servlet.MockMvc;
import staport.rh.audit.dtos.request.AuditSearchCriteria;
import staport.rh.audit.dtos.response.AuditChampDto;
import staport.rh.audit.dtos.response.AuditChangementDto;
import staport.rh.audit.dtos.response.AuditJournalDto;
import staport.rh.audit.dtos.response.AuditVersionDto;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.exceptions.AuditEntryNotFoundException;
import staport.rh.audit.exceptions.UnknownAuditEntityException;
import staport.rh.audit.services.interfaces.IAuditJournalService;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.RoleUpdateRequestDto;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.security.JwtService;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.services.interfaces.IRoleService;
import staport.rh.auth.services.interfaces.IUserService;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.services.interfaces.IPaieService;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Phase 3 : la consultation du journal — recherche, entrée, différences champ par champ, historique, permission. */
@AutoConfigureMockMvc
class AuditConsultationTest extends AuditIntegrationTestBase {

    @Autowired
    private IAuditJournalService consultation;
    @Autowired
    private IPaieService paieService;
    @Autowired
    private IRoleService roleService;
    @Autowired
    private IUserService userService;
    @Autowired
    private JwtService jwtService;
    @Autowired
    private MockMvc mockMvc;

    private static final Pageable PAGE = PageRequest.of(0, 50);

    private PaieCreateRequestDto bulletin(Referentiel ref, YearMonth periode, String salaire) {
        return new PaieCreateRequestDto(ref.employeId(), periode, ref.fonctionId(), ref.chantierId(), ref.equipeId(), 26,
                null, null, new BigDecimal(salaire), null, null, new BigDecimal(salaire), null);
    }

    private PaieUpdateRequestDto modification(Long version, Referentiel ref, String salaire) {
        return new PaieUpdateRequestDto(version, ref.fonctionId(), ref.chantierId(), ref.equipeId(), 26, null, null,
                new BigDecimal(salaire), null, null, new BigDecimal(salaire), "revu");
    }

    private AuditChampDto champ(AuditChangementDto changement, String nom) {
        return changement.champs().stream().filter(c -> c.champ().equals(nom)).findFirst().orElse(null);
    }

    @Test
    void le_detail_d_une_creation_donne_les_valeurs_apres_avec_les_relations_en_identifiant_et_libelle() {
        Referentiel ref = donnees.creerReferentiel();
        PaieResponseDto cree = paieService.create(bulletin(ref, YearMonth.of(2034, 1), "3200.00"));
        Long entree = ((Number) uneEntree("PAIE_CREATION", cree.id()).get("id")).longValue();

        List<AuditChangementDto> changements = consultation.details(entree, PAGE).getContent();

        assertThat(changements).hasSize(1);
        AuditChangementDto changement = changements.get(0);
        assertThat(changement.operation()).isEqualTo("AJOUT");
        assertThat(changement.entiteType()).isEqualTo("Paie");
        assertThat(changement.entiteId()).isEqualTo(cree.id());
        assertThat(champ(changement, "salaireTotal").apres()).isEqualTo("3200.00");
        assertThat(champ(changement, "salaireTotal").avant()).isNull();
        assertThat(champ(changement, "periode").apres()).isEqualTo("2034-01");
        assertThat(champ(changement, "chantier").apres()).isEqualTo(ref.chantierId() + " — C-" + ref.suffixe());
        assertThat(champ(changement, "employee").apres()).isEqualTo(ref.employeId() + " — Nom " + ref.suffixe());
    }

    @Test
    void le_detail_d_une_modification_ne_montre_que_ce_qui_a_change_avec_son_avant_et_son_apres() {
        Referentiel ref = donnees.creerReferentiel();
        PaieResponseDto cree = paieService.create(bulletin(ref, YearMonth.of(2034, 2), "3000.00"));
        paieService.update(cree.id(), modification(cree.version(), ref, "3500.00"));
        Long entree = ((Number) uneEntree("PAIE_MODIFICATION", cree.id()).get("id")).longValue();

        AuditChangementDto changement = consultation.details(entree, PAGE).getContent().get(0);

        assertThat(changement.operation()).isEqualTo("MODIFICATION");
        assertThat(changement.champs()).extracting(AuditChampDto::champ).containsExactlyInAnyOrder("salaireMensuel", "salaireTotal", "observation");
        assertThat(champ(changement, "salaireTotal").avant()).isEqualTo("3000.00");
        assertThat(champ(changement, "salaireTotal").apres()).isEqualTo("3500.00");
    }

    @Test
    void le_detail_d_une_suppression_garde_les_valeurs_d_avant_du_contenu_supprime() {
        Referentiel ref = donnees.creerReferentiel();
        PaieResponseDto cree = paieService.create(bulletin(ref, YearMonth.of(2034, 3), "2800.00"));
        paieService.delete(cree.id());
        Long entree = ((Number) uneEntree("PAIE_SUPPRESSION", cree.id()).get("id")).longValue();

        AuditChangementDto changement = consultation.details(entree, PAGE).getContent().get(0);

        assertThat(changement.operation()).isEqualTo("SUPPRESSION");
        assertThat(champ(changement, "salaireTotal").avant()).isEqualTo("2800.00");
        assertThat(champ(changement, "salaireTotal").apres()).isNull();
    }

    @Test
    void le_detail_d_une_suppression_en_groupe_est_pagine() {
        YearMonth mois = YearMonth.of(2034, 4);
        for (int i = 0; i < 3; i++) {
            donnees.creerBulletin(donnees.creerReferentiel(), mois);
        }
        long dansLeMois = paieService.search(new PaieSearchCriteria(null, null, mois, null, null, null), Pageable.unpaged()).getTotalElements();
        paieService.deleteGroupe(new PaieSearchCriteria(null, null, mois, null, null, null), dansLeMois);
        Long entree = jdbc.queryForObject("SELECT max(id) FROM audit_journal WHERE action = 'PAIE_SUPPRESSION_GROUPE'", Long.class);

        var premiere = consultation.details(entree, PageRequest.of(0, 2));
        var derniere = consultation.details(entree, PageRequest.of(1, 2));

        assertThat(premiere.getTotalElements()).isEqualTo(dansLeMois);
        assertThat(premiere.getContent()).hasSize(2).allMatch(c -> c.operation().equals("SUPPRESSION"));
        assertThat(derniere.getContent()).hasSize((int) dansLeMois - 2);
        assertThat(premiere.getContent().get(0).entiteId()).isNotEqualTo(derniere.getContent().get(0).entiteId());
    }

    @Test
    void les_droits_ajoutes_et_retires_se_lisent_comme_des_elements_ajoutes_et_retires_sans_aucun_mot_de_passe() {
        String s = Long.toHexString(System.nanoTime());
        Long lecture = jdbc.queryForObject("SELECT id FROM permission WHERE code = 'PAIE_READ'", Long.class);
        Long ecriture = jdbc.queryForObject("SELECT id FROM permission WHERE code = 'PAIE_WRITE'", Long.class);
        RoleResponseDto role = roleService.create(new RoleCreateRequestDto("R-" + s, null, Set.of(lecture)));
        roleService.update(role.id(), new RoleUpdateRequestDto(role.version(), "R-" + s, null, Set.of(ecriture)));
        Long entree = ((Number) uneEntree("ROLE_MODIFICATION", role.id()).get("id")).longValue();

        AuditChangementDto changement = consultation.details(entree, PAGE).getContent().stream()
                .filter(c -> c.entiteType().equals("Role")).findFirst().orElseThrow();

        AuditChampDto permissions = champ(changement, "permissions");
        assertThat(permissions.ajoutes()).hasSize(1).first().asString().contains("PAIE_WRITE");
        assertThat(permissions.retires()).hasSize(1).first().asString().contains("PAIE_READ");

        // Un compte : aucun champ de mot de passe, jamais.
        var compte = userService.create(new UserCreateRequestDto("u" + s, s + "@exemple.test", "motdepasse-1", null, Set.of()));
        Long creation = ((Number) uneEntree("UTILISATEUR_CREATION", compte.id()).get("id")).longValue();
        assertThat(consultation.details(creation, PAGE).getContent().get(0).champs())
                .extracting(AuditChampDto::champ).doesNotContain("motDePasseHash").contains("username", "email", "actif");
    }

    @Test
    void une_operation_echouee_ou_sans_revision_a_un_detail_vide() {
        assertThatThrownBy(() -> paieService.deleteGroupe(new PaieSearchCriteria(null, null, YearMonth.of(2034, 5), null, null, null), 99_999))
                .isInstanceOf(RuntimeException.class);
        Long echec = jdbc.queryForObject("SELECT max(id) FROM audit_journal WHERE action = 'PAIE_SUPPRESSION_GROUPE'", Long.class);

        assertThat(consultation.details(echec, PAGE).getContent()).isEmpty();
    }

    @Test
    void l_historique_d_un_enregistrement_liste_ses_versions_de_la_plus_recente_a_la_plus_ancienne() {
        Referentiel ref = donnees.creerReferentiel();
        PaieResponseDto cree = paieService.create(bulletin(ref, YearMonth.of(2034, 6), "3000.00"));
        PaieResponseDto modifie = paieService.update(cree.id(), modification(cree.version(), ref, "3100.00"));
        paieService.update(cree.id(), modification(modifie.version(), ref, "3200.00"));

        List<AuditVersionDto> versions = consultation.historique("paie", cree.id(), PAGE).getContent();

        assertThat(versions).extracting(AuditVersionDto::operation).containsExactly("MODIFICATION", "MODIFICATION", "AJOUT");
        assertThat(versions.get(0).utilisateurNom()).isEqualTo(UTILISATEUR_NOM);
        assertThat(versions.get(0).champs()).anyMatch(c -> c.champ().equals("salaireTotal") && "3100.00".equals(c.avant()) && "3200.00".equals(c.apres()));
        assertThat(consultation.historique("PAIE", cree.id(), PAGE).getTotalElements()).as("nom insensible à la casse").isEqualTo(3);
    }

    @Test
    void une_entite_ou_une_entree_inconnue_est_introuvable() {
        assertThatThrownBy(() -> consultation.historique("n-importe-quoi", 1L, PAGE)).isInstanceOf(UnknownAuditEntityException.class);
        assertThatThrownBy(() -> consultation.findById(-1L)).isInstanceOf(AuditEntryNotFoundException.class);
    }

    @Test
    void la_recherche_filtre_par_utilisateur_categorie_action_et_dates_sans_interpreter_les_jokers() {
        Referentiel ref = donnees.creerReferentiel();
        PaieResponseDto cree = paieService.create(bulletin(ref, YearMonth.of(2034, 7), "3000.00"));
        Instant avant = Instant.now().minusSeconds(60);

        var parAction = consultation.search(new AuditSearchCriteria(avant, null, null, CategorieAudit.OPERATION, "PAIE_CREATION", null,
                "Paie", cree.id(), null), PAGE);
        var parUtilisateur = consultation.search(new AuditSearchCriteria(avant, null, "TESTE", null, null, null, "Paie", cree.id(), null), PAGE);
        var jokerNeFiltrePasTout = consultation.search(new AuditSearchCriteria(null, null, "%", null, null, null, "Paie", cree.id(), null), PAGE);
        var dansLeFutur = consultation.search(new AuditSearchCriteria(Instant.now().plusSeconds(3600), null, null, null, null, null, "Paie", cree.id(), null), PAGE);

        assertThat(parAction.getContent()).hasSize(1);
        assertThat(parAction.getContent().get(0).utilisateurNom()).isEqualTo(UTILISATEUR_NOM);
        assertThat(parUtilisateur.getContent()).as("« contient », sans casse").hasSize(1);
        assertThat(jokerNeFiltrePasTout.getContent()).as("« % » est un caractère ordinaire, pas un joker").isEmpty();
        assertThat(dansLeFutur.getContent()).isEmpty();
    }

    @Test
    void chaque_colonne_triable_du_journal_est_un_chemin_de_tri_valide() {
        // Un chemin de tri invalide provoque une erreur 500 : ce sont les champs de tri de l'écran Journal.
        for (String champ : List.of("horodatage", "categorie", "action", "resultat", "utilisateurNom", "origine", "entiteType",
                "nombreElements", "motif")) {
            assertThat(consultation.search(null, PageRequest.of(0, 5, org.springframework.data.domain.Sort.by(champ).descending())))
                    .as("tri par %s", champ).isNotNull();
        }
    }

    @Test
    void une_entree_se_lit_avec_son_perimetre_decode() {
        YearMonth mois = YearMonth.of(2034, 8);
        donnees.creerBulletin(donnees.creerReferentiel(), mois);
        long dansLeMois = paieService.search(new PaieSearchCriteria(null, null, mois, null, null, null), Pageable.unpaged()).getTotalElements();
        paieService.deleteGroupe(new PaieSearchCriteria(null, null, mois, null, null, null), dansLeMois);
        Long id = jdbc.queryForObject("SELECT max(id) FROM audit_journal WHERE action = 'PAIE_SUPPRESSION_GROUPE'", Long.class);

        AuditJournalDto entree = consultation.findById(id);

        assertThat(entree.perimetre()).containsEntry("periode", "2034-08").containsEntry("nombreConfirme", (int) dansLeMois);
        assertThat(entree.revisionId()).isNotNull();
    }

    // --- sécurité de la consultation ---

    private String jeton(Set<String> permissions) {
        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setId(UTILISATEUR_ID);
        utilisateur.setUsername(UTILISATEUR_NOM);
        return jwtService.genererAccessToken(utilisateur, permissions, Set.of());
    }

    @Test
    void la_consultation_exige_la_permission_d_audit() throws Exception {
        mockMvc.perform(post("/logs/search").header("Authorization", "Bearer " + jeton(Set.of("PAIE_READ")))
                        .contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/logs/historique/paie/1").header("Authorization", "Bearer " + jeton(Set.of("PAIE_READ"))))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/logs/search?size=5&sort=horodatage,desc").header("Authorization", "Bearer " + jeton(Set.of("AUDIT_READ")))
                        .contentType("application/json").content("{\"categorie\":\"OPERATION\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray());
        mockMvc.perform(get("/logs/historique/inconnue/1").header("Authorization", "Bearer " + jeton(Set.of("AUDIT_READ"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void aucune_route_ne_modifie_ni_ne_supprime_le_journal() throws Exception {
        String lecteur = "Bearer " + jeton(Set.of("AUDIT_READ", "PAIE_DELETE", "USER_MANAGE", "ROLE_MANAGE"));
        for (String route : List.of("/logs/1", "/logs/search", "/logs")) {
            mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(route).header("Authorization", lecteur))
                    .andExpect(status().is4xxClientError());
            mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(route).header("Authorization", lecteur)
                            .contentType("application/json").content("{}"))
                    .andExpect(status().is4xxClientError());
        }
    }
}
