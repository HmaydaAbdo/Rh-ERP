# Migration Paie vers Python

KAN-226 ouvre la migration du domaine Paie dans l'application FastAPI unique.

Le modèle SQLAlchemy est aligné sur `paie`. La création, la modification avec verrou optimiste,
la lecture, la recherche paginée et la suppression unitaire sont montées sous `/paie`. Le contrat
HTTP des mois est `AAAA-MM`, tandis que la table conserve `AAAAMM`. Les réponses de bulletin
contiennent les résumés `employee`, `fonction`, `chantier` et `equipe` attendus par l'interface.
La modification conserve l'employé et le mois du bulletin : ces deux champs ne figurent pas dans
son corps de requête.
La route analytique reçoit les filtres dans son corps JSON et restitue les KPI, les répartitions
par chantier, équipe et fonction, les tranches, l'évolution historique et les indicateurs de qualité.
Le calcul utilise le pas des tranches configuré dans le domaine Paramètre. Les tests vérifient
le contrat HTTP sur PostgreSQL et le passage de décembre à janvier ; la performance sur une
copie volumineuse et la comparaison exhaustive avec Spring restent à mesurer.
Les routes de la vue Cartes (`/paie/periodes/search`, `/paie/chantiers/search`,
`GET /paie/chantiers`) et le catalogue matériel de l'assistant d'export sont exposés avec
`PAIE_READ`. Les cartes conservent les employés sans équipe dans les totaux et comparent
uniquement au mois calendaire précédent.

Dans le prototype Excel, la sélection personnalisée et l'exclusion des feuilles chantier
interprètent les **libellés** d'équipes du contrat Spring. La comparaison d'une feuille équipe
est limitée au même chantier et à la même équipe sur le mois précédent ; l'exclusion de la
feuille chantier s'applique aussi au mois précédent. Les feuilles portent désormais les treize
colonnes, les deux lignes d'en-tête, la formule de sous-total, le mois précédent, le récapitulatif
par fonction et, sur les seules feuilles concernées, le tableau matériel du contrat Spring.
Deux tests de classeur couvrent les périmètres et ce placement. La comparaison visuelle des
styles, largeurs, formules recalculées dans Excel et données réelles reste à faire.

Le périmètre restant avant clôture comprend le contrat complet du wizard d'import, les exports et
le rapport PDF (503 en attente), les outils MCP et la parité exhaustive des
tests Spring documentés dans `docs/paie/skills/SKILL.md`.

Le calcul automatique n'est pas introduit : `salaire_total` reste une valeur fournie par le contrat
du bulletin, conformément au domaine existant. Les snapshots historiques et l'unicité employé ×
période restent des invariants de la table. L'import Python écrit désormais les révisions des
bulletins dans `paie_aud` et celles des affectations modifiées dans `employe_aud`. Un test sur une
base PostgreSQL migrée vérifie l'absence de création de référentiels, la mise à jour de la fiche et
du bulletin, puis les deux historiques. Le typage des deux dates de l'historique Employé a été
aligné sur les colonnes PostgreSQL `DATE` après découverte d'un échec transactionnel.

Règle métier validée pour l'import : la création d'un bulletin est distincte de la mise à jour de la
fiche Employé. Un salaire identique à celui de la fiche (dernier salaire connu) passe automatiquement;
un salaire différent passe par le wizard, avec type proposé (`≤ 500` journalier, `> 500` mensuel).
Un bulletin existant n'est jamais écrasé sans confirmation auditée; les départs, STC et suppressions
d'affectation ne sont pas déduits automatiquement.
L'option « Ignorer et conserver 0 » ne confirme que l'avertissement de salaire nul ; un salaire
différent de la fiche employé reste à traiter dans le wizard avant la création des bulletins.
Si le fichier porte `0` et que la fiche porte un autre salaire, seul `SALAIRE_DIFFERENT` est rendu
(décision du propriétaire du 2026-11-07), avec l'ancien salaire dans `salaireActuel` et dans la raison ;
`SALAIRE_ZERO` reste réservé aux fiches dont le salaire est déjà nul. Une équipe vide dans le fichier pour
un employé actif qui en a une produit `EQUIPE_VIDE` : l'utilisateur choisit `CONSERVER` ou `VIDER` par
employé (champ multipart `equipes`, JSON `{"decisions":[{employeId,action}]}`), sans décision l'import est refusé.
`SALAIRE_DIFFERENT` propose le type `JOURNALIER`
jusqu'à 500 inclus et `MENSUEL` au-dessus ; l'action « Ignorer 0 » ne l'efface pas.
Comme le lecteur Spring, l'analyse et l'import Python ignorent les lignes Excel entièrement vides
après les trois lignes d'en-tête et conservent le numéro d'origine de chaque ligne utile.
L'analyse signale avant import un bulletin déjà présent pour l'employé et le mois, ainsi qu'un CIN
en doublon dans le fichier ou un champ obligatoire absent. Elle nomme aussi le champ et la valeur
si les jours dépassent `999,99`, ont plus de deux décimales ou sont invalides ; les longueurs du nom,
du CIN et de l'observation sont contrôlées. Lors de la création, le nom, la fonction,
le chantier et l'équipe renseignée mettent à jour la fiche Employé dans la même transaction que les
nouveaux bulletins. Une équipe vide sur la ligne reste vide sur le bulletin mais ne supprime pas
l'affectation de la fiche Employé.
Fonction, Chantier et Équipe sont des référentiels préexistants : l'analyse signale toute référence
introuvable et bloque l'import. La Paie n'en crée aucune.
Un chantier présent mais clôturé est signalé séparément et doit être rouvert avant l'import.
S'il existe déjà de la paie, seul le mois civil suivant le dernier mois importé est accepté ;
le refus indique le mois attendu.

Le wizard FastAPI en cours de migration envoie `file` et `periode` en `multipart/form-data` pour
l'analyse et l'import final. La correction envoie en plus le texte JSON `corrections` avec les
alignements et créations proposés; le serveur relit le classeur et vérifie les employés et lignes
avant d'écrire, puis renvoie une analyse recalculée. Les permissions de correction sont
`PAIE_IMPORT`, `PAIE_READ` et `EMPLOYEE_WRITE`. L'analyse propose désormais les départs (STC ou « sortie » dans la colonne Observation, motif prérempli ;
actifs absents du fichier, motif à saisir) et les retours (inactifs présents). L'import reçoit les départs
confirmés dans le champ multipart `departs` (JSON `{"departs":[{employeId,motif}]}`), refuse (400) un départ
non proposé, un motif vide, un départ déjà enregistré ce mois ou un retour sans type de salaire, et annule
alors toute l'importation (une transaction). La création et la modification d'un bulletin exigent
`PAIE_WRITE` et `EMPLOYEE_WRITE` (la fiche Employé change de chantier et d'équipe), comme Spring. La
suppression de groupe (`POST /paie/suppression`, `PAIE_PURGE`) et sa restauration depuis l'audit
(`POST /paie/restauration/{id}`, `PAIE_RESTORE`) sont portées, atomiques et éprouvées sur PostgreSQL.

Pour l'export, la parité Spring est le comportement par défaut. Le regroupement demandé est un
choix distinct de la sélection des équipes à détailler. Le contrat Python prévoit
`regroupementsEquipesParChantier`, avec des groupes de libellés par chantier. Son calcul réunit les
lignes des équipes choisies une seule fois, tandis que la sélection classique garde des sections
séparées. L'étape facultative de l'assistant et l'agrégation de tous les indicateurs du PDF restent
à livrer avant l'activation ; cette option n'est pas encore disponible à l'utilisateur.

Un prototype PDF FastAPI utilise WeasyPrint 70.0, Pillow 13.0.0 et Matplotlib 3.11.2 avec les ressources visuelles Spring embarquées
(CSS, logo et polices). Matplotlib fournit le rendu SVG statique ; son interface `Figure.savefig` écrit le graphique dans un flux mémoire
([backends](https://matplotlib.org/stable/users/explain/figure/backends.html), [Figure.savefig](https://matplotlib.org/stable/api/_as_gen/matplotlib.figure.Figure.savefig.html)).
La couverture, les bandeaux et le tableau de détail reprennent la structure
HTML Spring ; un essai Linux sur trois bulletins a produit trois pages. Après pagination, un essai
Linux sur 65 bulletins a produit cinq pages physiques (couverture et quatre pages de contenu),
avec 65 lignes présentes dans le modèle HTML.
Le détail emploie les mêmes séparateurs français que Spring (espace insécable pour les milliers,
virgule décimale, tiret pour les valeurs numériques absentes).
Le prototype contient les cinq KPI globaux (masse, bulletins, chantiers, nombre et montant des STC), leurs comparaisons au mois précédent,
La vue d'ensemble présente les cinq KPI globaux et les deux courbes d'évolution sur les périodes réellement disponibles des douze derniers mois. La répartition par chantier vient ensuite. Chaque chantier est numéroté en chiffres romains : après la vue globale, le premier chantier est II ; sans vue globale, il est I. Chaque chantier et équipe sélectionnée présente ses KPI et son évolution historique.
Le chantier sans équipe choisie présente sa répartition par fonction ; avec une sélection, il présente la répartition de toutes ses équipes. Chaque équipe choisie a sa propre répartition par fonction, poursuivie sur plusieurs pages au-delà de quinze fonctions.
Les sections fusionnées ont un tableau récapitulatif par fonction (bulletins, STC et montant STC). Une équipe choisie du catalogue C168 affiche son graphique matériel lorsque le wizard fournit au moins une quantité positive.
Une seule requête historique groupe les bulletins par chantier, équipe et mois en base, conserve les filtres du rapport et fournit les courbes globales et par chantier par totalisation. Il a une page de périmètre quand un filtre est actif et omet sa synthèse globale quand
`sansVueEnsemble` est vrai. La recherche de nom et de CIN traite `%` et `_` littéralement.
La mesure des lignes s'appuie sur les polices embarquées et les hauteurs du gabarit Spring ; le
prototype découpe les tableaux longs en pages physiques sans perdre de ligne dans le modèle HTML.
`POST /paie/report/pdf`
répond temporairement `503` : le découpage n'a pas encore de preuve visuelle de parité,
et les graphiques, comparaisons et sections complètes du rapport Spring restent à porter. La route ne sera
ouverte qu'après portage complet et comparaison sur un même jeu de données.

Les montants nuls sont acceptés. Un `salaireMensuel` nul n'est toutefois jamais silencieux :
l'assistant bloque la poursuite et exige l'action explicite « Ignorer et conserver 0 ». Une erreur de montant doit toujours nommer la ligne Excel, le
champ exact (`salaireMensuel`, `primeRoulageOrdinaire`, `primeRoulageDimanche` ou `salaireTotal`),
la valeur reçue et la contrainte violée; le message global « salaires et primes » est interdit.

Le modèle Excel attendu conserve l'ordre Spring (trois lignes d'en-tête) : `Nom & prénom`, `Fonction`,
`CIN`, `Nbre Jrs`, `J.R.O`, `J.R.D`, `Salaire`, `Prime RO`, `Prime RD`, `Total`, `Observation`,
`Chantier`, `Équipe`.
`GET /paie/import/modele` fournit désormais le classeur vierge `.xlsx` avec cet ordre et aucune
ligne d'exemple, sous `PAIE_IMPORT`.
Le nom de feuille, les dimensions et toutes les cellules du modèle produit ont été comparés au
fichier `Modele_Import_Paie.xlsx` fourni par le propriétaire : ils sont identiques. Cette comparaison
ne porte pas sur les styles ni les propriétés internes du classeur.

Le gabarit du rapport embarque désormais Liberation Serif (`@font-face` dans `rapport.css`) et passe par `common/pdf.py`
(rendu hors de la boucle d'événements). Rendu réel vérifié dans l'image Linux le 2026-11-07 (page de garde, tableau paginé),
mais la route reste en `503` : les sections complètes du rapport Spring et la comparaison côte à côte restent à faire.

## Parcours, effectifs et statuts HTTP (parité Spring, KAN-226)

`GET /paie/employes/{id}/parcours` renvoie, pour chaque mois, `fonction` (libellé), `chantier` (code) et `equipe` (code, `null`
sans équipe), comme `ParcoursEmployeDto.MoisDto`. Les événements du plus récent au plus ancien (à mois égal : `RETOUR`,
`DEPART`, `CHANGEMENT_SALAIRE`, `CHANGEMENT_EQUIPE`, `CHANGEMENT_FONCTION`, `CHANGEMENT_CHANTIER`, `ENTREE`) sont : `ENTREE`
(`apres` = « code chantier · libellé fonction »), les changements entre deux bulletins consécutifs (codes et libellés, salaire
en décimal brut), `RETOUR` quand un départ tombe entre deux bulletins et `DEPART` (avec `motif`) pour chaque ligne de
`employe_sortie`. Un employé inconnu répond `404`. Le calcul est dans `paie/historique.py`.

`POST /paie/effectifs` calcule `entrees`, `sorties`, `mutations` et `plusPayes` comme `PaieEffectifsService`, face au mois civil
précédent (`mois_precedent`, qui enjambe janvier). Le premier mois du périmètre n'a ni `entrees` ni `mutations`.

Statuts : bulletin introuvable `404`, doublon employé/mois `409` (message avec le mois `AAAA-MM`), suppression bloquée par une
contrainte `409`. Preuve : `api/tests/test_paie_parcours_contrat.py`.
