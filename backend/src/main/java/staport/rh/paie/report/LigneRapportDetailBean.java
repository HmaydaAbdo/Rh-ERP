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
 *
 * <p><b>Chantiers "compacts" (effectif ≤ {@code PaieBiReportBuilder.SEUIL_CHANTIER_COMPACT}) — pas de
 * page dédiée</b> (voir {@link ChantierBiVue#compact()}) : {@code chantierCompact} pilote, via
 * {@code printWhenExpression} dans {@code rapport.jrxml}, l'affichage d'un contenu différent pour ces
 * chantiers. Deux champs supplémentaires contrôlent directement le déclenchement des {@code <group>}
 * "lourds" (une page dédiée chacun) :
 * <ul>
 *   <li>{@code chantierEvolutionCle} — expression de {@code GroupChantierEvolution} (page "Vue
 *       d'ensemble du chantier" : KPI + narratif ; le graphique d'évolution qu'elle portait a depuis
 *       été retiré de tout le document, voir {@code docs/report/rapport-v2.md} — le nom du groupe n'a
 *       pas été changé pour autant, page toujours utile pour les KPI) : le vrai code chantier pour un
 *       chantier détaillé (le groupe se déclenche normalement, une fois par chantier détaillé) ; pour
 *       un chantier compact, la valeur est GELÉE à celle du dernier chantier détaillé rencontré (ou ""
 *       s'il n'y en a aucun) — l'expression ne change alors JAMAIS d'une ligne compacte à l'autre, donc
 *       ce groupe ne se déclenche plus du tout pour eux (page supprimée entièrement, demande explicite
 *       de direction : inutile de détailler les KPI d'un chantier à 1-2 personnes).</li>
 *   <li>{@code chantierEquipesCle} — expression de {@code GroupChantier} (page "Équipes de chantier" +
 *       graphique de répartition) : le vrai code chantier pour un chantier détaillé (inchangé) ; pour
 *       TOUS les chantiers compacts, la MÊME constante ("__CHANTIERS_COMPACTS__") — le groupe se
 *       déclenche donc exactement UNE fois, à l'entrée dans le bloc compact, jamais une fois par
 *       chantier compact : cette unique occurrence affiche (voir {@code chantierChapitreTitreCompacts})
 *       le chapitre final "Chantiers à effectif réduit" avec un seul graphique consolidé (voir
 *       {@code RapportBiVue.repartitionChantiersCompacts}), au lieu d'un graphique par chantier.</li>
 * </ul>
 * Le tableau employé d'un chantier compact réutilise directement le groupe {@code GroupEquipe}
 * existant (pas de nouveau groupe JRXML) : pour ces lignes, {@code equipeNom}/{@code equipeTitre}/
 * {@code equipeEffectif}/{@code equipeMasse}/{@code equipePartChantierPourcent}/{@code equipeStc}
 * portent les valeurs du CHANTIER (pas d'une vraie équipe — demande explicite de direction : dans un
 * chantier à 1-2 personnes, juste "chantier + employé", jamais de sous-distinction équipe) ; comme
 * {@code equipeNom} vaut alors le code chantier (unique), {@code GroupEquipe} se déclenche exactement
 * une fois par chantier compact, avec {@code isStartNewPage="false"} — plusieurs petits chantiers
 * s'enchaînent donc sur la même page, sans le saut de page qui posait problème.
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
    private final List<RepartitionBean> chantierRepartitionEquipe;
    private final List<RepartitionBean> chantierEvolutionMensuelle;
    private final boolean chantierCompact;
    private final String chantierEvolutionCle;
    private final String chantierEquipesCle;
    private final String chantierChapitreTitreCompacts;
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
                            List<RepartitionBean> chantierRepartitionEquipe,
                            List<RepartitionBean> chantierEvolutionMensuelle,
                            boolean chantierCompact, String chantierEvolutionCle, String chantierEquipesCle,
                            String chantierChapitreTitreCompacts,
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
        this.chantierRepartitionEquipe = chantierRepartitionEquipe;
        this.chantierEvolutionMensuelle = chantierEvolutionMensuelle;
        this.chantierCompact = chantierCompact;
        this.chantierEvolutionCle = chantierEvolutionCle;
        this.chantierEquipesCle = chantierEquipesCle;
        this.chantierChapitreTitreCompacts = chantierChapitreTitreCompacts;
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

    public List<RepartitionBean> getChantierRepartitionEquipe() {
        return chantierRepartitionEquipe;
    }

    public List<RepartitionBean> getChantierEvolutionMensuelle() {
        return chantierEvolutionMensuelle;
    }

    public boolean getChantierCompact() {
        return chantierCompact;
    }

    public String getChantierEvolutionCle() {
        return chantierEvolutionCle;
    }

    public String getChantierEquipesCle() {
        return chantierEquipesCle;
    }

    public String getChantierChapitreTitreCompacts() {
        return chantierChapitreTitreCompacts;
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
