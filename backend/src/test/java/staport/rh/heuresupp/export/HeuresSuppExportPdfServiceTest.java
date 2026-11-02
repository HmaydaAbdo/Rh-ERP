package staport.rh.heuresupp.export;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;
import staport.rh.heuresupp.entities.HeureSupp;
import staport.rh.heuresupp.imports.HeuresSuppImportException;
import staport.rh.heuresupp.mappers.HeuresSuppMapper;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.paie.report.PaieReportHtmlPdfService;
import staport.rh.paie.report.RapportRessourcesStatiques;

import java.io.IOException;
import java.lang.reflect.Constructor;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HeuresSuppExportPdfServiceTest {

    @Mock
    private HeuresSuppRepository repository;
    @Mock
    private HeuresSuppMapper mapper;

    private HeuresSuppExportPdfService service;

    @BeforeEach
    void setUp() throws Exception {
        RapportRessourcesStatiques ressources = new RapportRessourcesStatiques();
        // Le rendu PDF est celui du rapport de paie : seul le moteur est utilisé, sans ses constructeurs métier.
        Constructor<PaieReportHtmlPdfService> constructeur = PaieReportHtmlPdfService.class.getDeclaredConstructors().length == 1
                ? castConstructeur(PaieReportHtmlPdfService.class.getDeclaredConstructors()[0]) : null;
        constructeur.setAccessible(true);
        PaieReportHtmlPdfService rendu = constructeur.newInstance(ressources, null, null, null);
        service = new HeuresSuppExportPdfService(repository, mapper, ressources, rendu);
    }

    @SuppressWarnings("unchecked")
    private static Constructor<PaieReportHtmlPdfService> castConstructeur(Constructor<?> constructeur) {
        return (Constructor<PaieReportHtmlPdfService>) constructeur;
    }

    private static HeureSuppResponseDto ligne(int numero, String nom) {
        return new HeureSuppResponseDto((long) numero, 0L, (long) numero, nom, "AB" + numero, 1L, "Chauffeur", 4L, "C4", "Site",
                YearMonth.of(2026, 10), new BigDecimal("4000"), null, new BigDecimal("15"), new BigDecimal("2"),
                new BigDecimal("30.00"), false, BigDecimal.ZERO, new BigDecimal("100.00"), new BigDecimal("130.00"));
    }

    private void donner(List<HeureSuppResponseDto> lignes) {
        List<HeureSupp> entites = lignes.stream().map(l -> new HeureSupp()).toList();
        when(repository.findAll(any(Specification.class), any(Sort.class))).thenReturn(entites);
        int[] index = {0};
        org.mockito.Mockito.lenient().when(mapper.toDto(any(HeureSupp.class))).thenAnswer(appel -> lignes.get(index[0]++));
    }

    private static String texte(byte[] pdf) throws IOException {
        try (PDDocument document = PDDocument.load(pdf)) {
            return new PDFTextStripper().getText(document);
        }
    }

    private static int pages(byte[] pdf) throws IOException {
        try (PDDocument document = PDDocument.load(pdf)) {
            return document.getNumberOfPages();
        }
    }

    @Test
    void le_tri_par_defaut_est_le_mois_decroissant_puis_le_nom() {
        Sort tri = HeuresSuppExportPdfService.trier(null);

        assertThat(tri.getOrderFor("periode").isDescending()).isTrue();
        assertThat(tri.getOrderFor("employee.nomPrenom").isAscending()).isTrue();
    }

    @Test
    void le_tri_de_la_vue_est_repris_avec_son_sens() {
        Sort tri = HeuresSuppExportPdfService.trier("montant,desc");

        assertThat(tri.iterator().next().getProperty()).isEqualTo("montant");
        assertThat(tri.iterator().next().isDescending()).isTrue();
        assertThat(HeuresSuppExportPdfService.trier("employee.nomPrenom,asc").iterator().next().isAscending()).isTrue();
    }

    @Test
    void un_tri_inconnu_ou_mal_forme_est_refuse() {
        assertThatThrownBy(() -> HeuresSuppExportPdfService.trier("password,asc")).isInstanceOf(HeuresSuppImportException.class);
        assertThatThrownBy(() -> HeuresSuppExportPdfService.trier("montant,sideways")).isInstanceOf(HeuresSuppImportException.class);
        assertThatThrownBy(() -> HeuresSuppExportPdfService.trier("montant,asc,x")).isInstanceOf(HeuresSuppImportException.class);
    }

    @Test
    void le_pdf_couvre_toutes_les_lignes_du_perimetre_avec_entete_pagination_et_totaux() throws IOException {
        donner(IntStream.rangeClosed(1, 60).mapToObj(i -> ligne(i, "Employé " + i)).toList());

        byte[] pdf = service.generer(new HeuresSuppExportRequestDto(YearMonth.of(2026, 10), List.of(4L), null, null, "AB", "Employé", "montant,desc"));
        String texte = texte(pdf);

        // 60 lignes + la ligne de totaux = 61 lignes, 22 par page.
        assertThat(pages(pdf)).isEqualTo(3);
        assertThat(texte).contains("Ressources Humaines", "Heures supplémentaires 2026-10", "Mois : 2026-10", "Nom : Employé", "CIN : AB",
                "1 chantier(s)", "Tri : Montant (décroissant)", "Employé 1 ", "Employé 60", "Total · 60 lignes", "Page 3 / 3", "Émargement");
        // Les champs retirés de l'interface ne figurent pas dans le rapport.
        assertThat(texte).doesNotContain("Statut paie").doesNotContain("Type salaire");
        verify(repository).findAll(any(Specification.class), eq(HeuresSuppExportPdfService.trier("montant,desc")));
    }

    @Test
    void un_perimetre_vide_donne_un_pdf_avec_ses_totaux_a_zero() throws IOException {
        donner(List.of());

        byte[] pdf = service.generer(new HeuresSuppExportRequestDto(null, null, null, null, null, null, null));

        assertThat(pages(pdf)).isEqualTo(1);
        assertThat(texte(pdf)).contains("Tous les mois", "Total · 0 ligne");
    }

    @Test
    void les_donnees_ne_sont_jamais_interpretees_comme_du_html() throws IOException {
        donner(List.of(ligne(1, "<tr><b>Piège & co</b></tr>")));

        byte[] pdf = service.generer(new HeuresSuppExportRequestDto(YearMonth.of(2026, 10), null, null, null, null, null, null));

        assertThat(texte(pdf)).contains("<tr><b>Piège & co</b></tr>");
    }

    @Test
    void au_dela_du_plafond_l_export_est_refuse_avec_un_message_clair() {
        donner(IntStream.rangeClosed(1, HeuresSuppExportPdfService.LIGNES_MAX + 1).mapToObj(i -> ligne(i, "E" + i)).toList());

        assertThatThrownBy(() -> service.generer(new HeuresSuppExportRequestDto(null, null, null, null, null, null, null)))
                .isInstanceOf(HeuresSuppImportException.class).hasMessageContaining("5000").hasMessageContaining("Affinez");
    }
}
