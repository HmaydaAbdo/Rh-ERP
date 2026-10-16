package staport.rh.paie.report;

/**
 * Une ligne du parc matériel (CAMION ou ENGINS) pour les équipes C168/CH et C168/OP — mêmes règles
 * et libellés que l'export Excel. Le wizard fournit les quantités au rapport PDF ; une valeur nulle
 * signifie que la ligne n'a pas été renseignée.
 */
public final class MaterielLigneVue {

    private final String libelle;
    private final Integer nombre;

    /** {@code nombre} nul : ligne non renseignée, absente du graphique matériel. */
    MaterielLigneVue(String libelle, Integer nombre) {
        this.libelle = libelle;
        this.nombre = nombre;
    }

    public Integer getNombre() {
        return nombre;
    }

    public String getLibelle() {
        return libelle;
    }
}
