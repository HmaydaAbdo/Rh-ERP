package staport.rh.paie.export;

import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataFormat;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;

import java.awt.Color;

/**
 * Styles de cellule utilisés par l'export paie, créés une seule fois par classeur.
 */
public class PaieExcelStyles {

    private static final String FORMAT_MONETAIRE = "#,##0.00";

    public final CellStyle titre;
    public final CellStyle entete;
    public final CellStyle sousEntete;
    public final CellStyle donneeGauche;
    public final CellStyle donneeCentre;
    public final CellStyle donneeDroite;
    public final CellStyle donneeMontant;
    public final CellStyle totalLibelle;
    public final CellStyle totalMontant;

    public PaieExcelStyles(Workbook workbook) {
        Font policeTitre = workbook.createFont();
        policeTitre.setBold(true);
        policeTitre.setFontHeightInPoints((short) 11);
        titre = workbook.createCellStyle();
        titre.setFont(policeTitre);
        titre.setAlignment(HorizontalAlignment.CENTER);
        titre.setVerticalAlignment(VerticalAlignment.CENTER);

        entete = creerStyleAvecFond(workbook, true, new Color(211, 211, 211));
        sousEntete = creerStyleAvecFond(workbook, false, new Color(240, 240, 240));

        CellStyle base = creerStyleBordure(workbook);
        donneeGauche = cloner(workbook, base, HorizontalAlignment.LEFT);
        donneeCentre = cloner(workbook, base, HorizontalAlignment.CENTER);
        donneeDroite = cloner(workbook, base, HorizontalAlignment.RIGHT);

        DataFormat format = workbook.createDataFormat();
        donneeMontant = cloner(workbook, base, HorizontalAlignment.RIGHT);
        donneeMontant.setDataFormat(format.getFormat(FORMAT_MONETAIRE));

        Font policeGras = workbook.createFont();
        policeGras.setBold(true);

        totalLibelle = cloner(workbook, base, HorizontalAlignment.CENTER);
        totalLibelle.setFont(policeGras);

        totalMontant = cloner(workbook, base, HorizontalAlignment.RIGHT);
        totalMontant.setFont(policeGras);
        totalMontant.setDataFormat(format.getFormat(FORMAT_MONETAIRE));
    }

    private CellStyle creerStyleAvecFond(Workbook workbook, boolean gras, Color couleur) {
        CellStyle style = workbook.createCellStyle();
        Font police = workbook.createFont();
        police.setBold(gras);
        police.setItalic(!gras);
        style.setFont(police);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        if (style instanceof XSSFCellStyle xssfStyle) {
            xssfStyle.setFillForegroundColor(new XSSFColor(couleur, null));
            xssfStyle.setFillPattern(org.apache.poi.ss.usermodel.FillPatternType.SOLID_FOREGROUND);
        }
        return style;
    }

    private CellStyle creerStyleBordure(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        return style;
    }

    private CellStyle cloner(Workbook workbook, CellStyle base, HorizontalAlignment alignement) {
        CellStyle style = workbook.createCellStyle();
        style.cloneStyleFrom(base);
        style.setAlignment(alignement);
        return style;
    }
}
