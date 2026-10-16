package staport.rh.paie.report;

/** KPI de comptage avec comparaison au mois précédent. Zéro est une valeur légitime ; une comparaison
 * indisponible (aucun bulletin sur le périmètre précédent) reste distincte d'une variation nulle. */
record KpiCompteVue(
        int valeurCourante,
        int valeurPrecedente,
        int variation,
        boolean comparaisonDisponible
) {

    KpiCompteVue(int valeurCourante, int valeurPrecedente, int variation) {
        this(valeurCourante, valeurPrecedente, variation, true);
    }
}
