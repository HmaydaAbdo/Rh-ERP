package staport.rh.paie.report;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Vérifie {@link RapportPageModelBuilder} — moteur de pagination 100% Java du rapport HTML (voir
 * son Javadoc). Remplace l'ancien test exhaustif de {@code PaieReportPdfService.calculerSautPage}
 * (JasperReports, supprimé) : porte sur NOTRE modèle explicite ({@link PageModel}), jamais sur la
 * prédiction du comportement d'un moteur de rendu tiers — garantie plus forte, puisque {@code
 * RapportPageModelBuilder} décide lui-même la mise en page plutôt que de la contourner après coup. */
class RapportPageModelBuilderTest {

    private final RapportPageModelBuilder builder = new RapportPageModelBuilder();

    /** Reproduit les constantes de {@code RapportPageModelBuilder} pour reconstruire, à partir du
     * seul résultat, la hauteur de contenu de chaque page — si ces constantes changent un jour dans
     * la classe testée, celles-ci doivent être mises à jour avec (même principe que l'ancien test
     * JasperReports). */
    private static final double PAGE_BODY_HAUTEUR = 495;
    private static final double MARGE_SECURITE = 8;
    private static final double EQUIPE_ENTETE_HAUTEUR = 100;
    private static final double LIGNE_HAUTEUR = 16;
    private static final double RECAP_BASE_HAUTEUR = 34;
    private static final double RECAP_LIGNE_HAUTEUR = 15;

    /** Balaie un large éventail de tailles de section (1 à 120 employés) croisé avec 0 à 16 lignes
     * de récap (voir la même borne dans l'ancien test JasperReports, plus grand cas réel observé :
     * 14 fonctions distinctes) et vérifie, pour chaque combinaison : (1) tous les employés
     * apparaissent EXACTEMENT une fois, sur une seule page ; (2) aucune page ne dépasse la hauteur
     * utile de page ; (3) le pied récap n'est jamais accompagné d'un tableau employé VIDE (soit il
     * suit des lignes réelles, soit il est seul sur sa page) ; (4) la 1re page de la section porte
     * bien le titre + les cartes KPI, les suivantes non. */
    @Test
    void construire_decoupeToujoursProprementQuelleQueSoitLaTaille() {
        for (int total = 1; total <= 120; total++) {
            for (int lignesRecapMax = 0; lignesRecapMax <= Math.min(16, total); lignesRecapMax++) {
                RapportBiVue vue = vueAvecUneEquipe(total, lignesRecapMax, false);
                List<PageModel> pages = builder.construire(vue);

                // La 1re page (index 0) est toujours la synthèse globale — les pages de la section
                // équipe testée commencent à l'index 2 (page globale + page chantier).
                List<PageModel> pagesEquipe = pages.subList(2, pages.size());

                assertThat(pagesEquipe)
                        .as("total=%d, lignesRecapMax=%d : au moins une page pour la section", total, lignesRecapMax)
                        .isNotEmpty();

                int lignesComptees = 0;
                boolean premierePageVue = false;
                for (int p = 0; p < pagesEquipe.size(); p++) {
                    PageModel page = pagesEquipe.get(p);
                    double hauteur = 0;
                    boolean avecTitreEquipe = false;
                    int lignesSurCettePage = 0;
                    boolean avecRecap = false;

                    for (PageModel.Bloc bloc : page.blocs()) {
                        if (bloc instanceof PageModel.BlocTitreEquipe) {
                            avecTitreEquipe = true;
                            hauteur += EQUIPE_ENTETE_HAUTEUR;
                        } else if (bloc instanceof PageModel.BlocKpi) {
                            // hauteur déjà comptée avec BlocTitreEquipe (EQUIPE_ENTETE_HAUTEUR couvre les deux)
                        } else if (bloc instanceof PageModel.BlocTableauEmployes b) {
                            assertThat(b.lignes())
                                    .as("total=%d, lignesRecapMax=%d, page %d : un tableau employé ne doit jamais être vide",
                                            total, lignesRecapMax, p)
                                    .isNotEmpty();
                            lignesSurCettePage = b.lignes().size();
                            lignesComptees += lignesSurCettePage;
                            hauteur += lignesSurCettePage * LIGNE_HAUTEUR;
                        } else if (bloc instanceof PageModel.BlocRecap) {
                            avecRecap = true;
                            hauteur += RECAP_BASE_HAUTEUR + RECAP_LIGNE_HAUTEUR * lignesRecapMax;
                        }
                    }

                    assertThat(hauteur)
                            .as("total=%d, lignesRecapMax=%d, page %d : contenu dans la hauteur utile de page",
                                    total, lignesRecapMax, p)
                            .isLessThanOrEqualTo(PAGE_BODY_HAUTEUR - MARGE_SECURITE + 0.001);

                    // Règle centrale : un récap ne doit jamais être accompagné de zéro ligne employé
                    // (soit il suit >=1 ligne réelle sur SA page, soit la page n'a pas de tableau du
                    // tout — vérifié juste au-dessus que le tableau, quand présent, n'est jamais vide).
                    if (avecRecap && lignesSurCettePage == 0) {
                        assertThat(page.blocs()).noneMatch(b -> b instanceof PageModel.BlocTableauEmployes);
                    }

                    if (p == 0) {
                        premierePageVue = avecTitreEquipe;
                    } else {
                        assertThat(avecTitreEquipe)
                                .as("total=%d, lignesRecapMax=%d, page %d : seule la 1re page porte le titre équipe",
                                        total, lignesRecapMax, p)
                                .isFalse();
                    }
                }

                assertThat(premierePageVue)
                        .as("total=%d, lignesRecapMax=%d : la 1re page de la section porte le titre équipe", total, lignesRecapMax)
                        .isTrue();
                assertThat(lignesComptees)
                        .as("total=%d, lignesRecapMax=%d : chaque employé apparaît exactement une fois", total, lignesRecapMax)
                        .isEqualTo(total);
            }
        }
    }

    /** Chaque chantier démarre sur sa propre page, et chaque équipe/reste aussi — jamais deux
     * sections sur la même page (demande explicite de direction, reconduite depuis JasperReports). */
    @Test
    void construire_chaqueChantierEtChaqueEquipeDemarreSaPropresPage() {
        RapportBiVue vue = vueAvecUneEquipe(5, 2, false);
        List<PageModel> pages = builder.construire(vue);

        assertThat(pages.get(0).niveauTexte()).isEqualTo("GLOBAL");
        assertThat(pages.get(1).blocs()).anyMatch(b -> b instanceof PageModel.BlocTitreChapitre);
        assertThat(pages.get(1).blocs()).noneMatch(b -> b instanceof PageModel.BlocTableauEmployes);
        assertThat(pages.get(2).blocs().get(0)).isInstanceOf(PageModel.BlocTitreEquipe.class);
    }

    /** Numéro de page et total cohérents (1-based, total = nombre de pages hors couverture — la
     * couverture n'est pas un {@link PageModel}, voir {@code PaieReportHtmlBuilder}). */
    @Test
    void construire_numeroteLesPagesDeFaconCoherente() {
        RapportBiVue vue = vueAvecUneEquipe(50, 3, false);
        List<PageModel> pages = builder.construire(vue);

        for (int i = 0; i < pages.size(); i++) {
            assertThat(pages.get(i).numeroPage()).isEqualTo(i + 1);
            assertThat(pages.get(i).totalPages()).isEqualTo(pages.size());
        }
    }

    private RapportBiVue vueAvecUneEquipe(int totalEmployes, int lignesRecapMax, boolean avecMateriel) {
        List<LigneEmployeVue> employes = new ArrayList<>();
        for (int i = 0; i < totalEmployes; i++) {
            employes.add(new LigneEmployeVue("EMPLOYE " + i, "FONCTION " + (i % Math.max(1, lignesRecapMax)),
                    "CIN" + i, 26, "-", "-", "5 000,00", "-", "-", "5 000,00", "", ""));
        }
        List<RepartitionBean> repartitionFonction = new ArrayList<>();
        for (int i = 0; i < lignesRecapMax; i++) {
            repartitionFonction.add(new RepartitionBean("FONCTION " + i, 1, BigDecimal.TEN, 0, BigDecimal.ZERO));
        }
        List<MaterielLigneVue> materiel = avecMateriel ? List.of(new MaterielLigneVue("CAMION CITERNE")) : List.of();

        EquipeBiVue equipe = new EquipeBiVue("EQ", "ÉQUIPE : TEST", "TEST", totalEmployes, "10 000,00", "100,0 %",
                0, "INTROUVABLE", repartitionFonction, materiel, employes);

        KpiMontantVue masse = new KpiMontantVue("10 000,00", "INTROUVABLE", null, null, PaieReportNumberFormat.Tendance.NON_DISPONIBLE);
        KpiEffectifVue effectif = new KpiEffectifVue(totalEmployes, 0, "+" + totalEmployes);
        ChantierBiVue chantier = new ChantierBiVue("C1", "C1", "CHANTIER : C1", masse, effectif, "1 000,00", 0,
                List.of(), List.of(), List.of(equipe), true);

        SyntheseGlobaleVue synthese = new SyntheseGlobaleVue(masse, effectif, "1 000,00", 1, 0, List.of(), List.of(), List.of());
        return new RapportBiVue("Septembre 2026", List.of(), synthese, List.of(chantier));
    }
}
