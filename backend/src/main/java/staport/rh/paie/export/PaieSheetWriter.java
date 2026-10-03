package staport.rh.paie.export;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.reporting.ObservationStc;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Écrit une feuille de paie (titre, en-têtes à deux niveaux, lignes employés, totaux, effectif par
 * fonction) — même mise en page que l'export historique (paie_old), extraite ici en classe dédiée
 * pour être réutilisée par la feuille globale, chaque feuille chantier et chaque feuille équipe.
 */
class PaieSheetWriter {

    private static final DateTimeFormatter FORMAT_PERIODE = DateTimeFormatter.ofPattern("MM-yyyy");
    private static final int DERNIERE_COLONNE = 12;
    // Tableau "effectif par fonction" sur les colonnes 0-2, puis 3 colonnes vides (3-5) avant le
    // squelette matériel (colonnes 6-7), conformément au positionnement demandé.
    private static final int COLONNE_SQUELETTE = 6;

    void ecrire(Sheet sheet, PaieExcelStyles styles, String titreZone, YearMonth periode,
                List<Paie> lignes, BigDecimal totalPeriodePrecedente, SqueletteMateriel materiel) {
        ecrireTitre(sheet, styles, titreZone, periode);
        ecrireEntetes(sheet, styles);

        // Tri alphabétique par Fonction (demande explicite de direction, 2026-09-29 — auparavant
        // l'ordre brut de la requête, sans tri) : nom/prénom en second critère. Tri à l'écriture
        // uniquement — n'affecte ni les totaux (SUBTOTAL sur la plage, indifférent à l'ordre) ni le
        // tableau "effectif par fonction" ci-dessous (déjà regroupé/trié indépendamment via TreeMap).
        List<Paie> lignesTriees = lignes.stream()
                .sorted(Comparator.comparing((Paie p) -> p.getFonction().getLibelle(), String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(p -> p.getEmployee().getNomPrenom(), String.CASE_INSENSITIVE_ORDER))
                .toList();

        int premiereLigneDonnees = 4;
        int ligneCourante = premiereLigneDonnees;
        for (Paie paie : lignesTriees) {
            ecrireLigneEmploye(sheet, styles, ligneCourante++, paie);
        }
        int derniereLigneDonnees = ligneCourante - 1;

        ligneCourante = ecrireLigneTotal(sheet, styles, ligneCourante, "TOTAL GENERAL",
                formuleSousTotal(premiereLigneDonnees, derniereLigneDonnees), null);
        ecrireLigneTotal(sheet, styles, ligneCourante, "TOTAL GENERAL MOIS PRECEDENT", null, totalPeriodePrecedente);

        int ligneDepartTableauxBas = ligneCourante + 2;
        ecrireEffectifParFonction(sheet, styles, ligneDepartTableauxBas, lignes);
        if (materiel != null) {
            ecrireSqueletteMateriel(sheet, styles, ligneDepartTableauxBas, materiel);
        }
        ajusterLargeurColonnes(sheet);
    }

    private void ecrireTitre(Sheet sheet, PaieExcelStyles styles, String titreZone, YearMonth periode) {
        Row ligne = sheet.createRow(0);
        Cell cellule = ligne.createCell(0);
        cellule.setCellValue("CHANTIER : " + titreZone + "  -  PAIE MOIS " + FORMAT_PERIODE.format(periode));
        cellule.setCellStyle(styles.titre);
        for (int c = 1; c <= DERNIERE_COLONNE; c++) {
            ligne.createCell(c).setCellStyle(styles.titre);
        }
        sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, DERNIERE_COLONNE));
        sheet.createRow(1);
    }

    private void ecrireEntetes(Sheet sheet, PaieExcelStyles styles) {
        Row entete = sheet.createRow(2);
        String[] libellesEntete = {"NOM & PRENOM", "FONCTION", "CIN", "Nbre Jrs", "", "", "SALAIRE", "", "", "TOTAL", "OBS", "CHANTIER", "EQ"};
        for (int c = 0; c < libellesEntete.length; c++) {
            entete.createCell(c).setCellValue(libellesEntete[c]);
        }

        Row sousEntete = sheet.createRow(3);
        String[] libellesSousEntete = {"", "", "", "P", "J.R.O", "J.R.D", "SALAIRE", "RO", "RD", "", "", "", ""};
        for (int c = 0; c < libellesSousEntete.length; c++) {
            sousEntete.createCell(c).setCellValue(libellesSousEntete[c]);
        }

        sheet.addMergedRegion(new CellRangeAddress(2, 2, 3, 5));
        sheet.addMergedRegion(new CellRangeAddress(2, 2, 6, 8));
        for (int c : new int[]{0, 1, 2, 9, 10, 11, 12}) {
            sheet.addMergedRegion(new CellRangeAddress(2, 3, c, c));
        }

        appliquerStyle(entete, styles.entete);
        appliquerStyle(sousEntete, styles.sousEntete);
    }

    private void ecrireLigneEmploye(Sheet sheet, PaieExcelStyles styles, int indexLigne, Paie paie) {
        Row ligne = sheet.createRow(indexLigne);

        ecrireTexte(ligne, 0, paie.getEmployee().getNomPrenom(), styles.donneeGauche);
        ecrireTexte(ligne, 1, paie.getFonction().getLibelle(), styles.donneeGauche);
        ecrireTexte(ligne, 2, paie.getEmployee().getCin(), styles.donneeCentre);
        ecrireEntier(ligne, 3, paie.getNombreJoursTravailles(), styles.donneeCentre);
        ecrireDecimal(ligne, 4, paie.getJoursRecuperationOuvrable(), styles.donneeCentre);
        ecrireDecimal(ligne, 5, paie.getJoursRecuperationDimanche(), styles.donneeCentre);
        ecrireMontant(ligne, 6, paie.getSalaireMensuel(), styles.donneeMontant);
        ecrireMontant(ligne, 7, paie.getPrimeRoulageOrdinaire(), styles.donneeMontant);
        ecrireMontant(ligne, 8, paie.getPrimeRoulageDimanche(), styles.donneeMontant);
        ecrireMontant(ligne, 9, paie.getSalaireTotal(), styles.donneeMontant);
        ecrireTexte(ligne, 10, paie.getObservation(), styles.donneeCentre);
        ecrireTexte(ligne, 11, paie.getChantier().getCode(), styles.donneeCentre);
        ecrireTexte(ligne, 12, paie.getEquipe() != null ? paie.getEquipe().getCode() : null, styles.donneeCentre);
    }

    private int ecrireLigneTotal(Sheet sheet, PaieExcelStyles styles, int indexLigne, String libelle,
                                  String formule, BigDecimal valeurFixe) {
        Row ligne = sheet.createRow(indexLigne);
        for (int c = 3; c <= 9; c++) {
            ligne.createCell(c).setCellStyle(styles.donneeCentre);
        }
        sheet.addMergedRegion(new CellRangeAddress(indexLigne, indexLigne, 3, 8));

        Cell celluleLibelle = ligne.getCell(3);
        celluleLibelle.setCellValue(libelle);
        celluleLibelle.setCellStyle(styles.totalLibelle);

        Cell celluleValeur = ligne.getCell(9);
        if (formule != null) {
            celluleValeur.setCellFormula(formule);
        } else if (valeurFixe != null) {
            celluleValeur.setCellValue(valeurFixe.doubleValue());
        } else {
            celluleValeur.setCellValue("INTROUVABLE");
        }
        celluleValeur.setCellStyle(styles.totalMontant);

        return indexLigne + 1;
    }

    private void ecrireEffectifParFonction(Sheet sheet, PaieExcelStyles styles, int ligneDepart, List<Paie> lignes) {
        Row entete = sheet.createRow(ligneDepart);
        ecrireTexte(entete, 0, "FONCTION", styles.entete);
        ecrireTexte(entete, 1, "EFFECTIF", styles.entete);
        ecrireTexte(entete, 2, "STC", styles.entete);

        Map<String, List<Paie>> lignesParFonction = lignes.stream()
                .collect(Collectors.groupingBy(
                        p -> p.getFonction().getLibelle(),
                        TreeMap::new,
                        Collectors.toList()));

        int indexLigne = ligneDepart + 1;
        for (Map.Entry<String, List<Paie>> entry : lignesParFonction.entrySet()) {
            Row ligne = sheet.createRow(indexLigne++);
            List<Paie> lignesFonction = entry.getValue();
            long stc = lignesFonction.stream().filter(ObservationStc::estStcOuSortie).count();
            ecrireTexte(ligne, 0, entry.getKey(), styles.donneeGauche);
            ecrireEntier(ligne, 1, lignesFonction.size(), styles.donneeCentre);
            ecrireEntier(ligne, 2, (int) stc, styles.donneeCentre);
        }
    }

    /**
     * Écrit le squelette matériel (CAMION/ENGINS) sur les mêmes lignes que le tableau "effectif par
     * fonction" — seules les étiquettes de la première colonne sont renseignées, la colonne "Nbre"
     * reste vide (à remplir à la main). Les lignes étant partagées avec le tableau effectif, on
     * récupère la ligne existante plutôt que d'en recréer une (`Sheet.createRow` sur un index déjà
     * utilisé effacerait le contenu déjà écrit par `ecrireEffectifParFonction`).
     */
    private void ecrireSqueletteMateriel(Sheet sheet, PaieExcelStyles styles, int ligneDepart, SqueletteMateriel materiel) {
        Row entete = obtenirOuCreerLigne(sheet, ligneDepart);
        ecrireTexte(entete, COLONNE_SQUELETTE, materiel.titreColonne(), styles.entete);
        ecrireTexte(entete, COLONNE_SQUELETTE + 1, "Nbre", styles.entete);

        int indexLigne = ligneDepart + 1;
        for (String libelle : materiel.libelles()) {
            Row ligne = obtenirOuCreerLigne(sheet, indexLigne++);
            ecrireTexte(ligne, COLONNE_SQUELETTE, libelle, styles.donneeGauche);
            ligne.createCell(COLONNE_SQUELETTE + 1).setCellStyle(styles.donneeCentre);
        }
    }

    private Row obtenirOuCreerLigne(Sheet sheet, int indexLigne) {
        Row ligne = sheet.getRow(indexLigne);
        return ligne != null ? ligne : sheet.createRow(indexLigne);
    }

    private String formuleSousTotal(int premiereLigneDonnees, int derniereLigneDonnees) {
        if (derniereLigneDonnees < premiereLigneDonnees) {
            return "SUBTOTAL(9,J1:J1)-SUBTOTAL(9,J1:J1)";
        }
        return "SUBTOTAL(9,J" + (premiereLigneDonnees + 1) + ":J" + (derniereLigneDonnees + 1) + ")";
    }

    private void appliquerStyle(Row ligne, CellStyle style) {
        for (Cell cellule : ligne) {
            cellule.setCellStyle(style);
        }
    }

    private void ecrireTexte(Row ligne, int colonne, String valeur, CellStyle style) {
        Cell cellule = ligne.createCell(colonne);
        cellule.setCellValue(valeur != null ? valeur : "");
        cellule.setCellStyle(style);
    }

    private void ecrireEntier(Row ligne, int colonne, Integer valeur, CellStyle style) {
        Cell cellule = ligne.createCell(colonne);
        cellule.setCellValue(valeur != null ? valeur : 0);
        cellule.setCellStyle(style);
    }

    private void ecrireDecimal(Row ligne, int colonne, BigDecimal valeur, CellStyle style) {
        Cell cellule = ligne.createCell(colonne);
        cellule.setCellValue(valeur != null ? valeur.doubleValue() : 0.0);
        cellule.setCellStyle(style);
    }

    private void ecrireMontant(Row ligne, int colonne, BigDecimal valeur, CellStyle style) {
        Cell cellule = ligne.createCell(colonne);
        cellule.setCellValue(valeur != null ? valeur.doubleValue() : 0.0);
        cellule.setCellStyle(style);
    }

    private void ajusterLargeurColonnes(Sheet sheet) {
        for (int c = 0; c <= DERNIERE_COLONNE; c++) {
            sheet.autoSizeColumn(c);
            int largeurActuelle = sheet.getColumnWidth(c);
            sheet.setColumnWidth(c, Math.max(largeurActuelle + 768, 3000));
        }
    }
}
