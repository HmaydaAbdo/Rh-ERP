package staport.rh.paie.report;

/** Une ligne employé dans le tableau détaillé d'une section — mêmes colonnes que la liste Paie à
 * l'écran, moins chantier/équipe (déjà portés par les titres de section) — sauf {@code equipeReelle}
 * (voir plus bas).
 *
 * <p>{@code equipeReelle} : la VRAIE équipe de cet employé (ou "Sans équipe"), toujours calculée —
 * mais affichée uniquement dans la section "reste" d'un chantier (voir {@code rapport.jrxml},
 * colonne "Équipe" masquée ailleurs, printWhenExpression sur {@code equipeNom.equals(chantierCode)})
 * : dans une section équipe sélectionnée, tous les employés partagent déjà la même équipe, affichée
 * au titre de section — redondant de le répéter par ligne. Dans le "reste", en revanche, les
 * employés viennent de plusieurs équipes non sélectionnées (voire "Sans équipe") mélangées — demande
 * explicite de direction, 2026-09-29 : sans cette colonne, impossible de savoir à quelle équipe
 * appartient un employé donné dans cette section fusionnée. */
record LigneEmployeVue(
        String nomPrenom,
        String fonction,
        String cin,
        int joursTravailles,
        String joursRecuperationOuvrable,
        String joursRecuperationDimanche,
        String salaireMensuel,
        String primeRoulageOrdinaire,
        String primeRoulageDimanche,
        String salaireTotal,
        String observation,
        String equipeReelle
) {
}
