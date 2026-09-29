package staport.rh.paie.report;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.repositories.PaieRepository;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Vérifie que le pipeline JasperReports produit réellement un PDF de bout en bout (compilation des
 * gabarits JRXML, remplissage, charts natifs, sous-rapports chantier/STC, export) — pas seulement
 * que {@link PaieBiReportBuilder} calcule la bonne vue-modèle (voir {@link PaieBiReportBuilderTest}).
 */
@ExtendWith(MockitoExtension.class)
class PaieReportPdfServiceTest {

    @Mock
    private PaieRepository repository;

    private PaieReportPdfService service;

    private static final PaieReportPdfRequestDto REQUETE_SANS_FILTRE =
            new PaieReportPdfRequestDto("2026-09", null, null, null, null, null);

    @BeforeEach
    void setUp() {
        service = new PaieReportPdfService(new PaieBiReportBuilder(repository));
    }

    @Test
    void generer_devraitProduireUnPdfValide() {
        Paie c059EquipeA = paie("EMPLOYE UN", "CIN1", "MACON", "C059", "EQUIPE A", "5000", null);
        Paie c059SansEquipe = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR", "C059", null, "3000", "STC");
        Paie c068EquipeB = paie("EMPLOYE TROIS", "CIN3", "MACON", "C068", "EQUIPE B", "4000", null);
        Paie precedent = paie("EMPLOYE UN", "CIN1", "MACON", "C059", "EQUIPE A", "4500", null);

        @SuppressWarnings("unchecked")
        List<Paie> courant = List.of(c059EquipeA, c059SansEquipe, c068EquipeB);
        when(repository.findAll(any(Specification.class))).thenReturn(courant, List.of(precedent));

        byte[] pdf = service.generer(YearMonth.of(2026, 9), REQUETE_SANS_FILTRE);

        assertThat(pdf).isNotEmpty();
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }

    /** Exerce le chemin le plus à risque du gabarit (chantier avec équipe détaillée sélectionnée,
     * section "reste", sous-rapports récap Fonction/Effectif/STC et parc matériel C168/CH/OP) —
     * seule une génération de bout en bout via JasperReports peut révéler une erreur de compilation
     * ou de remplissage sur ces éléments (sous-rapports, bande à printWhenExpression). */
    @Test
    void generer_devraitProduireUnPdfValideAvecEquipeDetailleeEtSqueletteMateriel() {
        Paie c168Ch = paie("EMPLOYE UN", "CIN1", "CHAUFFEUR", "C168", "CH", "5000", null);
        Paie c168Op = paie("EMPLOYE DEUX", "CIN2", "OPERATEUR ENGIN", "C168", "OP", "4500", null);
        Paie c168AutreEquipe = paie("EMPLOYE TROIS", "CIN3", "MACON", "C168", "EQUIPE X", "3000", null);

        @SuppressWarnings("unchecked")
        List<Paie> courant = List.of(c168Ch, c168Op, c168AutreEquipe);
        when(repository.findAll(any(Specification.class))).thenReturn(courant, List.of());

        PaieReportPdfRequestDto requeteAvecDetail = new PaieReportPdfRequestDto(
                "2026-09", null, null, null, null, Map.of("C168", List.of("CH", "OP")));

        byte[] pdf = service.generer(YearMonth.of(2026, 9), requeteAvecDetail);

        assertThat(pdf).isNotEmpty();
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }

    /** Constantes dupliquées ici depuis {@code PaieReportPdfService} (voir ses constantes privées) —
     * si les hauteurs déclarées dans rapport.jrxml changent un jour, ces constantes ET celles de
     * PaieReportPdfService doivent être mises à jour ensemble. {@code SEUIL_CONTENU_PAGE_AVEC_FOOTER}
     * est une valeur empirique (voir son Javadoc côté production) : le contenu total d'une page qui
     * porte le groupFooter EN LIGNE (lignes employé de cette page + groupFooter complet) ne doit jamais
     * la dépasser, sous peine de page blanche produite par JasperReports — {@code
     * PIED_HAUTEUR_DECLAREE_JRXML} définit l'AUTRE zone sûre (voir {@code
     * seuilLignesSansRisquePushOff} côté production et son Javadoc). */
    private static final int PAGE_HAUTEUR_UTILE = 495;
    private static final int CAP_PREMIERE_SANS_FOOTER = 24;
    private static final int CAP_CONTINUATION_SANS_FOOTER = 30;
    private static final int GROUPE_EQUIPE_ENTETE_HAUTEUR = 100;
    private static final int PIED_HAUTEUR_BASE = 34;
    private static final int LIGNE_RECAP_HAUTEUR = 15;
    private static final int SEUIL_CONTENU_PAGE_AVEC_FOOTER = 345;
    private static final int PIED_HAUTEUR_DECLAREE_JRXML = 188;
    private static final int SEUIL_LIGNES_SANS_RISQUE_PUSH_OFF = (PAGE_HAUTEUR_UTILE - PIED_HAUTEUR_DECLAREE_JRXML) / 16 + 1;

    /** Vérifie, pour un large éventail de tailles de section ET de nombres de lignes de récap
     * (Fonction/Effectif/STC ou matériel, le plus grand des deux), que {@code calculerSautPage}
     * garantit bien la règle métier (demande explicite de direction, 2026-09-29) : la page qui finit par
     * porter le groupFooter EN LIGNE (collé aux dernières lignes employé) ne dépasse jamais {@code
     * SEUIL_CONTENU_PAGE_AVEC_FOOTER}px de contenu total, et aucune page intermédiaire ne se retrouve
     * vide ou négative — en reconstruisant, à partir du seul index de saut renvoyé, le découpage en
     * pages que produirait rapport.jrxml (remplissage naturel de JasperReports partout, sauf au point de
     * saut calculé).
     *
     * <p>Depuis la 2e zone sûre (voir {@code seuilLignesSansRisquePushOff} côté production, 2026-09-29) :
     * quand {@code calculerSautPage} renvoie {@code -1} alors que la dernière page naturelle est déjà
     * dans cette zone (≥ {@value #SEUIL_LIGNES_SANS_RISQUE_PUSH_OFF} lignes), JasperReports reporte tout
     * seul le groupFooter sur une page neuve — cette page NE PORTE PAS le footer en ligne, donc ne doit
     * PAS être comparée au seuil (elle dépasserait légitimement, ex. 30 lignes + footer réel, sans aucun
     * risque de page blanche puisque le footer s'imprime en réalité sur une page à part, vide de lignes
     * employé). Le test vérifie alors la page fantôme (footer seul) à sa place. */
    @Test
    void calculerSautPage_neDevraitJamaisLaisserLaPageFinaleDeborderLeSeuilAvecFooter() {
        for (int total = 1; total <= 200; total++) {
            // lignesRecapMax <= total TOUJOURS en pratique (on ne peut pas avoir plus de fonctions
            // distinctes que d'employés dans une section — chaque ligne de récap regroupe au moins 1
            // employé) : au-delà, la garantie devient mathématiquement inatteignable (le groupFooter
            // seul dépasserait déjà SEUIL_CONTENU_PAGE_AVEC_FOOTER), mais cet état n'est jamais produit
            // par PaieBiReportBuilder.equipeVue. Plafonné en plus à 16 : le plus grand cas réel observé
            // est 14 fonctions distinctes (voir docs/report/README.md).
            int lignesRecapMaxPossible = Math.min(16, total);
            for (int lignesRecapMax = 0; lignesRecapMax <= lignesRecapMaxPossible; lignesRecapMax++) {
                int hauteurPied = PIED_HAUTEUR_BASE + LIGNE_RECAP_HAUTEUR * lignesRecapMax;
                int indexSaut = service.calculerSautPage(total, lignesRecapMax);

                assertThat(indexSaut).isLessThan(total);

                List<Integer> taillesPages = simulerDecoupagePages(total, indexSaut);
                int tailleDerniere = taillesPages.get(taillesPages.size() - 1);
                boolean dernierePageEstPremiere = taillesPages.size() == 1;
                int hauteurEntete = dernierePageEstPremiere ? GROUPE_EQUIPE_ENTETE_HAUTEUR : 0;

                boolean pousseeSansRisque = !dernierePageEstPremiere && tailleDerniere >= SEUIL_LIGNES_SANS_RISQUE_PUSH_OFF;
                int contenuTotalPageFinale = pousseeSansRisque
                        ? hauteurPied // page fantôme : footer seul, aucune ligne employé
                        : hauteurEntete + tailleDerniere * 16 + hauteurPied;

                assertThat(contenuTotalPageFinale)
                        .as("total=%d, lignesRecapMax=%d, indexSaut=%d, pages=%s, pousseeSansRisque=%s",
                                total, lignesRecapMax, indexSaut, taillesPages, pousseeSansRisque)
                        .isLessThanOrEqualTo(SEUIL_CONTENU_PAGE_AVEC_FOOTER);
                assertThat(taillesPages)
                        .as("total=%d, lignesRecapMax=%d : aucune page ne doit être vide", total, lignesRecapMax)
                        .allMatch(taille -> taille > 0);
            }
        }
    }

    /** Reconstruit le découpage en pages (nombre de lignes par page) qu'un remplissage JasperReports
     * produirait pour {@code total} lignes avec, le cas échéant, un unique saut de page forcé juste
     * avant l'index {@code indexSaut} (ou aucun saut forcé si {@code indexSaut} vaut -1) — remplissage
     * glouton à pleine capacité partout, sauf sur la page interrompue par le saut forcé, qui se termine
     * prématurément à cet index. */
    private List<Integer> simulerDecoupagePages(int total, int indexSaut) {
        List<Integer> pages = new java.util.ArrayList<>();
        int index = 0;
        boolean premierePage = true;
        while (index < total) {
            int capacite = premierePage ? CAP_PREMIERE_SANS_FOOTER : CAP_CONTINUATION_SANS_FOOTER;
            int findeCettePage = Math.min(index + capacite, total);
            if (indexSaut > index && indexSaut < findeCettePage) {
                findeCettePage = indexSaut;
            }
            pages.add(findeCettePage - index);
            index = findeCettePage;
            premierePage = false;
        }
        return pages;
    }

    private Paie paie(String nomPrenom, String cin, String fonctionLibelle, String chantierCode,
                       String equipe, String salaireTotal, String observation) {
        Employee employee = new Employee();
        employee.setNomPrenom(nomPrenom);
        employee.setCin(cin);

        Function fonction = new Function();
        fonction.setLibelle(fonctionLibelle);

        Chantier chantier = new Chantier();
        chantier.setCode(chantierCode);

        Paie paie = new Paie();
        paie.setEmployee(employee);
        paie.setFonction(fonction);
        paie.setChantier(chantier);
        paie.setEquipe(equipe);
        paie.setNombreJoursTravailles(26);
        paie.setSalaireMensuel(new BigDecimal(salaireTotal));
        paie.setSalaireTotal(new BigDecimal(salaireTotal));
        paie.setObservation(observation);
        return paie;
    }
}
