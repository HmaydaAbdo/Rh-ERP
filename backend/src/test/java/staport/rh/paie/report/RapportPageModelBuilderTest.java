package staport.rh.paie.report;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Vérifie {@link RapportPageModelBuilder} — moteur de pagination 100% Java du rapport HTML
 * (voir son Javadoc).
 *
 * <p>Remplace l'ancien test exhaustif de {@code PaieReportPdfService.calculerSautPage}
 * (JasperReports, supprimé) : porte sur NOTRE modèle explicite ({@link PageModel}), jamais sur la
 * prédiction du comportement d'un moteur de rendu tiers — garantie plus forte, puisque
 * {@code RapportPageModelBuilder} décide lui-même la mise en page plutôt que de la contourner
 * après coup.
 */
class RapportPageModelBuilderTest {

    private final RapportPageModelBuilder builder = new RapportPageModelBuilder();

    /**
     * Constantes de hauteur utilisées par le moteur de pagination.
     *
     * <p>Ces valeurs permettent de reconstruire, à partir du seul résultat produit par le builder,
     * la hauteur de contenu de chaque page.
     *
     * <p>Si ces constantes changent un jour dans la classe testée, celles-ci doivent être mises
     * à jour avec (même principe que l'ancien test JasperReports).
     */
    private static final double PAGE_BODY_HAUTEUR = 495;
    private static final double MARGE_SECURITE = 8;

    private static final double TITRE_CHAPITRE_HAUTEUR = 24;
    private static final double EQUIPE_TITRE_HAUTEUR = 20;
    private static final double KPI_EQUIPE_HAUTEUR = 82;
    private static final double KPI_CARTE_HAUTEUR = 66;
    private static final double DETAILS_TITRE_HAUTEUR = 24;
    private static final double TABLEAU_ENTETE_HAUTEUR = 40;

    private static final double LIGNE_HAUTEUR = 16;
    private static final double RECAP_BASE_HAUTEUR = 34;
    private static final double RECAP_LIGNE_HAUTEUR = 15;

    /**
     * Balaie un large éventail de tailles de section (1 à 120 employés) croisé avec 0 à 16 lignes
     * de récap — au-delà de ce qui tient sur une page, le récap est découpé sur plusieurs pages — et vérifie, pour chaque combinaison :
     *
     * <ol>
     *     <li>tous les employés apparaissent EXACTEMENT une fois, sur une seule page ;</li>
     *     <li>aucune page ne dépasse la hauteur utile de page ;</li>
     *     <li>le pied récap n'est jamais accompagné d'un tableau employé VIDE
     *         (soit il suit des lignes réelles, soit il est seul sur sa page) ;</li>
     *     <li>la 1re page de la section porte bien le titre + les cartes KPI,
     *         les suivantes non.</li>
     * </ol>
     */
    @Test
    void construire_decoupeToujoursProprementQuelleQueSoitLaTaille() {

        for (int total = 1; total <= 120; total++) {

            for (int lignesRecapMax = 0;
                 lignesRecapMax <= Math.min(60, total);
                 lignesRecapMax++) {

                RapportBiVue vue = vueAvecUneEquipe(total, lignesRecapMax, false);

                List<PageModel> pages = builder.construire(vue);

                // La 1re page est toujours la synthèse globale.
                // La 2e page est toujours le chapitre chantier.
                // Les pages de la section équipe commencent donc à l'index 2.
                List<PageModel> pagesEquipe = pages.subList(2, pages.size());

                assertThat(pagesEquipe)
                        .as(
                                "total=%d, lignesRecapMax=%d : au moins une page pour la section",
                                total,
                                lignesRecapMax
                        )
                        .isNotEmpty();

                int lignesComptees = 0;
                int lignesRecapVues = 0;
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
                            hauteur += EQUIPE_TITRE_HAUTEUR;

                        } else if (bloc instanceof PageModel.BlocKpi) {

                            hauteur += KPI_EQUIPE_HAUTEUR;

                        } else if (bloc instanceof PageModel.BlocTitreSection) {

                            hauteur += DETAILS_TITRE_HAUTEUR;

                        } else if (bloc instanceof PageModel.BlocTableauEmployes b) {

                            assertThat(b.lignes())
                                    .as(
                                            "total=%d, lignesRecapMax=%d, page %d : "
                                                    + "un tableau employé ne doit jamais être vide",
                                            total,
                                            lignesRecapMax,
                                            p
                                    )
                                    .isNotEmpty();

                            lignesSurCettePage = b.lignes().size();

                            lignesComptees += lignesSurCettePage;

                            hauteur += lignesSurCettePage * LIGNE_HAUTEUR;

                            if (b.avecEnTeteColonnes()) {
                                hauteur += TABLEAU_ENTETE_HAUTEUR;
                            }

                        } else if (bloc instanceof PageModel.BlocRecap r) {

                            avecRecap = true;
                            lignesRecapVues += r.repartitionFonction().size();

                            hauteur += RECAP_BASE_HAUTEUR
                                    + RECAP_LIGNE_HAUTEUR * r.repartitionFonction().size();
                        }
                    }

                    assertThat(hauteur)
                            .as(
                                    "total=%d, lignesRecapMax=%d, page %d : "
                                            + "contenu dans la hauteur utile de page",
                                    total,
                                    lignesRecapMax,
                                    p
                            )
                            .isLessThanOrEqualTo(
                                    PAGE_BODY_HAUTEUR - MARGE_SECURITE + 0.001
                            );

                    /*
                     * Règle centrale :
                     * un récap ne doit jamais être accompagné de zéro ligne employé.
                     *
                     * Soit le récap suit au moins une ligne réelle sur SA page,
                     * soit la page contient uniquement le récap.
                     */
                    if (avecRecap && lignesSurCettePage == 0) {

                        assertThat(page.blocs())
                                .noneMatch(
                                        b -> b instanceof PageModel.BlocTableauEmployes
                                );
                    }

                    /*
                     * La première page de la section doit porter le titre équipe.
                     * Les pages suivantes ne doivent pas le porter.
                     */
                    if (p == 0) {

                        premierePageVue = avecTitreEquipe;

                    } else {

                        assertThat(avecTitreEquipe)
                                .as(
                                        "total=%d, lignesRecapMax=%d, page %d : "
                                                + "seule la 1re page porte le titre équipe",
                                        total,
                                        lignesRecapMax,
                                        p
                                )
                                .isFalse();
                    }
                }

                assertThat(premierePageVue)
                        .as(
                                "total=%d, lignesRecapMax=%d : "
                                        + "la 1re page de la section porte le titre équipe",
                                total,
                                lignesRecapMax
                        )
                        .isTrue();

                assertThat(lignesRecapVues)
                        .as("total=%d, lignesRecapMax=%d : chaque fonction du récap apparaît exactement une fois",
                                total, lignesRecapMax)
                        .isEqualTo(lignesRecapMax);

                assertThat(lignesComptees)
                        .as(
                                "total=%d, lignesRecapMax=%d : "
                                        + "chaque employé apparaît exactement une fois",
                                total,
                                lignesRecapMax
                        )
                        .isEqualTo(total);
            }
        }
    }

    /**
     * Chaque chantier démarre sur sa propre page, et chaque équipe/reste aussi —
     * jamais deux sections sur la même page
     * (demande explicite de direction, reconduite depuis JasperReports).
     */
    @Test
    void construire_chaqueChantierEtChaqueEquipeDemarreSaPropresPage() {

        RapportBiVue vue = vueAvecUneEquipe(5, 2, false);

        List<PageModel> pages = builder.construire(vue);

        assertThat(pages.get(0).niveauTexte())
                .isEqualTo("GLOBAL");

        assertThat(pages.get(1).blocs())
                .anyMatch(b -> b instanceof PageModel.BlocTitreChapitre);

        assertThat(pages.get(1).blocs())
                .noneMatch(b -> b instanceof PageModel.BlocTableauEmployes);

        assertThat(pages.get(2).blocs().get(0))
                .isInstanceOf(PageModel.BlocTitreEquipe.class);
    }

    /**
     * Sans détail par équipe (donc sans graphique « Répartition par équipe »), la section « reste » suit
     * directement les cartes KPI du chantier sur la même page, sans répéter son titre ni ses indicateurs : aucune page
     * ne porte le seul chapitre chantier, et rien ne déborde, quelle que soit la taille de la section.
     */
    @Test
    void construire_sansDetailEquipe_laSectionResteSuitLesCartesKpiDuChantierSurLaMemePage() {

        for (int total = 1; total <= 120; total++) {

            for (int lignesRecapMax = 0; lignesRecapMax <= Math.min(16, total); lignesRecapMax++) {

                List<PageModel> pages = builder.construire(vueAvecUneEquipe(total, lignesRecapMax, false, false));

                // page 0 = synthèse globale ; la 1re page du chantier porte tout l'en-tête puis la section
                List<PageModel.Bloc> premiere = pages.get(1).blocs();
                assertThat(premiere.subList(0, 3))
                        .as("total=%d, recap=%d : chapitre, KPI chantier puis directement le récap", total, lignesRecapMax)
                        .satisfiesExactly(
                                b -> assertThat(b).isInstanceOf(PageModel.BlocTitreChapitre.class),
                                b -> assertThat(b).isInstanceOf(PageModel.BlocKpi.class),
                                b -> assertThat(b).isInstanceOf(PageModel.BlocRecap.class));
                assertThat(premiere).noneMatch(b -> b instanceof PageModel.BlocGraphique);
                assertThat(pages.stream().flatMap(p -> p.blocs().stream()))
                        .as("total=%d, recap=%d : ni titre ni cartes KPI de section répétés", total, lignesRecapMax)
                        .noneMatch(b -> b instanceof PageModel.BlocTitreEquipe);
                assertThat(((PageModel.BlocKpi) premiere.get(1)).cartes().stream().map(CarteKpi::label))
                        .containsExactly("MASSE SALARIALE", "MASSE MOIS PRECEDENT", "ÉVOLUTION", "EFFECTIF",
                                "MASSE MOYENNE / EMPLOYÉ", "STC / SORTIES");

                int lignes = 0;
                for (int p = 1; p < pages.size(); p++) {
                    double hauteur = p == 1 ? TITRE_CHAPITRE_HAUTEUR + KPI_EQUIPE_HAUTEUR : 0;
                    for (PageModel.Bloc bloc : pages.get(p).blocs()) {
                        if (bloc instanceof PageModel.BlocTitreSection) {
                            hauteur += DETAILS_TITRE_HAUTEUR;
                        } else if (bloc instanceof PageModel.BlocTableauEmployes b) {
                            lignes += b.lignes().size();
                            hauteur += b.lignes().size() * LIGNE_HAUTEUR + (b.avecEnTeteColonnes() ? TABLEAU_ENTETE_HAUTEUR : 0);
                        } else if (bloc instanceof PageModel.BlocRecap r) {
                            hauteur += RECAP_BASE_HAUTEUR + RECAP_LIGNE_HAUTEUR * r.repartitionFonction().size();
                        }
                    }
                    assertThat(hauteur)
                            .as("total=%d, recap=%d, page %d : contenu dans la hauteur utile", total, lignesRecapMax, p)
                            .isLessThanOrEqualTo(PAGE_BODY_HAUTEUR - MARGE_SECURITE + 0.001);
                }
                assertThat(lignes).as("total=%d, recap=%d : chaque employé une fois", total, lignesRecapMax).isEqualTo(total);
            }
        }
    }

    /**
     * Numéro de page et total cohérents (1-based, total = nombre de pages hors couverture —
     * la couverture n'est pas un {@link PageModel}, voir {@code PaieReportHtmlBuilder}).
     */
    @Test
    void construire_numeroteLesPagesDeFaconCoherente() {

        RapportBiVue vue = vueAvecUneEquipe(50, 3, false);

        List<PageModel> pages = builder.construire(vue);

        for (int i = 0; i < pages.size(); i++) {

            assertThat(pages.get(i).numeroPage())
                    .isEqualTo(i + 1);

            assertThat(pages.get(i).totalPages())
                    .isEqualTo(pages.size());
        }
    }

    /** Récap trop long pour la page : il continue sur la page suivante (titre « (suite) ») au lieu de déborder sous
     * le pied de page, et le parc matériel reste avec la 1re tranche. */
    @Test
    void construire_recapTropLong_continueSurLaPageSuivante() {

        List<PageModel> pages = builder.construire(vueAvecUneEquipe(10, 45, true));

        List<PageModel.BlocRecap> recaps = pages.stream()
                .flatMap(p -> p.blocs().stream())
                .filter(PageModel.BlocRecap.class::isInstance)
                .map(PageModel.BlocRecap.class::cast)
                .toList();

        assertThat(recaps).hasSizeGreaterThan(1);
        assertThat(recaps.get(0).suite()).isFalse();
        assertThat(recaps.get(0).materiel()).isNotEmpty();
        assertThat(recaps.subList(1, recaps.size())).allSatisfy(r -> {
            assertThat(r.suite()).isTrue();
            assertThat(r.materiel()).isEmpty();
        });
        assertThat(recaps.stream().mapToInt(r -> r.repartitionFonction().size()).sum()).isEqualTo(45);
    }

    /** Une cellule dont le texte dépasse sa largeur passe à la ligne : la ligne grandit, donc moins de lignes tiennent
     * par page — et tous les employés restent affichés exactement une fois. */
    @Test
    void construire_celluleTropLongue_agrandiLaLigneEtLaPagination() {

        String observationLongue = "Observation très longue qui ne tient pas sur une seule ligne de la colonne Obs du tableau";

        List<PageModel> courtes = builder.construire(vueAvecUneEquipe(80, 3, false, true, ""));
        List<PageModel> longues = builder.construire(vueAvecUneEquipe(80, 3, false, true, observationLongue));

        assertThat(longues.size()).isGreaterThan(courtes.size());
        assertThat(lignesEmployes(longues)).isEqualTo(80);
        assertThat(longues.stream().flatMap(p -> p.blocs().stream())
                .filter(PageModel.BlocTableauEmployes.class::isInstance)
                .map(PageModel.BlocTableauEmployes.class::cast)
                .mapToInt(b -> b.lignes().size()))
                .allMatch(n -> n <= 19);
    }

    private int lignesEmployes(List<PageModel> pages) {
        return pages.stream().flatMap(p -> p.blocs().stream())
                .filter(PageModel.BlocTableauEmployes.class::isInstance)
                .map(PageModel.BlocTableauEmployes.class::cast)
                .mapToInt(b -> b.lignes().size())
                .sum();
    }

    /** Une carte KPI dont le texte passe à la ligne agrandit toute la rangée ; sinon elle garde sa hauteur de base. */
    @Test
    void blocKpi_agrandiLesCartesQuandLeTextePasseALaLigne() {

        PageModel.BlocKpi courte = builder.blocKpi(List.of(
                new CarteKpi("EFFECTIF", "56", "compte"),
                new CarteKpi("MASSE SALARIALE", "280 000,00 DH", "montant")));
        PageModel.BlocKpi longue = builder.blocKpi(List.of(
                new CarteKpi("EFFECTIF", "56", "compte"),
                new CarteKpi("ÉVOLUTION", List.of("+12 345 678 901,00 DH (+123,4 %)", "+120 personnes",
                        "une troisième ligne", "et une quatrième ligne de valeur"), "montant")));

        assertThat(courte.hauteurCarte()).isEqualTo(KPI_CARTE_HAUTEUR);
        assertThat(longue.hauteurCarte()).isGreaterThan(KPI_CARTE_HAUTEUR);
    }

    /** Mois précédent introuvable : le libellé reste, la valeur est vide (jamais le texte « INTROUVABLE »). */
    @Test
    void construire_moisPrecedentIntrouvable_gardeLeLibelleSansValeur() {

        List<PageModel> pages = builder.construire(vueAvecUneEquipe(5, 1, false));

        // Aux 3 niveaux (global, chantier, section), la carte reste avec une valeur vide — et l'évolution aussi
        List<CarteKpi> moisPrecedent = pages.stream()
                .flatMap(p -> cartesKpi(p).stream())
                .filter(c -> c.label().equals("MASSE MOIS PRECEDENT") || c.label().equals("ÉVOLUTION"))
                .toList();
        assertThat(moisPrecedent).hasSize(6);
        assertThat(moisPrecedent).allSatisfy(c -> assertThat(c.valeurs()).containsExactly(""));
    }

    private List<CarteKpi> cartesKpi(PageModel page) {
        return page.blocs().stream()
                .filter(PageModel.BlocKpi.class::isInstance)
                .map(PageModel.BlocKpi.class::cast)
                .flatMap(b -> b.cartes().stream())
                .toList();
    }

    private RapportBiVue vueAvecUneEquipe(
            int totalEmployes,
            int lignesRecapMax,
            boolean avecMateriel
    ) {
        return vueAvecUneEquipe(totalEmployes, lignesRecapMax, avecMateriel, true);
    }

    private RapportBiVue vueAvecUneEquipe(
            int totalEmployes,
            int lignesRecapMax,
            boolean avecMateriel,
            boolean avecDetailEquipe
    ) {
        return vueAvecUneEquipe(totalEmployes, lignesRecapMax, avecMateriel, avecDetailEquipe, "");
    }

    private RapportBiVue vueAvecUneEquipe(
            int totalEmployes,
            int lignesRecapMax,
            boolean avecMateriel,
            boolean avecDetailEquipe,
            String observation
    ) {

        List<LigneEmployeVue> employes = new ArrayList<>();

        for (int i = 0; i < totalEmployes; i++) {

            employes.add(
                    new LigneEmployeVue(
                            "EMPLOYE " + i,
                            "FONCTION " + (i % Math.max(1, lignesRecapMax)),
                            "CIN" + i,
                            26,
                            "-",
                            "-",
                            "5 000,00",
                            "-",
                            "-",
                            "5 000,00",
                            observation,
                            ""
                    )
            );
        }

        List<RepartitionBean> repartitionFonction = new ArrayList<>();

        for (int i = 0; i < lignesRecapMax; i++) {

            repartitionFonction.add(
                    new RepartitionBean(
                            "FONCTION " + i,
                            1,
                            BigDecimal.TEN,
                            0,
                            BigDecimal.ZERO
                    )
            );
        }

        List<MaterielLigneVue> materiel =
                avecMateriel
                        ? List.of(
                        new MaterielLigneVue("CAMION CITERNE", null)
                )
                        : List.of();

        KpiMontantVue masse =
                new KpiMontantVue(
                        "10 000,00",
                        null,
                        null,
                        null
                );

        KpiEffectifVue effectif =
                new KpiEffectifVue(
                        totalEmployes,
                        0,
                        "+" + totalEmployes
                );

        EquipeBiVue equipe =
                new EquipeBiVue(
                        "EQ",
                        "ÉQUIPE : TEST",
                        "TEST",
                        effectif,
                        masse,
                        "1 000,00",
                        0,
                        repartitionFonction,
                        materiel,
                        employes
                );

        ChantierBiVue chantier =
                new ChantierBiVue(
                        "C1",
                        "C1",
                        "CHANTIER : C1",
                        masse,
                        effectif,
                        "1 000,00",
                        0,
                        List.of(),
                        List.of(),
                        List.of(equipe),
                        avecDetailEquipe
                );

        SyntheseGlobaleVue synthese =
                new SyntheseGlobaleVue(
                        masse,
                        effectif,
                        "1 000,00",
                        1,
                        0,
                        List.of(),
                        List.of(),
                        List.of()
                );

        return new RapportBiVue(
                "Septembre 2026",
                List.of(),
                synthese,
                List.of(chantier)
        );
    }
}