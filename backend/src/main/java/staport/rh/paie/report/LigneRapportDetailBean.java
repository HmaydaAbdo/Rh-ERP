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
 *
 * <p>{@code equipeLibelleAffiche} : nom complet de l'équipe pour AFFICHAGE (bandeau CHANTIER/ÉQUIPE du
 * pageHeader/pageFooter) — {@code equipeNom} reste le code brut, réservé aux mécanismes internes
 * (ancre de page, comparaison avec {@code chantierCode}), voir le Javadoc de {@code EquipeBiVue}.
 *
 * <p>{@code sautPageAvant} : {@code true} sur EXACTEMENT la ligne (s'il y en a une) où
 * {@code PaieReportPdfService.calculerSautPage} a déterminé qu'un saut de page anticipé est
 * nécessaire pour que le groupFooter de GroupEquipe (TOTAL GENERAL + récaps) ne se retrouve jamais
 * seul en haut d'une page sans aucun employé au-dessus (demande explicite de direction, 2026-09-29) —
 * pilote un {@code <break type="Page">} au tout début de la bande {@code <detail>} de
 * {@code rapport.jrxml}. Calcul arithmétique exact (hauteur de page/marges/bandeaux/ligne tous
 * constants, voir le Javadoc de la méthode), PAS une heuristique JasperReports ni un groupe JRXML
 * supplémentaire : un premier essai avec un groupe imbriqué gardant les 4 dernières lignes ensemble
 * s'est révélé insuffisant sur données réelles (4 lignes ne suffisent pas à garantir que le footer,
 * jusqu'à 220px, tienne derrière elles) et semble avoir provoqué des pages totalement blanches à
 * certaines frontières de section.
 */
public final class LigneRapportDetailBean {

    private final String chantierCode;
    private final String chantierIdentifiant;
    private final String chantierTitre;
    private final String chantierMasseLigne;
    private final String chantierMasseMoyenneParEmploye;
    private final String chantierEffectifValeur;
    private final int chantierStc;
    private final List<RepartitionBean> chantierRepartitionEquipe;
    private final List<RepartitionBean> chantierEvolutionMensuelle;
    private final boolean chantierAvecDetailEquipe;
    private final String equipeNom;
    private final String equipeLibelleAffiche;
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
    private final boolean sautPageAvant;

    LigneRapportDetailBean(String chantierCode, String chantierIdentifiant, String chantierTitre, String chantierMasseLigne,
                            String chantierMasseMoyenneParEmploye, String chantierEffectifValeur,
                            int chantierStc,
                            List<RepartitionBean> chantierRepartitionEquipe,
                            List<RepartitionBean> chantierEvolutionMensuelle,
                            boolean chantierAvecDetailEquipe,
                            String equipeNom, String equipeLibelleAffiche, String equipeTitre, int equipeEffectif, String equipeMasse,
                            String equipePartChantierPourcent, int equipeStc,
                            String equipeMontantMoisPrecedentOuIntrouvable,
                            List<RepartitionBean> equipeRepartitionFonction,
                            List<MaterielLigneVue> equipeMateriel,
                            LigneEmployeVue employe,
                            boolean sautPageAvant) {
        this.chantierCode = chantierCode;
        this.chantierIdentifiant = chantierIdentifiant;
        this.chantierTitre = chantierTitre;
        this.chantierMasseLigne = chantierMasseLigne;
        this.chantierMasseMoyenneParEmploye = chantierMasseMoyenneParEmploye;
        this.chantierEffectifValeur = chantierEffectifValeur;
        this.chantierStc = chantierStc;
        this.chantierRepartitionEquipe = chantierRepartitionEquipe;
        this.chantierEvolutionMensuelle = chantierEvolutionMensuelle;
        this.chantierAvecDetailEquipe = chantierAvecDetailEquipe;
        this.equipeNom = equipeNom;
        this.equipeLibelleAffiche = equipeLibelleAffiche;
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
        this.sautPageAvant = sautPageAvant;
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

    public String getEquipeLibelleAffiche() {
        return equipeLibelleAffiche;
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

    public boolean getSautPageAvant() {
        return sautPageAvant;
    }
}
