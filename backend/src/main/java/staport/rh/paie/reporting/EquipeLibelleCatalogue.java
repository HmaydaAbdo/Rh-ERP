package staport.rh.paie.reporting;

import java.util.Locale;
import java.util.Map;

/**
 * Nom complet d'affichage d'une équipe, à partir de son code brut tel que saisi en base ("CH",
 * "OP"...) — table fournie par la direction (fichier {@code EQUIPES.xlsx}, 2026-09-29). Ne remplace
 * JAMAIS le code brut comme clé de sélection/regroupement (utilisé tel quel par le dialog d'export,
 * {@code PaieReportPdfRequestDto.equipesParChantier}, l'agrégation BI, etc.) — sert uniquement à
 * l'AFFICHAGE (titres de section, bandeau CHANTIER/ÉQUIPE, colonne "Équipe", graphique "Répartition
 * par équipe", feuilles Excel), partagé entre le rapport PDF et l'export Excel pour ne jamais
 * dupliquer cette règle. Un code absent de cette table est affiché tel quel (jamais de crash ni de
 * masquage d'une équipe imprévue) — recherche insensible à la casse et aux espaces superflus.
 */
public final class EquipeLibelleCatalogue {

    private static final Map<String, String> LIBELLES = Map.ofEntries(
            Map.entry("CH", "CHAUFFEURS"),
            Map.entry("OP", "OPERATEURS"),
            Map.entry("AT", "ATELIER"),
            Map.entry("EE", "EQUIPE ENROBE"),
            Map.entry("TER", "TERASSEMENT"),
            Map.entry("GA", "GARDIENS"),
            Map.entry("TOPO", "TOPOGRAPHES"),
            Map.entry("ADMIN", "ADMINISTRATION"),
            Map.entry("ENR", "ENROCHEMENT"),
            Map.entry("ENROCHEMENT", "ENROCHEMENT"),
            Map.entry("R CONT", "REMBLAIS CONTIGUE"),
            Map.entry("GABION", "GABION"),
            Map.entry("PHS", "PLAN HYGIENE ET SECURITE"),
            Map.entry("EB", "EQUIPE BETON")
    );

    private EquipeLibelleCatalogue() {
    }

    /** Nom complet ("CHAUFFEURS") pour ce code brut ("CH"), ou le code tel quel si absent de la
     * table. {@code null}/vide renvoyé tel quel : c'est à l'appelant de décider de l'affichage "vide"
     * pour un employé sans équipe, pas à ce catalogue. */
    public static String libelle(String code) {
        if (code == null || code.isBlank()) {
            return code;
        }
        String libelle = LIBELLES.get(code.trim().toUpperCase(Locale.FRANCE));
        return libelle != null ? libelle : code;
    }
}
