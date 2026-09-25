package staport.rh.paie.report;

import java.util.List;

/** Racine de la vue-modèle du rapport PDF : chantiers déjà triés par ordre alphabétique
 * (hérité de {@code PerimetrePaie.parChantier()}, un {@code TreeMap}). */
public record RapportPaieVue(
        String periodeLibelle,
        List<ChantierRapportVue> chantiers
) {
}