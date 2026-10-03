package staport.rh.paie.export;

import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.reporting.MaterielChantierCatalogue;
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
                sheetWriter.ecrire(feuilleChantier, styles, titreZone(chantier.code(), chantier.lignes()), periode,
                        chantier.lignes(), chantier.totalMoisPrecedent(), null);

                ecrireFeuillesEquipes(workbook, styles, periode, chantier, requete.materiel());
            }

            // POI écrit la formule SUBTOTAL de "TOTAL GENERAL" sans valeur mise en cache : sans ce
            // flag, Excel/LibreOffice affichent la cellule vide tant qu'aucun recalcul manuel (F9)
            // n'a lieu, au lieu de calculer la somme à l'ouverture du fichier.
            workbook.setForceFormulaRecalculation(true);
            workbook.write(sortie);
            log.info("Export paie généré : periode={}, chantiers={}", periode, perimetre.parChantier().size());
            return new ByteArrayInputStream(sortie.toByteArray());
        } catch (IOException e) {
            throw new RuntimeException("Erreur lors de la génération de l'export paie : " + e.getMessage(), e);
        }
    }

    private void ecrireFeuillesEquipes(Workbook workbook, PaieExcelStyles styles, YearMonth periode, PerimetreChantier chantier,
                                       Map<String, Integer> materiel) {
        for (Map.Entry<String, List<Paie>> entree : chantier.lignesParEquipeAGenerer().entrySet()) {
            String equipe = entree.getKey();
            // Nom de la feuille : garde le CODE (identifiant technique, court, stable — voir
            // nomFeuilleValide) ; seul le TITRE affiché en cellule A1 (ecrireTitre) montre le libellé
            // de l'équipe (même règle que le rapport PDF). Toutes les lignes d'une même clé partagent
            // la même entité Equipe, donc le libellé est lu sur la première.
            Sheet feuilleEquipe = workbook.createSheet(nomFeuilleValide(chantier.code() + "_" + equipe));
            sheetWriter.ecrire(feuilleEquipe, styles,
                    titreZone(chantier.code(), entree.getValue()) + " - Equipe: " + entree.getValue().get(0).getEquipe().getLibelle(),
                    periode, entree.getValue(), chantier.totalMoisPrecedentParEquipe().get(equipe),
                    squeletteMateriel(chantier.code(), equipe, materiel));
        }
    }

    /** "&lt;nom&gt; (&lt;code&gt;)" quand {@code Chantier.nom} est renseigné (champ optionnel, jamais
     * exposé par la synchronisation ERP), "&lt;code&gt;" seul sinon (demande explicite de direction,
     * 2026-09-29 : le nom prime partout où il existe) — même règle que le rapport PDF, voir
     * {@code PaieBiReportBuilder.identifiantChantier}. Le nom est lu sur la première ligne du
     * chantier : toutes les lignes d'un même code partagent la même entité {@code Chantier}. */
    private String titreZone(String code, List<Paie> lignes) {
        String nom = lignes.isEmpty() ? null : lignes.get(0).getChantier().getNom();
        return nom != null && !nom.isBlank() ? nom + " (" + code + ")" : code;
    }

    /**
     * Squelette de tableau matériel à ajouter sur cette feuille équipe, ou {@code null} si le
     * chantier/l'équipe ne correspond à aucun cas prévu (voir {@link MaterielChantierCatalogue},
     * règle partagée avec le rapport PDF).
     */
    private SqueletteMateriel squeletteMateriel(String chantierCode, String equipe, Map<String, Integer> nombres) {
        String titre = MaterielChantierCatalogue.titre(chantierCode, equipe);
        return titre == null ? null : new SqueletteMateriel(titre, MaterielChantierCatalogue.libelles(chantierCode, equipe), nombres);
    }

    private String nomFeuilleValide(String nom) {
        String nomAssaini = nom.replaceAll("[\\\\/?*+\\[\\]]", "_");
        return nomAssaini.length() > NOM_FEUILLE_MAX ? nomAssaini.substring(0, NOM_FEUILLE_MAX) : nomAssaini;
    }
}
