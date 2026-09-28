package staport.rh.paie.report;

import java.util.List;

/**
 * Une ligne employé du rapport, dénormalisée avec le contexte de son chantier ET de sa section
 * (équipe détaillée, ou "reste" du chantier — voir {@link EquipeBiVue}) — source de données à plat,
 * unique, de {@code rapport.jrxml} pour tout le document. Le regroupement chantier/section y est
 * porté par deux {@code <group>} JRXML imbriqués (Chantier, {@code isStartNewPage} — chaque chantier
 * démarre sur une nouvelle page ; Équipe, {@code isStartNewPage} également depuis 2026-09-29 — chaque
 * section démarre elle aussi sur sa propre page, demande explicite de direction). C'est ce qui permet
 * au {@code pageHeader}/{@code pageFooter}, définis une seule fois dans {@code rapport.jrxml}, de se
 * répéter nativement sur toutes les pages du rapport — aucun gabarit séparé, aucune duplication de
 * bande. Classe simple à getters, pas un record : champ de table lié par introspection JavaBean
 * ({@code JRBeanCollectionDataSource}).
 *
 * <p>{@code chantierAvecDetailEquipe} pilote un {@code printWhenExpression} au niveau de la BANDE de
 * {@code GroupChantier} (titre "Équipes de chantier X" + graphique de répartition, voir
 * rapport.jrxml) — pas le déclenchement du groupe lui-même (qui reste sur {@code $F{chantierCode}},
 * comme {@code GroupChantierEvolution}) : quand {@code false}, la bande entière est absente (hauteur
 * nulle, aucun espace réservé), jamais un contenu masqué élément par élément.
 */
public final class LigneRapportDetailBean {

    private final String chantierCode;
    private final String chantierIdentifiant;
    private final String chantierTitre;
    private final String chantierMasseLigne;
    private final String chantierMasseMoyenneParEmploye;
    private final String chantierEffectifValeur;
    private final int chantierStc;
    private final String chantierNarratif;
    private final List<RepartitionBean> chantierRepartitionEquipe;
    private final List<RepartitionBean> chantierEvolutionMensuelle;
    private final boolean chantierAvecDetailEquipe;
    private final String equipeNom;
    private final String equipeTitre;
    private final int equipeEffectif;
    private final String equipeMasse;
    private final String equipePartChantierPourcent;
    private final int equipeStc;
    private final String equipeMontantMoisPrecedentOuIntrouvable;
    private final List<RepartitionBean> equipeRepartitionFonction;
    private final List<MaterielLigneVue> equipeMateriel;
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
    private final String employeEquipeReelle;

    LigneRapportDetailBean(String chantierCode, String chantierIdentifiant, String chantierTitre, String chantierMasseLigne,
                            String chantierMasseMoyenneParEmploye, String chantierEffectifValeur,
                            int chantierStc, String chantierNarratif,
                            List<RepartitionBean> chantierRepartitionEquipe,
                            List<RepartitionBean> chantierEvolutionMensuelle,
                            boolean chantierAvecDetailEquipe,
                            String equipeNom, String equipeTitre, int equipeEffectif, String equipeMasse,
                            String equipePartChantierPourcent, int equipeStc,
                            String equipeMontantMoisPrecedentOuIntrouvable,
                            List<RepartitionBean> equipeRepartitionFonction,
                            List<MaterielLigneVue> equipeMateriel,
                            LigneEmployeVue employe) {
        this.chantierCode = chantierCode;
        this.chantierIdentifiant = chantierIdentifiant;
        this.chantierTitre = chantierTitre;
        this.chantierMasseLigne = chantierMasseLigne;
        this.chantierMasseMoyenneParEmploye = chantierMasseMoyenneParEmploye;
        this.chantierEffectifValeur = chantierEffectifValeur;
        this.chantierStc = chantierStc;
        this.chantierNarratif = chantierNarratif;
        this.chantierRepartitionEquipe = chantierRepartitionEquipe;
        this.chantierEvolutionMensuelle = chantierEvolutionMensuelle;
        this.chantierAvecDetailEquipe = chantierAvecDetailEquipe;
        this.equipeNom = equipeNom;
        this.equipeTitre = equipeTitre;
        this.equipeEffectif = equipeEffectif;
        this.equipeMasse = equipeMasse;
        this.equipePartChantierPourcent = equipePartChantierPourcent;
        this.equipeStc = equipeStc;
        this.equipeMontantMoisPrecedentOuIntrouvable = equipeMontantMoisPrecedentOuIntrouvable;
        this.equipeRepartitionFonction = equipeRepartitionFonction;
        this.equipeMateriel = equipeMateriel;
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
        this.employeEquipeReelle = employe.equipeReelle();
    }

    public String getChantierCode() {
        return chantierCode;
    }

    public String getChantierIdentifiant() {
        return chantierIdentifiant;
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

    public int getChantierStc() {
        return chantierStc;
    }

    public String getChantierNarratif() {
        return chantierNarratif;
    }

    public List<RepartitionBean> getChantierRepartitionEquipe() {
        return chantierRepartitionEquipe;
    }

    public List<RepartitionBean> getChantierEvolutionMensuelle() {
        return chantierEvolutionMensuelle;
    }

    public boolean getChantierAvecDetailEquipe() {
        return chantierAvecDetailEquipe;
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

    public String getEquipeMontantMoisPrecedentOuIntrouvable() {
        return equipeMontantMoisPrecedentOuIntrouvable;
    }

    public List<RepartitionBean> getEquipeRepartitionFonction() {
        return equipeRepartitionFonction;
    }

    public List<MaterielLigneVue> getEquipeMateriel() {
        return equipeMateriel;
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

    public String getEmployeEquipeReelle() {
        return employeEquipeReelle;
    }
}
