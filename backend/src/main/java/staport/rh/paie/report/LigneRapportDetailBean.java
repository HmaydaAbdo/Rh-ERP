package staport.rh.paie.report;

import java.util.List;

/**
 * Une ligne employé du rapport, dénormalisée avec le contexte de son chantier ET de son équipe —
 * source de données à plat, unique, de {@code rapport.jrxml} pour tout le document. Le regroupement
 * chantier/équipe y est porté par deux {@code <group>} JRXML imbriqués (Chantier, {@code
 * isStartNewPage} — chaque chantier démarre sur une nouvelle page ; Équipe, {@code keepTogether} —
 * ne coupe une équipe entre deux pages que si elle est, à elle seule, plus grande qu'une page, voir
 * {@code docs/report/README.md}). C'est ce qui permet au {@code pageHeader}/{@code pageFooter},
 * définis une seule fois dans {@code rapport.jrxml}, de se répéter nativement sur toutes les pages
 * du rapport — aucun gabarit séparé, aucune duplication de bande. Classe simple à getters, pas un
 * record : champ de table lié par introspection JavaBean ({@code JRBeanCollectionDataSource}).
 */
public final class LigneRapportDetailBean {

    private final String chantierCode;
    private final String chantierTitre;
    private final String chantierMasseLigne;
    private final String chantierMasseMoyenneParEmploye;
    private final String chantierEffectifValeur;
    private final String chantierEffectifNote;
    private final String chantierPartMasseGlobale;
    private final int chantierStc;
    private final String chantierNarratif;
    private final List<DistributionVue> chantierDistributionEquipe;
    private final List<RepartitionBean> chantierRepartitionEquipe;
    private final List<RepartitionBean> chantierEvolutionMensuelle;
    private final String equipeNom;
    private final String equipeTitre;
    private final int equipeEffectif;
    private final String equipeMasse;
    private final String equipePartChantierPourcent;
    private final int equipeStc;
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

    LigneRapportDetailBean(String chantierCode, String chantierTitre, String chantierMasseLigne,
                            String chantierMasseMoyenneParEmploye, String chantierEffectifValeur, String chantierEffectifNote,
                            String chantierPartMasseGlobale, int chantierStc, String chantierNarratif,
                            List<DistributionVue> chantierDistributionEquipe,
                            List<RepartitionBean> chantierRepartitionEquipe,
                            List<RepartitionBean> chantierEvolutionMensuelle,
                            String equipeNom, String equipeTitre, int equipeEffectif, String equipeMasse,
                            String equipePartChantierPourcent, int equipeStc,
                            LigneEmployeVue employe) {
        this.chantierCode = chantierCode;
        this.chantierTitre = chantierTitre;
        this.chantierMasseLigne = chantierMasseLigne;
        this.chantierMasseMoyenneParEmploye = chantierMasseMoyenneParEmploye;
        this.chantierEffectifValeur = chantierEffectifValeur;
        this.chantierEffectifNote = chantierEffectifNote;
        this.chantierPartMasseGlobale = chantierPartMasseGlobale;
        this.chantierStc = chantierStc;
        this.chantierNarratif = chantierNarratif;
        this.chantierDistributionEquipe = chantierDistributionEquipe;
        this.chantierRepartitionEquipe = chantierRepartitionEquipe;
        this.chantierEvolutionMensuelle = chantierEvolutionMensuelle;
        this.equipeNom = equipeNom;
        this.equipeTitre = equipeTitre;
        this.equipeEffectif = equipeEffectif;
        this.equipeMasse = equipeMasse;
        this.equipePartChantierPourcent = equipePartChantierPourcent;
        this.equipeStc = equipeStc;
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

    public String getChantierCode() {
        return chantierCode;
    }

    public String getChantierTitre() {
        return chantierTitre;
    }

    public String getChantierMasseLigne() {
        return chantierMasseLigne;
    }

    public String getChantierMasseMoyenneParEmploye() {
        return chantierMasseMoyenneParEmploye;
    }

    public String getChantierEffectifValeur() {
        return chantierEffectifValeur;
    }

    public String getChantierEffectifNote() {
        return chantierEffectifNote;
    }

    public String getChantierPartMasseGlobale() {
        return chantierPartMasseGlobale;
    }

    public int getChantierStc() {
        return chantierStc;
    }

    public String getChantierNarratif() {
        return chantierNarratif;
    }

    public List<DistributionVue> getChantierDistributionEquipe() {
        return chantierDistributionEquipe;
    }

    public List<RepartitionBean> getChantierRepartitionEquipe() {
        return chantierRepartitionEquipe;
    }

    public List<RepartitionBean> getChantierEvolutionMensuelle() {
        return chantierEvolutionMensuelle;
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

    public int getEquipeStc() {
        return equipeStc;
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
