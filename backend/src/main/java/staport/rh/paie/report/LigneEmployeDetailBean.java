package staport.rh.paie.report;

/**
 * Une ligne employé du détail chantier, dénormalisée avec le contexte de son équipe (nom, titre,
 * KPI) — source de données à plat de {@code chantierSection.jrxml} : le regroupement par équipe y
 * est porté par un {@code <group>} JRXML sur {@code equipeNom} (bande d'en-tête = KPI équipe,
 * {@code keepTogether} pour ne couper une équipe entre deux pages que si elle est, à elle seule,
 * plus grande qu'une page — voir {@code docs/report/README.md}), jamais par un sous-rapport par
 * équipe (qui forcerait un saut de page à chaque équipe). Classe simple à getters, pas un record :
 * champ de table lié par introspection JavaBean ({@code JRBeanCollectionDataSource}).
 */
public final class LigneEmployeDetailBean {

    private final String equipeNom;
    private final String equipeTitre;
    private final int equipeEffectif;
    private final String equipeMasse;
    private final String equipePartChantierPourcent;
    private final String nomPrenom;
    private final String fonction;
    private final String cin;
    private final int joursTravailles;
    private final String joursRecuperationOuvrable;
    private final String joursRecuperationDimanche;
    private final String salaireMensuel;
    private final String primeRoulageOrdinaire;
    private final String primeRoulageDimanche;
    private final String salaireTotal;
    private final String observation;

    LigneEmployeDetailBean(String equipeNom, String equipeTitre, int equipeEffectif, String equipeMasse,
                            String equipePartChantierPourcent, LigneEmployeVue employe) {
        this.equipeNom = equipeNom;
        this.equipeTitre = equipeTitre;
        this.equipeEffectif = equipeEffectif;
        this.equipeMasse = equipeMasse;
        this.equipePartChantierPourcent = equipePartChantierPourcent;
        this.nomPrenom = employe.nomPrenom();
        this.fonction = employe.fonction();
        this.cin = employe.cin();
        this.joursTravailles = employe.joursTravailles();
        this.joursRecuperationOuvrable = employe.joursRecuperationOuvrable();
        this.joursRecuperationDimanche = employe.joursRecuperationDimanche();
        this.salaireMensuel = employe.salaireMensuel();
        this.primeRoulageOrdinaire = employe.primeRoulageOrdinaire();
        this.primeRoulageDimanche = employe.primeRoulageDimanche();
        this.salaireTotal = employe.salaireTotal();
        this.observation = employe.observation();
    }

    public String getEquipeNom() {
        return equipeNom;
    }

    public String getEquipeTitre() {
        return equipeTitre;
    }

    public int getEquipeEffectif() {
        return equipeEffectif;
    }

    public String getEquipeMasse() {
        return equipeMasse;
    }

    public String getEquipePartChantierPourcent() {
        return equipePartChantierPourcent;
    }

    public String getNomPrenom() {
        return nomPrenom;
    }

    public String getFonction() {
        return fonction;
    }

    public String getCin() {
        return cin;
    }

    public int getJoursTravailles() {
        return joursTravailles;
    }

    public String getJoursRecuperationOuvrable() {
        return joursRecuperationOuvrable;
    }

    public String getJoursRecuperationDimanche() {
        return joursRecuperationDimanche;
    }

    public String getSalaireMensuel() {
        return salaireMensuel;
    }

    public String getPrimeRoulageOrdinaire() {
        return primeRoulageOrdinaire;
    }

    public String getPrimeRoulageDimanche() {
        return primeRoulageDimanche;
    }

    public String getSalaireTotal() {
        return salaireTotal;
    }

    public String getObservation() {
        return observation;
    }
}
