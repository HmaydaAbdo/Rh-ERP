package staport.rh.paie.report;

/** Une ligne du sommaire du rapport PDF : libellé de section + numéro de page où elle démarre —
 * classe publique liée par introspection JavaBean (JRBeanCollectionDataSource), voir
 * docs/report/README.md. Le numéro de page réel n'est connu qu'après un premier remplissage
 * silencieux du document entier (voir PaieReportPdfService).
 *
 * <p>{@code sousNiveau} : {@code true} pour une sous-section indentée sous le chapitre qui la précède
 * dans la liste (ex. « 1. Masse salariale par chantier » sous « II — Répartition par chantier ») —
 * jamais numérotée en chiffre romain, sa numérotation arabe (1., 2., ...) est déjà portée par le
 * libellé lui-même (voir {@code PaieReportPdfService}). */
public final class SommaireEntreeBean {

    private final String titre;
    private final int numeroPage;
    private final boolean sousNiveau;

    public SommaireEntreeBean(String titre, int numeroPage) {
        this(titre, numeroPage, false);
    }

    public SommaireEntreeBean(String titre, int numeroPage, boolean sousNiveau) {
        this.titre = titre;
        this.numeroPage = numeroPage;
        this.sousNiveau = sousNiveau;
    }

    public String getTitre() {
        return titre;
    }

    public int getNumeroPage() {
        return numeroPage;
    }

    public boolean isSousNiveau() {
        return sousNiveau;
    }
}
