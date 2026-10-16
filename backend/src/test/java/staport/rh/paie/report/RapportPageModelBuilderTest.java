package staport.rh.paie.report;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;

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
    private static final double KPI_EQUIPE_HAUTEUR = 70;
    private static final double KPI_CARTE_HAUTEUR = 54;
    private static final double DETAILS_TITRE_HAUTEUR = 18;
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
     *     <li>dans le cas sans équipe sélectionnée, le détail reste fusionné au chapitre chantier
     *         et ne répète pas le titre d'équipe ni ses cartes KPI.</li>
     * </ol>
     */
    @Test
    void construire_decoupeToujoursProprementQuelleQueSoitLaTaille() {

        for (int total = 1; total <= 120; total++) {

            for (int lignesRecapMax = 0;
                 lignesRecapMax <= Math.min(60, total);
                 lignesRecapMax++) {

                // Ce balayage couvre la pagination du récapitulatif fonctionnel. Avec une équipe
                // sélectionnée, cette rubrique est un graphique (sans lignes de récapitulatif).
                RapportBiVue vue = vueAvecUneEquipe(total, lignesRecapMax, false, false);

                List<PageModel> pages = builder.construire(vue);

                // Pages 0-1 = synthèse globale, 2-3 = analyse du chantier, puis son détail équipe.
                List<PageModel> pagesEquipe = pages.subList(4, pages.size());

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
                                        + "le détail fusionné au chantier ne répète pas le titre équipe",
                                total,
                                lignesRecapMax
                        )
                        .isFalse();

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

    /** Les deux évolutions partagent la page d'analyse globale, chantier et équipe sélectionnée. */
    @Test
    void construire_groupeLesDeuxEvolutionsSurChaquePageAnalyse() {

        RapportBiVue vue = vueAvecUneEquipe(5, 2, false);

        List<PageModel> pages = builder.construire(vue);
        PageModel global = pages.stream().filter(page -> "GLOBAL".equals(page.niveauTexte()))
                .filter(page -> page.blocs().stream().anyMatch(PageModel.BlocTitreChapitre.class::isInstance))
                .findFirst().orElseThrow();
        assertThat(global.blocs()).filteredOn(PageModel.BlocTitreRubrique.class::isInstance)
                .map(PageModel.BlocTitreRubrique.class::cast)
                .extracting(PageModel.BlocTitreRubrique::numero)
                .containsExactly(1, 2);
        assertThat(global.blocs()).filteredOn(PageModel.BlocGraphiqueEvolution.class::isInstance)
                .map(PageModel.BlocGraphiqueEvolution.class::cast)
                .extracting(PageModel.BlocGraphiqueEvolution::groupe)
                .containsExactly(PageModel.GroupeEvolution.MASSE_EFFECTIF, PageModel.GroupeEvolution.STC);

        PageModel analyseChantier = pages.stream().filter(page -> page.blocs().stream()
                        .anyMatch(PageModel.BlocTitreChapitre.class::isInstance))
                .filter(page -> "GLOBAL".equals(page.niveauTexte()) == false)
                .findFirst().orElseThrow();
        assertThat(analyseChantier.blocs()).filteredOn(PageModel.BlocTitreRubrique.class::isInstance)
                .map(PageModel.BlocTitreRubrique.class::cast)
                .extracting(PageModel.BlocTitreRubrique::numero)
                .containsExactly(1, 2);
        assertThat(analyseChantier.blocs()).filteredOn(PageModel.BlocGraphiqueEvolution.class::isInstance)
                .map(PageModel.BlocGraphiqueEvolution.class::cast)
                .extracting(PageModel.BlocGraphiqueEvolution::groupe)
                .containsExactly(PageModel.GroupeEvolution.MASSE_EFFECTIF, PageModel.GroupeEvolution.STC);

        assertThat(cartesKpi(analyseChantier).stream().filter(c -> c.label().equals("MASSE SALARIALE")).toList())
                .singleElement().extracting(CarteKpi::sousTexte).isNull();
    }

    /**
     * Rapport limité à un chantier (demande de direction, 2026-10-10) : sans vue d'ensemble, aucune page « GLOBAL » ; le
     * premier chantier est le chapitre I (et non II), et le contenu du chantier est inchangé.
     */
    @Test
    void construire_sansVueEnsembleLeRapportCommenceParLePremierChantierNumeroteI() {

        RapportBiVue vue = vueAvecUneEquipe(5, 2, false);

        List<PageModel> complet = builder.construire(vue);
        List<PageModel> sansEnsemble = builder.construire(vue, true);

        assertThat(sansEnsemble).noneMatch(page -> "GLOBAL".equals(page.niveauTexte()));
        assertThat(sansEnsemble).hasSize(complet.size() - 2);
        assertThat(sansEnsemble.get(0).blocs())
                .filteredOn(PageModel.BlocTitreChapitre.class::isInstance)
                .map(b -> ((PageModel.BlocTitreChapitre) b).texte())
                .singleElement()
                .asString().startsWith("I — ");
        assertThat(complet.get(2).blocs())
                .filteredOn(PageModel.BlocTitreChapitre.class::isInstance)
                .map(b -> ((PageModel.BlocTitreChapitre) b).texte())
                .singleElement()
                .asString().startsWith("II — ");
        assertThat(sansEnsemble.get(0).numeroPage()).isEqualTo(1);
        assertThat(sansEnsemble.get(sansEnsemble.size() - 1).totalPages()).isEqualTo(sansEnsemble.size());
    }

    /**
     * Sans détail par équipe, la rubrique 3 porte la répartition par fonction avant la section « reste ».
     * Le détail ne répète ni le titre ni les KPI du chantier. Les tableaux continuent de tenir dans leurs pages.
     */
    @Test
    void construire_sansDetailEquipe_laSectionResteSuitLesCartesKpiDuChantierSurLaMemePage() {

        for (int total = 1; total <= 120; total++) {

            for (int lignesRecapMax = 0; lignesRecapMax <= Math.min(16, total); lignesRecapMax++) {

                List<PageModel> pages = builder.construire(vueAvecUneEquipe(total, lignesRecapMax, false, false));

                // Les pages 0-1 sont la synthèse globale, 2-3 le chantier ; son détail commence ensuite.
                PageModel repartitionChantier = pages.stream()
                        .filter(page -> page.blocs().stream().anyMatch(bloc -> bloc instanceof PageModel.BlocTitreRubrique titre
                                && titre.numero() == 3 && titre.texte().equals("Répartition par fonction")))
                        .findFirst().orElseThrow();
                assertThat(repartitionChantier.blocs())
                        .filteredOn(PageModel.BlocTitreRubrique.class::isInstance)
                        .map(b -> (PageModel.BlocTitreRubrique) b)
                        .extracting(PageModel.BlocTitreRubrique::numero, PageModel.BlocTitreRubrique::texte)
                        .containsExactly(tuple(3, "Répartition par fonction"));
                int debutDetail = pages.indexOf(pages.stream()
                        .filter(page -> page.blocs().stream().anyMatch(PageModel.BlocRecap.class::isInstance))
                        .findFirst().orElseThrow());
                List<PageModel.Bloc> premiere = pages.get(debutDetail).blocs();
                assertThat(premiere.get(0)).isInstanceOf(PageModel.BlocRecap.class);
                assertThat(pages.stream().flatMap(p -> p.blocs().stream()))
                        .as("total=%d, recap=%d : ni titre ni cartes KPI de section répétés", total, lignesRecapMax)
                        .noneMatch(b -> b instanceof PageModel.BlocTitreEquipe);
                assertThat(pages.stream().flatMap(p -> p.blocs().stream()))
                        .as("la liste des employés est une rubrique 4 destinée au futur sommaire")
                        .anyMatch(b -> b instanceof PageModel.BlocTitreRubrique titre
                                && titre.numero() == 4 && titre.texte().equals("Liste des employés"));
                PageModel analyseChantier = pages.stream().filter(page -> page.blocs().stream()
                        .anyMatch(PageModel.BlocTitreChapitre.class::isInstance))
                        .filter(page -> !"GLOBAL".equals(page.niveauTexte())).findFirst().orElseThrow();
                assertThat(cartesKpi(analyseChantier).stream().map(CarteKpi::label))
                        .containsExactly("MASSE SALARIALE", "MASSE MOIS PRECEDENT", "EFFECTIF",
                                "STC / SORTIES (PERSONNES)", "STC / SORTIES (DH)");

                int lignes = 0;
                for (int p = debutDetail; p < pages.size(); p++) {
                    double hauteur = 0;
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

        List<PageModel> pages = builder.construire(vueAvecUneEquipe(10, 45, true, false));

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

    @Test
    void construire_equipeSelectionneeAjouteLeGraphiqueMaterielAvantLaListeEnRubriqueCinq() {
        List<PageModel> pages = builder.construire(vueAvecUneEquipe(3, 2, true));

        PageModel evolutionEquipe = pages.stream()
                .filter(page -> page.blocs().stream().anyMatch(PageModel.BlocTitreEquipe.class::isInstance))
                .findFirst().orElseThrow();
        assertThat(evolutionEquipe.blocs()).filteredOn(PageModel.BlocTitreRubrique.class::isInstance)
                .map(PageModel.BlocTitreRubrique.class::cast)
                .extracting(PageModel.BlocTitreRubrique::numero)
                .containsExactly(1, 2);
        assertThat(evolutionEquipe.blocs()).filteredOn(PageModel.BlocGraphiqueEvolution.class::isInstance)
                .map(PageModel.BlocGraphiqueEvolution.class::cast)
                .extracting(PageModel.BlocGraphiqueEvolution::groupe)
                .containsExactly(PageModel.GroupeEvolution.MASSE_EFFECTIF, PageModel.GroupeEvolution.STC);

        PageModel materiel = pages.stream()
                .filter(page -> page.blocs().stream().anyMatch(PageModel.BlocGraphiqueMateriel.class::isInstance))
                .findFirst().orElseThrow();
        assertThat(materiel.blocs())
                .filteredOn(PageModel.BlocTitreRubrique.class::isInstance)
                .map(PageModel.BlocTitreRubrique.class::cast)
                .extracting(PageModel.BlocTitreRubrique::numero, PageModel.BlocTitreRubrique::texte)
                .containsExactly(tuple(3, "Répartition par fonction"), tuple(4, "Parc matériel — CAMION"),
                        tuple(5, "Liste des employés"));
        assertThat(materiel.blocs()).anyMatch(PageModel.BlocGraphique.class::isInstance);
        assertThat(materiel.blocs()).filteredOn(PageModel.BlocGraphiqueMateriel.class::isInstance)
                .map(PageModel.BlocGraphiqueMateriel.class::cast)
                .singleElement().satisfies(graph -> {
                    assertThat(graph.titre()).isEqualTo("CAMION");
                    assertThat(graph.donnees()).extracting(MaterielLigneVue::getNombre).containsExactly(4);
                });
        assertThat(pages.stream().flatMap(page -> page.blocs().stream())
                .filter(PageModel.BlocTitreRubrique.class::isInstance)
                .map(PageModel.BlocTitreRubrique.class::cast)
                .map(PageModel.BlocTitreRubrique::numero))
                .contains(1, 2, 3, 4, 5);
    }

    @Test
    void construire_toutesLesQuantitesMaterielAZeroOmetLaRubriqueEtGardeLaListeEnQuatre() {
        List<PageModel> pages = builder.construire(vueAvecUneEquipe(3, 2, true, true, "", 0));

        assertThat(pages.stream().flatMap(page -> page.blocs().stream()))
                .noneMatch(PageModel.BlocGraphiqueMateriel.class::isInstance);
        assertThat(pages).anySatisfy(page -> {
            assertThat(page.blocs()).anyMatch(PageModel.BlocGraphique.class::isInstance);
            assertThat(page.blocs()).anyMatch(PageModel.BlocTableauEmployes.class::isInstance);
        });
        assertThat(pages.stream().flatMap(page -> page.blocs().stream())
                .filter(PageModel.BlocTitreRubrique.class::isInstance)
                .map(PageModel.BlocTitreRubrique.class::cast)
                .filter(titre -> titre.texte().equals("Liste des employés")))
                .singleElement().extracting(PageModel.BlocTitreRubrique::numero).isEqualTo(4);
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
                new CarteKpi("MASSE SALARIALE", "12 345 678 901 234 567 890,00 DH et encore du texte qui passe à la ligne",
                        "montant")));

        assertThat(courte.hauteurCarte()).isEqualTo(KPI_CARTE_HAUTEUR);
        assertThat(longue.hauteurCarte()).isGreaterThan(KPI_CARTE_HAUTEUR);
    }

    /** Mois précédent introuvable : le libellé reste, la valeur est vide (jamais le texte « INTROUVABLE »). */
    @Test
    void construire_moisPrecedentIntrouvable_gardeLeLibelleSansValeur() {

        List<PageModel> pages = builder.construire(vueAvecUneEquipe(5, 1, false));

        // Aux 3 niveaux (global, chantier, section), la carte reste avec une valeur vide
        List<CarteKpi> moisPrecedent = pages.stream()
                .flatMap(p -> cartesKpi(p).stream())
                .filter(c -> c.label().equals("MASSE MOIS PRECEDENT"))
                .toList();
        assertThat(moisPrecedent).hasSize(3);
        assertThat(moisPrecedent).allSatisfy(c -> assertThat(c.valeur()).isEmpty());
        assertThat(cartesKpi(pages.get(0)))
                .filteredOn(c -> c.label().equals("EFFECTIF"))
                .extracting(CarteKpi::sousTexte)
                .containsExactly("Écart indisponible");
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
        return vueAvecUneEquipe(totalEmployes, lignesRecapMax, avecMateriel, avecDetailEquipe, observation,
                avecMateriel ? 4 : null);
    }

    private RapportBiVue vueAvecUneEquipe(
            int totalEmployes,
            int lignesRecapMax,
            boolean avecMateriel,
            boolean avecDetailEquipe,
            String observation,
            Integer nombreMateriel
    ) {

        List<LigneEmployeVue> employes = new ArrayList<>();

        for (int i = 0; i < totalEmployes; i++) {

            employes.add(
                    new LigneEmployeVue(
                            "EMPLOYE " + i,
                            "FONCTION " + (i % Math.max(1, lignesRecapMax)),
                            "CIN" + i,
                            BigDecimal.valueOf(26),
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
                        new MaterielLigneVue("CAMION CITERNE", nombreMateriel)
                )
                        : List.of();

        KpiMontantVue masse =
                new KpiMontantVue(
                        "10 000,00",
                        null
                );

        KpiCompteVue effectif =
                new KpiCompteVue(
                        totalEmployes,
                        0,
                        0,
                        false
                );
        KpiCompteVue stc = new KpiCompteVue(0, 0, 0, false);
        KpiMontantVue stcMontant = new KpiMontantVue("0,00", null, "Écart indisponible");

        String chantierCode = avecMateriel ? "C168" : "C1";
        String equipeCode = avecMateriel ? "CH" : "EQ";
        EquipeBiVue equipe =
                new EquipeBiVue(
                        equipeCode,
                        "ÉQUIPE : TEST",
                        "TEST",
                        effectif,
                        masse,
                        stc,
                        stcMontant,
                        repartitionFonction,
                        List.of(),
                        materiel,
                        employes,
                        avecDetailEquipe
                );

        ChantierBiVue chantier =
                new ChantierBiVue(
                        chantierCode,
                        chantierCode,
                        "CHANTIER : " + chantierCode,
                        masse,
                        effectif,
                        stc,
                        stcMontant,
                        List.of(),
                        List.of(),
                        List.of(equipe),
                        avecDetailEquipe
                );

        SyntheseGlobaleVue synthese =
                new SyntheseGlobaleVue(
                        masse,
                        effectif,
                        new KpiCompteVue(1, 0, 0, false),
                        stc,
                        stcMontant,
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
