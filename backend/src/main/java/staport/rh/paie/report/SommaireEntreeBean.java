package staport.rh.paie.report;

/** Une ligne du sommaire du rapport PDF : libellé de section + numéro de page où elle démarre —
 * classe publique liée par introspection JavaBean (JRBeanCollectionDataSource), voir
 * docs/report/README.md. Le numéro de page réel n'est connu qu'après un premier remplissage
 * silencieux du document entier (voir PaieReportPdfService). */
public final class SommaireEntreeBean {

    private final String titre;
    private final int numeroPage;

    public SommaireEntreeBean(String titre, int numeroPage) {
        this.titre = titre;
        this.numeroPage = numeroPage;
    }

    public String getTitre() {
        return titre;
    }

    public int getNumeroPage() {
        return numeroPage;
    }
}
