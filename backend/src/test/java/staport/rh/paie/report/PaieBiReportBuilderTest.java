package staport.rh.paie.report;

import org.junit.jupiter.api.Test;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.equipe.entities.Equipe;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.AucunePaiePeriodeException;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PaieBiReportBuilderTest {

    private final PaieBiReportBuilder builder = new PaieBiReportBuilder(null);

    private static final PaieReportPdfRequestDto REQUETE_SANS_FILTRE =
            new PaieReportPdfRequestDto("2026-09", null, null, null, null, null, null);

    @Test
    void construireDepuis_devraitOrdonnerLesChantiersParMasseDecroissante() {
        Paie petit = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "1000");
        Paie grand = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C068", "EQUIPE A", "9000");
        Paie moyen = paie("EMPLOYE TROIS", "CIN3", "OPERATEUR", "C120", "EQUIPE A", "5000");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE,
                List.of(petit, grand, moyen), List.of());

        assertThat(vue.chantiers()).extracting(ChantierBiVue::code).containsExactly("C068", "C120", "C059");
    }

    @Test
    void construireDepuis_devraitGarderTousLesChantiersDansLeGraphiqueSansRegroupementAutres() {
        // 12 chantiers de masses croissantes (C01 = 1 000 ... C12 = 12 000) : tous figurent, du plus gros au plus petit.
        List<Paie> courant = new java.util.ArrayList<>();
        for (int i = 1; i <= 12; i++) {
            courant.add(paie("EMPLOYE " + i, "CIN" + i, "OPERATEUR", String.format("C%02d", i), "EQUIPE A", String.valueOf(i * 1000)));
        }

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE, courant, List.of());

        assertThat(vue.synthese().nombreChantiers()).isEqualTo(12);
        assertThat(vue.synthese().repartitionChantier())
                .extracting(RepartitionBean::getLibelle)
                .containsExactly("C12", "C11", "C10", "C09", "C08", "C07", "C06", "C05", "C04", "C03", "C02", "C01");
        assertThat(vue.synthese().repartitionChantier())
                .extracting(RepartitionBean::getLibelle).doesNotContain("Autres");
        // Le rapport reste exhaustif : les 12 chantiers ont aussi leur propre section.
        assertThat(vue.chantiers()).hasSize(12);
    }

    @Test
    void construireDepuis_devraitOrdonnerLeGraphiqueChantierParMasseDecroissante() {
        Paie a = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "1000");
        Paie b = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C068", "EQUIPE A", "9000");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE, List.of(a, b), List.of());

        assertThat(vue.synthese().repartitionChantier()).extracting(RepartitionBean::getLibelle).containsExactly("C068", "C059");
    }

    @Test
    void leGraphiqueChantierTientSurUnePageJusquaSeizeChantiers() {
        RapportBiVue vue = vueAvecChantiers(16);

        assertThat(titresSectionRepartitionChantier(vue)).containsExactly("Répartition par chantier");
        assertThat(lignesDesGraphiquesChantier(vue)).containsExactly(16);
    }

    @Test
    void leGraphiqueChantierSeRepartitSurPlusieursPagesATaillesQuasiEgales() {
        RapportBiVue vue = vueAvecChantiers(25);

        assertThat(titresSectionRepartitionChantier(vue))
                .containsExactly("Répartition par chantier", "Répartition par chantier (suite)");
        // Tous les chantiers sont présents, 13 puis 12 : jamais une dernière page presque vide.
        assertThat(lignesDesGraphiquesChantier(vue)).containsExactly(13, 12);
    }

    @Test
    void lesPagesDuGraphiqueChantierPartagentLEchelleDeLEnsemble() {
        RapportBiVue vue = vueAvecChantiers(25);

        List<PageModel.BlocGraphique> graphiques = new RapportPageModelBuilder().construire(vue).stream()
                .flatMap(page -> page.blocs().stream())
                .filter(PageModel.BlocGraphique.class::isInstance)
                .map(PageModel.BlocGraphique.class::cast)
                .limit(2)
                .toList();

        // Sinon la 2e page serait dessinée à sa propre échelle et ses barres ne seraient plus comparables à celles de la 1re.
        assertThat(graphiques).allSatisfy(g -> assertThat(g.echelle()).hasSize(25));
    }

    private RapportBiVue vueAvecChantiers(int nombre) {
        List<Paie> courant = new java.util.ArrayList<>();
        for (int i = 1; i <= nombre; i++) {
            courant.add(paie("EMPLOYE " + i, "CIN" + i, "OPERATEUR", String.format("C%02d", i), "EQUIPE A", String.valueOf(i * 1000)));
        }
        return builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE, courant, List.of());
    }

    /** Nombre de lignes de chaque page du graphique « Répartition par chantier » (pages globales uniquement). */
    private List<Integer> lignesDesGraphiquesChantier(RapportBiVue vue) {
        return new RapportPageModelBuilder().construire(vue).stream()
                .filter(page -> "GLOBAL".equals(page.niveauTexte()))
                .flatMap(page -> page.blocs().stream())
                .filter(PageModel.BlocGraphique.class::isInstance)
                .map(bloc -> ((PageModel.BlocGraphique) bloc).donnees().size())
                .toList();
    }

    private List<String> titresSectionRepartitionChantier(RapportBiVue vue) {
        return new RapportPageModelBuilder().construire(vue).stream()
                .flatMap(page -> page.blocs().stream())
                .filter(PageModel.BlocTitreSection.class::isInstance)
                .map(bloc -> ((PageModel.BlocTitreSection) bloc).texte())
                .filter(texte -> texte.startsWith("Répartition par chantier"))
                .toList();
    }

    @Test
    void construireDepuis_devraitLeverUneExceptionSiAucuneLignePourLaPeriode() {
        assertThatThrownBy(() -> builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE, List.of(), List.of()))
                .isInstanceOf(AucunePaiePeriodeException.class);
    }

    @Test
    void construireDepuis_devraitCalculerLaMasseGlobaleEtSaVariation() {
        Paie c059EquipeA = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "5000");
        Paie c059SansEquipe = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", null, "3000");
        Paie precedent = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "4000");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE,
                List.of(c059EquipeA, c059SansEquipe), List.of(precedent));

        assertThat(vue.synthese().masse().valeurCourante()).isEqualTo("8 000");
        assertThat(vue.synthese().masse().valeurPrecedente()).isEqualTo("4 000");
        assertThat(vue.synthese().effectif().effectifCourant()).isEqualTo(2);
        assertThat(vue.synthese().effectif().effectifPrecedent()).isEqualTo(1);
    }

    /** Une masse salariale est toujours arrondie à l'unité (0,5 vers le haut), sans décimales — jamais « 1 001,50 ». */
    @Test
    void construireDepuis_devraitArrondirLaMasseSalarialeALUnite() {
        Paie courant = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "1000.50");
        Paie precedent = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "999.49");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE, List.of(courant), List.of(precedent));

        assertThat(vue.synthese().masse().valeurCourante()).isEqualTo("1\u00A0001");
        assertThat(vue.synthese().masse().valeurPrecedente()).isEqualTo("999");
        assertThat(vue.chantiers().get(0).masse().valeurCourante()).isEqualTo("1\u00A0001");
        assertThat(vue.chantiers().get(0).equipes().get(0).masse().valeurCourante()).isEqualTo("1\u00A0001");
    }

    @Test
    void construireDepuis_devraitRegrouperLesBulletinsSansEquipeSousSansEquipeDansLaRepartition() {
        Paie sansEquipe1 = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", null, "3000");
        Paie sansEquipe2 = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", null, "2000");
        Paie avecEquipe = paie("EMPLOYE TROIS", "CIN3", "OPERATEUR", "C059", "EQUIPE A", "1000");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE,
                List.of(sansEquipe1, sansEquipe2, avecEquipe), List.of());

        // repartitionEquipe() alimente le graphique de repartition par equipe - toujours calculee sur
        // TOUTES les equipes reelles, independamment de la selection manuelle d'equipes a detailler
        // (voir ChantierBiVue.avecDetailEquipe), contrairement a equipes() ci-dessous.
        ChantierBiVue chantier = vue.chantiers().get(0);
        assertThat(chantier.repartitionEquipe())
                .extracting(RepartitionBean::getLibelle, RepartitionBean::getEffectif, r -> r.getMontant().intValue())
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("Sans équipe", 2, 5000),
                        org.assertj.core.groups.Tuple.tuple("EQUIPE A", 1, 1000));

        // Aucune equipe selectionnee pour ce chantier (REQUETE_SANS_FILTRE) : une seule section
        // fusionnant tous les employes, jamais nommee "Sans equipe" mais par le code du chantier (voir
        // le Javadoc de EquipeBiVue).
        assertThat(chantier.avecDetailEquipe()).isFalse();
        assertThat(chantier.equipes()).hasSize(1);
        assertThat(chantier.equipes().get(0).nom()).isEqualTo("C059");
        assertThat(chantier.equipes().get(0).effectif().effectifCourant()).isEqualTo(3);
    }

    @Test
    void construireDepuis_devraitPorterLesNombresDuParcMaterielSurLesSectionsC168ChEtOp() {
        Paie camion = paie("EMPLOYE UN", "CIN1", "CHAUFFEUR", "C168", "CH", "1000");
        Paie engin = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C168", "OP", "1000");
        PaieReportPdfRequestDto requete = new PaieReportPdfRequestDto("2026-09", null, null, null, null,
                Map.of("C168", List.of("CH", "OP")), Map.of("CAMION CITERNE", 3, "BULL", 0));

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), requete, List.of(camion, engin), List.of());

        List<EquipeBiVue> equipes = vue.chantiers().get(0).equipes();
        MaterielLigneVue citerne = equipes.stream().flatMap(e -> e.materiel().stream())
                .filter(l -> l.getLibelle().equals("CAMION CITERNE")).findFirst().orElseThrow();
        MaterielLigneVue bull = equipes.stream().flatMap(e -> e.materiel().stream())
                .filter(l -> l.getLibelle().equals("BULL")).findFirst().orElseThrow();
        MaterielLigneVue picku = equipes.stream().flatMap(e -> e.materiel().stream())
                .filter(l -> l.getLibelle().equals("PICK UP")).findFirst().orElseThrow();
        assertThat(citerne.getNombre()).isEqualTo(3);
        assertThat(bull.getNombre()).isZero();
        // Ligne non renseignée : aucune valeur, la cellule reste vide (à remplir au stylo).
        assertThat(picku.getNombre()).isNull();
    }

    @Test
    void construireDepuis_devraitDetaillerUniquementLesEquipesSelectionnees() {
        Paie equipeA = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "3000");
        Paie equipeB = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", "EQUIPE B", "2000");
        Paie sansEquipe = paie("EMPLOYE TROIS", "CIN3", "OPERATEUR", "C059", null, "1000");

        PaieReportPdfRequestDto requeteAvecSelection = new PaieReportPdfRequestDto(
                "2026-09", null, null, null, null, Map.of("C059", List.of("EQUIPE A")), null);

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), requeteAvecSelection,
                List.of(equipeA, equipeB, sansEquipe), List.of());

        ChantierBiVue chantier = vue.chantiers().get(0);
        assertThat(chantier.avecDetailEquipe()).isTrue();
        // Section "EQUIPE A" (selectionnee) + section "reste" (EQUIPE B + Sans equipe, non
        // selectionnees) - jamais de section "EQUIPE B" ou "Sans equipe" separee, jamais un employe
        // dans deux sections a la fois.
        assertThat(chantier.equipes()).extracting(EquipeBiVue::nom).containsExactly("EQUIPE A", "C059");
        assertThat(chantier.equipes().get(0).effectif().effectifCourant()).isEqualTo(1);
        assertThat(chantier.equipes().get(1).effectif().effectifCourant()).isEqualTo(2);
    }

    @Test
    void construireDepuis_devraitRepartirMasseEtEffectifParChantierEtParFonction() {
        Paie macon = paie("EMPLOYE UN", "CIN1", "MACON", "C059", "EQUIPE A", "5000");
        Paie operateur = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C068", "EQUIPE B", "3000");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE, List.of(macon, operateur), List.of());

        assertThat(vue.synthese().repartitionChantier())
                .extracting(RepartitionBean::getLibelle, RepartitionBean::getEffectif, r -> r.getMontant().intValue())
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("C059", 1, 5000),
                        org.assertj.core.groups.Tuple.tuple("C068", 1, 3000));
        assertThat(vue.synthese().repartitionFonction())
                .extracting(RepartitionBean::getLibelle, RepartitionBean::getEffectif, r -> r.getMontant().intValue())
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("MACON", 1, 5000),
                        org.assertj.core.groups.Tuple.tuple("OPERATEUR", 1, 3000));
    }

    /** Demande de direction (2026-10-05) : le graphique de répartition par chantier porte le NOM du chantier, jamais son
     * code, quand il est renseigné ; le code reste le libellé de repli (nom absent ou vide). */
    @Test
    void construireDepuis_devraitLibellerLesBarresDuGraphiqueChantierParLeNomEtRepliSurLeCode() {
        Chantier nomme = chantier("C059", "Nador");
        Chantier nomBlanc = chantier("C068", "   ");
        Chantier sansNom = chantier("C196", null);
        Paie a = paieAvecChantier("EMPLOYE UN", "CIN1", "MACON", nomme, "EQUIPE A", "5000");
        Paie b = paieAvecChantier("EMPLOYE DEUX", "CIN2", "MACON", nomBlanc, "EQUIPE A", "4000");
        Paie c = paieAvecChantier("EMPLOYE TROIS", "CIN3", "MACON", sansNom, "EQUIPE A", "3000");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE, List.of(a, b, c), List.of());

        assertThat(vue.synthese().repartitionChantier())
                .extracting(RepartitionBean::getLibelle, r -> r.getMontant().intValue())
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("Nador", 5000),
                        org.assertj.core.groups.Tuple.tuple("C068", 4000),
                        org.assertj.core.groups.Tuple.tuple("C196", 3000));
        // Les sections par chantier, elles, gardent leur règle « nom (code) » : seul le graphique change.
        assertThat(vue.chantiers().get(0).code()).isEqualTo("C059");
    }

    @Test
    void construireDepuis_devraitLaisserLeMoisPrecedentVideQuandIlEstIndisponible() {
        Paie ligne = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "5000");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE, List.of(ligne), List.of());

        assertThat(vue.synthese().masse().valeurPrecedente()).isNull();
        assertThat(vue.chantiers().get(0).equipes().get(0).masse().valeurPrecedente()).isNull();
    }

    @Test
    void construireDepuis_laMasseDuChantierDoitEgalerLaSommeDesEquipesEtDuReste() {
        Paie equipeA = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "3000");
        Paie equipeB = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", "EQUIPE B", "2500");
        Paie sansEquipe = paie("EMPLOYE TROIS", "CIN3", "OPERATEUR", "C059", null, "1500");

        // EQUIPE A et EQUIPE B selectionnees pour un detail separe, "Sans equipe" non selectionnee
        // (rejoint donc la section "reste") - verifie que la somme des sections couvre exactement la
        // masse totale du chantier, quel que soit le decoupage equipe(s) selectionnee(s) + reste.
        PaieReportPdfRequestDto requete = new PaieReportPdfRequestDto(
                "2026-09", null, null, null, null, Map.of("C059", List.of("EQUIPE A", "EQUIPE B")), null);

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), requete,
                List.of(equipeA, equipeB, sansEquipe), List.of());

        ChantierBiVue chantier = vue.chantiers().get(0);
        BigDecimal sommeEquipes = chantier.equipes().stream()
                .map(e -> montantDepuisFormat(e.masse().valeurCourante()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal masseChantier = montantDepuisFormat(chantier.masse().valeurCourante());

        assertThat(sommeEquipes).isEqualByComparingTo(masseChantier);
    }

    @Test
    void construireDepuis_devraitCompterLesStcEtSortiesParChantier() {
        Paie stc = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "3000");
        stc.setObservation("STC");
        Paie sortie = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", "EQUIPE A", "3000");
        sortie.setObservation("Sortie");
        Paie actif = paie("EMPLOYE TROIS", "CIN3", "OPERATEUR", "C059", "EQUIPE A", "3000");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE, List.of(stc, sortie, actif), List.of());

        ChantierBiVue chantier = vue.chantiers().get(0);
        assertThat(chantier.stc()).isEqualTo(2);
    }

    @Test
    void construireDepuis_devraitDecrireLeFiltreChantierActifDansLesFiltresActifs() {
        Chantier chantier = new Chantier();
        chantier.setId(42L);
        chantier.setCode("C059");
        Paie ligne = paieAvecChantier("EMPLOYE UN", "CIN1", "OPERATEUR", chantier, "EQUIPE A", "3000");

        PaieReportPdfRequestDto requeteFiltreeChantier = new PaieReportPdfRequestDto("2026-09", null, null, null, 42L, null, null);
        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), requeteFiltreeChantier, List.of(ligne), List.of());

        assertThat(vue.filtresActifs()).containsExactly("Chantier : C059");
    }

    private BigDecimal montantDepuisFormat(String montantFormate) {
        return new BigDecimal(montantFormate.replace(" ", "").replace(",", "."));
    }

    private Chantier chantier(String code, String nom) {
        Chantier chantier = new Chantier();
        chantier.setCode(code);
        chantier.setNom(nom);
        return chantier;
    }

    private Paie paie(String nomPrenom, String cin, String fonctionLibelle, String chantierCode, String equipe, String salaireTotal) {
        Chantier chantier = new Chantier();
        chantier.setCode(chantierCode);
        return paieAvecChantier(nomPrenom, cin, fonctionLibelle, chantier, equipe, salaireTotal);
    }

    private Paie paieAvecChantier(String nomPrenom, String cin, String fonctionLibelle, Chantier chantier, String equipe, String salaireTotal) {
        Employee employee = new Employee();
        employee.setNomPrenom(nomPrenom);
        employee.setCin(cin);

        Function fonction = new Function();
        fonction.setLibelle(fonctionLibelle);

        Paie paie = new Paie();
        paie.setEmployee(employee);
        paie.setFonction(fonction);
        paie.setChantier(chantier);
        paie.setEquipe(equipe == null ? null : equipe(equipe));
        paie.setNombreJoursTravailles(BigDecimal.valueOf(26));
        paie.setSalaireMensuel(new BigDecimal(salaireTotal));
        paie.setSalaireTotal(new BigDecimal(salaireTotal));
        return paie;
    }

    private Equipe equipe(String code) {
        Equipe equipe = new Equipe();
        equipe.setCode(code);
        equipe.setLibelle(code);
        return equipe;
    }
}
