package staport.rh.paie.export;

import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.reporting.PaiePerimetreService;
import staport.rh.paie.reporting.PerimetreChantier;
import staport.rh.paie.reporting.PerimetrePaie;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

/**
 * Reconstruit l'export multi-feuilles historique (paie_old) pour une période donnée : une feuille
 * globale (GLB), une feuille par chantier (tri alphabétique), et une sous-feuille par équipe pour
 * les chantiers/équipes sélectionnés (voir {@link PaiePerimetreService}, logique partagée avec le
 * rapport PDF). Contrairement à l'ancien export, "TOTAL GENERAL MOIS PRECEDENT" est désormais
 * réellement calculé (somme de la période précédente sur le même périmètre) — affiché
 * "INTROUVABLE" si aucune paie n'existe pour ce périmètre sur la période précédente, plutôt que
 * figé à 0 comme dans l'ancien export.
 */
@Service
public class PaieExportService {

    private static final Logger log = LoggerFactory.getLogger(PaieExportService.class);
    private static final int NOM_FEUILLE_MAX = 31;

    /**
     * Décision (HMAYDA, 2026-09-22) : sur les feuilles équipe du chantier "C168", un squelette de
     * tableau matériel (labels uniquement, colonne "Nbre" à remplir à la main) est ajouté à côté du
     * tableau "effectif par fonction" — CAMION pour l'équipe "CH", ENGINS pour l'équipe "OP".
     * Propre à ce chantier uniquement, aucune règle générale identifiée pour les autres. Spécifique
     * à Excel (un tableau "à remplir à la main" n'a pas de sens dans un PDF de reporting imprimé).
     */
    private static final String CHANTIER_MATERIEL = "C168";
    private static final String EQUIPE_CAMION = "CH";
    private static final String EQUIPE_ENGINS = "OP";
    private static final List<String> LIBELLES_CAMION = List.of(
            "CAMION CITERNE", "CAMION 8*4", "CAMION SR", "PORT CHAR", "PICK UP");
    private static final List<String> LIBELLES_ENGINS = List.of(
            "PELLE PNEU", "PELLE CHENILLE", "NIVELEUSE", "COMPACTEURS", "CHARGEUR", "BULL", "TRACTOPELLE");

    private final PaiePerimetreService perimetreService;
    private final PaieSheetWriter sheetWriter = new PaieSheetWriter();

    public PaieExportService(PaiePerimetreService perimetreService) {
        this.perimetreService = perimetreService;
    }

    public ByteArrayInputStream exporter(YearMonth periode, PaieExportRequestDto requete) {
        PerimetrePaie perimetre = perimetreService.calculer(periode, requete.feuillesEquipeMode(),
                requete.equipesParChantier(), requete.equipesExcluesFeuilleChantier(), requete.chantiers());

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            PaieExcelStyles styles = new PaieExcelStyles(workbook);

            Sheet feuilleGlobale = workbook.createSheet("GLB");
            sheetWriter.ecrire(feuilleGlobale, styles, "GLOBAL", periode, perimetre.lignesGlobales(),
                    perimetre.totalMoisPrecedentGlobal(), null);

            for (PerimetreChantier chantier : perimetre.parChantier().values()) {
                Sheet feuilleChantier = workbook.createSheet(nomFeuilleValide(chantier.code()));
                sheetWriter.ecrire(feuilleChantier, styles, chantier.code(), periode, chantier.lignes(),
                        chantier.totalMoisPrecedent(), null);

                ecrireFeuillesEquipes(workbook, styles, periode, chantier);
            }

            workbook.write(sortie);
            log.info("Export paie généré : periode={}, chantiers={}", periode, perimetre.parChantier().size());
            return new ByteArrayInputStream(sortie.toByteArray());
        } catch (IOException e) {
            throw new RuntimeException("Erreur lors de la génération de l'export paie : " + e.getMessage(), e);
        }
    }

    private void ecrireFeuillesEquipes(Workbook workbook, PaieExcelStyles styles, YearMonth periode, PerimetreChantier chantier) {
        for (Map.Entry<String, List<Paie>> entree : chantier.lignesParEquipeAGenerer().entrySet()) {
            String equipe = entree.getKey();
            Sheet feuilleEquipe = workbook.createSheet(nomFeuilleValide(chantier.code() + "_" + equipe));
            sheetWriter.ecrire(feuilleEquipe, styles, chantier.code() + " - Equipe: " + equipe, periode, entree.getValue(),
                    chantier.totalMoisPrecedentParEquipe().get(equipe),
                    squeletteMateriel(chantier.code(), equipe));
        }
    }

    /**
     * Squelette de tableau matériel à ajouter sur cette feuille équipe, ou {@code null} si le
     * chantier/l'équipe ne correspond à aucun cas prévu. Comparaison insensible à la casse et aux
     * espaces superflus.
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

    private String nomFeuilleValide(String nom) {
        String nomAssaini = nom.replaceAll("[\\\\/?*+\\[\\]]", "_");
        return nomAssaini.length() > NOM_FEUILLE_MAX ? nomAssaini.substring(0, NOM_FEUILLE_MAX) : nomAssaini;
    }
}
