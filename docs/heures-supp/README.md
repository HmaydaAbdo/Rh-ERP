# Domaine Heures supplémentaires

## Rôle

Le domaine importe et restitue, par mois et par chantier, les heures supplémentaires et les forfaits des employés.
Il s'appuie sur les domaines Employé, Paie et Chantier pour identifier les personnes, calculer leur taux et qualifier
les STC. Il ne modifie pas les données de Paie.

Les vues sont **Tabulaire**, **Cartes** et **Analytique**. Cartes et Analytique étendent le socle partagé du périmètre et leurs agrégats sont calculés côté Spring.
L'import se fait par un assistant multistep, un chantier à la fois.

## Données d'entrée et provenance

| Donnée | Source et règle |
|---|---|
| Mois | Choisi dans l'assistant. Le mois doit déjà avoir une paie importée avant de commencer l'import des heures supplémentaires. |
| Chantier | Choisi dans l'assistant ; un seul chantier par import. Résolu par le domaine Chantier. |
| CIN | Clé de rapprochement avec l'employé. Un CIN inconnu doit être résolu en créant la fiche Employé selon le parcours de correction de la Paie. |
| Nom, prénom, fonction | Le fichier les fournit et le CIN identifie la fiche. Le wizard affiche les écarts et demande un alignement explicite du nom et de la fonction, comme l'import Paie. |
| P/H | Nombre d'heures supplémentaires fourni, en heures décimales, avec au plus une décimale. |
| Ligne HS à zéro | Ignorée à l'analyse et au calcul ; son nombre apparaît dans le bilan de l'import. Une valeur HS vide reste une erreur de ligne, jamais un zéro implicite. |
| S/H | Calculé à chaque nouvel import depuis le salaire et le type de salaire courants de l'employé : salaire journalier ÷ 10 ; salaire mensuel ÷ 26 ÷ 10. La valeur calculée est conservée avec l'import. |
| Marqueur STC/sortie | Observation du bulletin de Paie de l'employé pour le même mois. Le domaine réutilise la règle Paie `ObservationStc.estStcOuSortie`. |
| Forfait | Montant en DH saisi séparément des heures supplémentaires. Il peut concerner un employé absent du fichier d'heures, mais pas un employé marqué STC/sortie ce mois-là. |

## Grandeurs métier

Les montants sont produits par Spring ; l'assistant IA ne les recalcule pas.

| Grandeur | Définition |
|---|---|
| **S/H** | Salaire horaire issu du salaire et du type de salaire de la fiche Employé au moment de l'import. Sa précision est conservée pour le calcul. |
| **P/H** | Heures supplémentaires du mois, fournies en heures décimales à une décimale au plus. |
| **Montant** | `S/H × P/H`, arrondi à deux décimales en DH. |
| **STC (DH)** | `Montant` si le bulletin du même mois est marqué exactement « STC » ou « sortie » (casse et espaces extérieurs ignorés) ; sinon `0 DH`. |
| **Forfait** | Montant en DH indépendant du **Montant** des heures supplémentaires. Interdit si le bulletin de Paie du même mois est marqué STC/sortie. |
| **Net à payer** | `Montant − STC (DH) + Forfait`. |

Une modification ultérieure du salaire ne recalcule pas un import d'heures supplémentaires déjà enregistré. Le taux S/H
retenu est un instantané de la fiche Employé au moment de chaque nouvel import.

## Assistant d'import

1. **Mois et chantier** : si aucune paie n'existe pour le mois, bloquer dès cette étape avec une explication indiquant
   d'importer d'abord la paie de ce mois.
2. **Fichier** : déposer le fichier Excel `.xlsx` au format `Nom`, `Prenom`, `CIN`, `Funct`, `HS`. Le wizard permet aussi de saisir les forfaits `CIN;montant`, y compris pour un employé absent du fichier d'heures.
3. **Analyse** : aucune écriture ; ignorer les lignes HS à zéro, signaler une ligne HS vide par son numéro, rapprocher les employés par CIN, vérifier qu'un bulletin de
   Paie existe pour chacun dans le même mois et calculer les valeurs présentées.
4. **Corrections** : reprendre le mécanisme Paie : aligner explicitement une fiche existante sur le nom et la fonction du fichier, ou créer la fiche d'un CIN inconnu avec ses dates, son salaire et son type ; la fonction vient du fichier et peut être ajoutée au référentiel. Toute ligne doit ensuite satisfaire l'exigence d'un bulletin du même mois.
5. **Forfaits** : ajouter un employé et un montant même s'il n'est pas présent dans les lignes HS ; refuser le forfait
   pour un employé marqué STC/sortie dans la paie du mois.
6. **Récapitulatif** : présenter séparément heures, Montant, STC, Forfaits et Net à payer avant confirmation.
7. **Import** : enregistrer le lot validé en une transaction et afficher un bilan final.

Un doublon pour le même employé, le même mois et le même chantier est refusé par défaut ; le remplacement possède une action et une trace d'audit distinctes. Un employé marqué STC/sortie ne peut avoir de forfait pour ce mois, tous chantiers confondus.

### Classeur reçu

Le fichier `ETAT_pointage_heure_sup.xlsx` a une feuille avec les colonnes attendues. L'analyse du classeur a relevé 864 lignes à zéro (ignorées), 120 lignes positives et une ligne sans valeur HS à la ligne Excel 986. Cette dernière doit être corrigée dans le fichier avant import ; le lecteur ne convertit pas une cellule vide en zéro.

## IA et MCP

L'assistant IA accède aux capacités publiées du domaine par MCP, derrière les façades métier Spring et les permissions
du domaine. Les outils décrivent chaque champ avec sa source, sa période, son unité et sa définition. Ils renvoient
les montants calculés par Spring ; aucun outil ne donne accès aux repositories ou à du SQL générique.

## Sujets métier encore ouverts

- Règle de mise à jour/suppression d'une paie du mois après l'import d'heures supplémentaires qui s'y réfère.
- Bornes maximales métier des heures et du forfait ; les limites de stockage et validation technique sont documentées dans le code.
- Conditions de rattachement d'un employé au chantier sélectionné et traitement des employés sortis.
