package staport.rh.paie.report;

import org.junit.jupiter.api.Test;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
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
            new PaieReportPdfRequestDto("2026-09", null, null, null, null, null);

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

        assertThat(vue.synthese().masse().valeurCourante()).isEqualTo("8 000,00");
        assertThat(vue.synthese().masse().valeurPrecedente()).isEqualTo("4 000,00");
        assertThat(vue.synthese().masse().tendance()).isEqualTo(PaieReportNumberFormat.Tendance.HAUSSE);
        assertThat(vue.synthese().effectif().effectifCourant()).isEqualTo(2);
        assertThat(vue.synthese().effectif().effectifPrecedent()).isEqualTo(1);
    }

    @Test
    void construireDepuis_devraitRegrouperLesBulletinsSansEquipeSousSansEquipeDansLaRepartition() {
        Paie sansEquipeNull = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", null, "3000");
        Paie sansEquipeBlank = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", "  ", "2000");
        Paie avecEquipe = paie("EMPLOYE TROIS", "CIN3", "OPERATEUR", "C059", "EQUIPE A", "1000");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE,
                List.of(sansEquipeNull, sansEquipeBlank, avecEquipe), List.of());

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
        assertThat(chantier.equipes().get(0).effectif()).isEqualTo(3);
    }

    @Test
    void construireDepuis_devraitDetaillerUniquementLesEquipesSelectionnees() {
        Paie equipeA = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "3000");
        Paie equipeB = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", "EQUIPE B", "2000");
        Paie sansEquipe = paie("EMPLOYE TROIS", "CIN3", "OPERATEUR", "C059", null, "1000");

        PaieReportPdfRequestDto requeteAvecSelection = new PaieReportPdfRequestDto(
                "2026-09", null, null, null, null, Map.of("C059", List.of("EQUIPE A")));

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), requeteAvecSelection,
                List.of(equipeA, equipeB, sansEquipe), List.of());

        ChantierBiVue chantier = vue.chantiers().get(0);
        assertThat(chantier.avecDetailEquipe()).isTrue();
        // Section "EQUIPE A" (selectionnee) + section "reste" (EQUIPE B + Sans equipe, non
        // selectionnees) - jamais de section "EQUIPE B" ou "Sans equipe" separee, jamais un employe
        // dans deux sections a la fois.
        assertThat(chantier.equipes()).extracting(EquipeBiVue::nom).containsExactly("EQUIPE A", "C059");
        assertThat(chantier.equipes().get(0).effectif()).isEqualTo(1);
        assertThat(chantier.equipes().get(1).effectif()).isEqualTo(2);
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

    @Test
    void construireDepuis_neDevraitPasCalculerDePourcentageQuandLeMoisPrecedentEstIndisponible() {
        Paie ligne = paie("EMPLOYE UN", "CIN1", "OPERATEUR", "C059", "EQUIPE A", "5000");

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE, List.of(ligne), List.of());

        assertThat(vue.synthese().masse().tendance()).isEqualTo(PaieReportNumberFormat.Tendance.NON_DISPONIBLE);
        assertThat(vue.synthese().masse().variationPourcent()).isNull();
        assertThat(vue.synthese().masse().valeurPrecedente()).isEqualTo("INTROUVABLE");
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
                "2026-09", null, null, null, null, Map.of("C059", List.of("EQUIPE A", "EQUIPE B")));

        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), requete,
                List.of(equipeA, equipeB, sansEquipe), List.of());

        ChantierBiVue chantier = vue.chantiers().get(0);
        BigDecimal sommeEquipes = chantier.equipes().stream()
                .map(e -> montantDepuisFormat(e.masse()))
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

        PaieReportPdfRequestDto requeteFiltreeChantier = new PaieReportPdfRequestDto("2026-09", null, null, null, 42L, null);
        RapportBiVue vue = builder.construireDepuis(YearMonth.of(2026, 9), requeteFiltreeChantier, List.of(ligne), List.of());

        assertThat(vue.filtresActifs()).containsExactly("Chantier : C059");
    }

    private BigDecimal montantDepuisFormat(String montantFormate) {
        return new BigDecimal(montantFormate.replace(" ", "").replace(",", "."));
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
        paie.setEquipe(equipe);
        paie.setNombreJoursTravailles(26);
        paie.setSalaireMensuel(new BigDecimal(salaireTotal));
        paie.setSalaireTotal(new BigDecimal(salaireTotal));
        return paie;
    }
}
