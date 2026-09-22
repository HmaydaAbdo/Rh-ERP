package staport.rh.paie.export;

import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.repositories.PaieRepository;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Reconstruit l'export multi-feuilles historique (paie_old) pour une période donnée : une feuille
 * globale (GLB), une feuille par chantier (tri alphabétique), et une sous-feuille par équipe pour
 * les chantiers explicitement demandés. Contrairement à l'ancien export, "TOTAL GENERAL MOIS
 * PRECEDENT" est désormais réellement calculé (somme de la période précédente sur le même
 * périmètre) — affiché "INTROUVABLE" si aucune paie n'existe pour ce périmètre sur la période
 * précédente, plutôt que figé à 0 comme dans l'ancien export.
 */
@Service
public class PaieExportService {

    private static final Logger log = LoggerFactory.getLogger(PaieExportService.class);
    private static final int NOM_FEUILLE_MAX = 31;

    /**
     * Décision (HMAYDA, 2026-09-22) : sur les feuilles équipe du chantier "C168", un squelette de
     * tableau matériel (labels uniquement, colonne "Nbre" à remplir à la main) est ajouté à côté du
     * tableau "effectif par fonction" — CAMION pour l'équipe "CH", ENGINS pour l'équipe "OP".
     * Propre à ce chantier uniquement, aucune règle générale identifiée pour les autres.
     */
    private static final String CHANTIER_MATERIEL = "C168";
    private static final String EQUIPE_CAMION = "CH";
    private static final String EQUIPE_ENGINS = "OP";
    private static final List<String> LIBELLES_CAMION = List.of(
            "CAMION CITERNE", "CAMION 8*4", "CAMION SR", "PORT CHAR", "PICK UP");
    private static final List<String> LIBELLES_ENGINS = List.of(
            "PELLE PNEU", "PELLE CHENILLE", "NIVELEUSE", "COMPACTEURS", "CHARGEUR", "BULL", "TRACTOPELLE");

    private final PaieRepository repository;
    private final PaieSheetWriter sheetWriter = new PaieSheetWriter();

    public PaieExportService(PaieRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public ByteArrayInputStream exporter(YearMonth periode, List<String> chantiersCiblesPourEquipes) {
        List<Paie> lignesPeriode = repository.findByPeriode(periode);
        List<Paie> lignesPeriodePrecedente = repository.findByPeriode(periode.minusMonths(1));

        Set<String> chantiersEquipes = chantiersCiblesPourEquipes == null
                ? Set.of()
                : chantiersCiblesPourEquipes.stream()
                        .filter(Objects::nonNull)
                        .map(c -> c.trim().toUpperCase())
                        .collect(Collectors.toSet());

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            PaieExcelStyles styles = new PaieExcelStyles(workbook);

            Sheet feuilleGlobale = workbook.createSheet("GLB");
            sheetWriter.ecrire(feuilleGlobale, styles, "GLOBAL", periode, lignesPeriode,
                    totalSalairesOuNull(lignesPeriodePrecedente), null);

            Map<String, List<Paie>> lignesParChantier = groupBy(lignesPeriode, p -> p.getChantier().getCode());
            Map<String, List<Paie>> lignesPrecedentesParChantier = groupBy(lignesPeriodePrecedente, p -> p.getChantier().getCode());

            for (Map.Entry<String, List<Paie>> entree : lignesParChantier.entrySet()) {
                String chantierCode = entree.getKey();
                List<Paie> lignesChantier = entree.getValue();

                Sheet feuilleChantier = workbook.createSheet(nomFeuilleValide(chantierCode));
                sheetWriter.ecrire(feuilleChantier, styles, chantierCode, periode, lignesChantier,
                        totalSalairesOuNull(lignesPrecedentesParChantier.getOrDefault(chantierCode, List.of())), null);

                if (chantiersEquipes.contains(chantierCode.toUpperCase())) {
                    ecrireFeuillesEquipes(workbook, styles, periode, chantierCode, lignesChantier,
                            lignesPrecedentesParChantier.getOrDefault(chantierCode, List.of()));
                }
            }

            workbook.write(sortie);
            log.info("Export paie généré : periode={}, chantiers={}", periode, lignesParChantier.size());
            return new ByteArrayInputStream(sortie.toByteArray());
        } catch (IOException e) {
            throw new RuntimeException("Erreur lors de la génération de l'export paie : " + e.getMessage(), e);
        }
    }

    private void ecrireFeuillesEquipes(Workbook workbook, PaieExcelStyles styles, YearMonth periode,
                                        String chantierCode, List<Paie> lignesChantier, List<Paie> lignesChantierPrecedentes) {
        Map<String, List<Paie>> lignesParEquipe = groupBy(
                lignesChantier.stream().filter(p -> p.getEquipe() != null && !p.getEquipe().isBlank()).toList(),
                Paie::getEquipe);
        Map<String, List<Paie>> lignesPrecedentesParEquipe = groupBy(
                lignesChantierPrecedentes.stream().filter(p -> p.getEquipe() != null && !p.getEquipe().isBlank()).toList(),
                Paie::getEquipe);

        for (Map.Entry<String, List<Paie>> entree : lignesParEquipe.entrySet()) {
            String equipe = entree.getKey();
            Sheet feuilleEquipe = workbook.createSheet(nomFeuilleValide(chantierCode + "_" + equipe));
            sheetWriter.ecrire(feuilleEquipe, styles, chantierCode + " - Equipe: " + equipe, periode, entree.getValue(),
                    totalSalairesOuNull(lignesPrecedentesParEquipe.getOrDefault(equipe, List.of())),
                    squeletteMateriel(chantierCode, equipe));
        }
    }

    /**
     * Squelette de tableau matériel à ajouter sur cette feuille équipe, ou {@code null} si le
     * chantier/l'équipe ne correspond à aucun cas prévu. Comparaison insensible à la casse et aux
     * espaces superflus (mêmes précautions que pour {@code chantiersCiblesPourEquipes}).
     */
    private SqueletteMateriel squeletteMateriel(String chantierCode, String equipe) {
        if (chantierCode == null || equipe == null || !chantierCode.trim().equalsIgnoreCase(CHANTIER_MATERIEL)) {
            return null;
        }
        String equipeNormalisee = equipe.trim();
        if (equipeNormalisee.equalsIgnoreCase(EQUIPE_CAMION)) {
            return new SqueletteMateriel("CAMION", LIBELLES_CAMION);
        }
        if (equipeNormalisee.equalsIgnoreCase(EQUIPE_ENGINS)) {
            return new SqueletteMateriel("ENGINS", LIBELLES_ENGINS);
        }
        return null;
    }

    private Map<String, List<Paie>> groupBy(List<Paie> lignes, java.util.function.Function<Paie, String> classificateur) {
        return lignes.stream().collect(Collectors.groupingBy(classificateur, TreeMap::new, Collectors.toList()));
    }

    /**
     * Total de la période précédente pour le périmètre donné (chantier/équipe/global), ou
     * {@code null} si aucune paie n'existe pour ce périmètre sur cette période — distingue "aucune
     * donnée" (à afficher comme "INTROUVABLE") de "total réellement nul".
     */
    private BigDecimal totalSalairesOuNull(List<Paie> lignes) {
        if (lignes.isEmpty()) {
            return null;
        }
        return lignes.stream()
                .map(Paie::getSalaireTotal)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private String nomFeuilleValide(String nom) {
        String nomAssaini = nom.replaceAll("[\\\\/?*+\\[\\]]", "_");
        return nomAssaini.length() > NOM_FEUILLE_MAX ? nomAssaini.substring(0, NOM_FEUILLE_MAX) : nomAssaini;
    }
}
