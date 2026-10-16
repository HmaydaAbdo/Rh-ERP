# Rapport PDF BI (Paie) — v2 : journal des simplifications

> **Mise à jour 2026-10-16 :** les retraits d'évolution décrits ci-dessous sont conservés comme historique. La décision actuelle est de présenter, aux niveaux global, chantier et équipe sélectionnée, l'évolution masse/effectif, puis l'évolution STC personnes/DH, avant la répartition. La rubrique équipe 3 est un graphique par fonction avec les valeurs à droite. La rubrique 4 est un graphique du parc matériel si au moins une quantité du wizard est positive ; la liste des employés est alors la rubrique 5. Si le graphique matériel est omis, la liste reste en rubrique 4. Les champs matériels du wizard sont vides à chaque nouvel export et ne reprennent aucune saisie précédente. Voir `docs/report/README.md` et la section 6 ci-dessous.

> Ce fichier n'est PAS une documentation d'architecture (voir `docs/report/README.md` pour l'état
> actuel réel du rapport). C'est un **journal de décisions** : ce qui a été retiré du rapport BI au
> fil des itérations, pourquoi, et — pour ce qui reste calculé sans être affiché — comment le
> réintroduire sans tout redévelopper si le blocage qui a motivé le retrait est un jour levé.
> Référencé depuis `TODO.md` (dernière section) : à consulter avant de rouvrir l'une de ces
> fonctionnalités.
>
> **À lire avec cette précaution** : ce journal a été écrit à l'époque de JasperReports. Depuis le
> 2026-09-29, le rapport est produit par un pipeline HTML (`PageModel` → `PaieReportHtmlBuilder` →
> openhtmltopdf) et les graphiques sont des SVG (`RapportChartSvgBuilder`). Les noms `rapport.jrxml`,
> `<lineChart>`, `<barChart>`, `P_*` ou `GroupSynthese` qui apparaissent ci-dessous désignent l'**ancien**
> gabarit : la décision de retrait et ses raisons restent valables, mais pour réintroduire une rubrique il faut
> aujourd'hui ajouter un bloc au `PageModel` (`RapportPageModelBuilder`) et son rendu HTML — voir
> `docs/report/README.md`, « Points d'extension ». Les données restées calculées côté Java (évolution mensuelle,
> répartition par fonction) existent toujours dans les vues-modèles.

---

## 1. Graphiques d'évolution mensuelle (masse/effectif) — retirés entièrement (2026-09-28)

**Ce qui a été retiré** : le `<lineChart>` d'évolution mensuelle (masse, effectif — 2 séries,
fenêtre glissante d'au plus 12 mois), aux 2 niveaux où il existait (chapitre "I — Vue d'ensemble" et
chaque chantier détaillé, sous-section "Vue d'ensemble du chantier X"). Le customizer dédié
(`PaieReportEvolutionChartCustomizer.java`) a été supprimé — plus aucun `<lineChart>` dans
`rapport.jrxml`.

**Pourquoi** : manque d'historique. Le système ne dispose pas encore d'assez de mois de données pour
qu'une tendance mensuelle soit réellement significative — un graphique sur 2-3 points réels (le
reste à zéro par construction de la fenêtre glissante, voir plus bas) donne une fausse impression de
tendance, ou au mieux n'apporte rien de plus que le KPI "Masse (+ comparaison mois précédent)" déjà
affiché juste au-dessus.

**Ce qui reste** (volontairement, pas un oubli) :

- La **donnée** est toujours calculée côté Java : `PaieRepository.sommerParChantierEquipePeriode` /
  `PaieRepository.premierePeriode()` (fenêtre glissante), `PaieBiReportBuilder.evolutionParNiveau`,
  `ChantierBiVue.evolutionMensuelle` / `SyntheseGlobaleVue.evolutionMensuelle`,
  `LigneRapportDetailBean.chantierEvolutionMensuelle`, le paramètre JRXML
  `P_EVOLUTION_MENSUELLE` — tous **présents mais non consommés** par le gabarit. Même principe que
  la répartition par fonction (voir section 3 ci-dessous) : si suffisamment de mois de données
  s'accumulent et que le besoin réel se confirme, réintroduire le graphique ne demande que de
  rajouter les éléments `<lineChart>` dans `rapport.jrxml` (voir l'historique Git avant ce commit
  pour l'implémentation complète, y compris `PaieReportEvolutionChartCustomizer`) — aucun calcul à
  refaire.
- Les groupes JRXML qui portaient ces graphiques (`GroupSynthese`, `GroupChantierEvolution`)
  restent : ils affichent maintenant uniquement les cartes KPI + le narratif de chaque niveau (sans
  renommer le groupe `GroupChantierEvolution`, qui garde son nom malgré le retrait — voir le Javadoc
  de `LigneRapportDetailBean`).
- Le mécanisme de gel de clé (`chantierEvolutionCle`, voir `docs/report/README.md` — « Chantiers à
  effectif réduit ») reste nécessaire tel quel : il empêche toujours la page "Vue d'ensemble du
  chantier X" de s'afficher pour un chantier compact, indépendamment du fait qu'elle contienne un
  graphique ou non.

**Effet de bord constaté puis corrigé (2026-09-28)** : les pages "I — Vue d'ensemble" et "Vue
d'ensemble du chantier X" ne contenant plus que les cartes KPI + le narratif, elles se terminaient
avec une zone blanche importante avant la page de graphique qui suivait. Corrigé le jour même en
fusionnant chaque page KPI avec la page de graphique qui la suit (`isStartNewPage="false"` sur
`GroupGraphChantier`/`GroupChantier`, hauteur des `<barChart>` concernés réduite pour tenir sur
l'espace restant, vérifié visuellement au cas le plus dense) — voir `docs/report/README.md`,
« Fusion des pages KPI + graphique », pour le détail complet du calcul de budget et le résultat.

---

## 2. STC retiré des graphiques d'évolution (2026-09-27, avant le retrait complet ci-dessus)

**Ce qui a été retiré** : les 2 séries "STC (personnes)" et "STC (DH)" des `<lineChart>` d'évolution
mensuelle (qui portaient alors 4 séries : masse, effectif, STC personnes, STC DH) — ne restaient que
masse et effectif. *(Rendu sans objet par le retrait complet du graphique, section 1 ci-dessus — cette
entrée reste ici pour l'historique de la décision.)*

**Pourquoi** : incertitude sur la pertinence de suivre le STC dans le temps sous forme de courbe —
le STC/les sorties sont par nature des événements ponctuels (un départ un mois donné), pas une
grandeur qui "évolue" au sens d'une tendance lissée comme la masse ou l'effectif ; le suivre en
historique mensuel n'apportait pas de lecture claire, contrairement à sa présence en indicateur
numérique (carte KPI) et en barre comparative (`<barChart>`, où il reste visible — voir
`docs/report/README.md`, « Visualisations »).

**Ce qui reste** : le STC (personnes et DH) reste pleinement visible ailleurs — carte KPI "STC /
SORTIES" à chaque niveau (Global, Chantier, Équipe/chantier compact), et 3ᵉ/4ᵉ série de **tous** les
`<barChart>` du document. Rien n'a été perdu, seulement retiré d'UN type de visualisation jugé peu
pertinent pour cette donnée.

---

## 3. Répartition par fonction — retirée à tous les niveaux (Global, intra-chantier, intra-équipe)

**Ce qui a été retiré** : le chapitre global "Répartition par fonction" (chapitre romain dédié), la
déclinaison intra-chantier (un `<barChart>` + éventuellement un tableau par fonction, au niveau d'un
chantier) et la déclinaison intra-équipe (même chose, au niveau d'une équipe) — les 3 ont existé à un
moment ou un autre de l'évolution du rapport, les 3 ont été retirées.

**Pourquoi** : le référentiel `Function` contient des doublons non nettoyés (des libellés quasi
identiques représentant en réalité la même fonction) — constaté par la direction le 2026-09-26 sur
le rapport PDF, où le graphique global était illisible (trop de barres quasi identiques). Un
graphique par fonction serait trompeur tant que ce nettoyage de données n'est pas fait.

**Ce qui reste** :

- `SyntheseGlobaleVue.repartitionFonction` / le paramètre JRXML `P_REPARTITION_FONCTION` restent
  calculés côté Java (`PaieBiReportBuilder`), non consommés par `rapport.jrxml` — même logique que
  l'évolution mensuelle (section 1) : prêt à être réaffiché une fois le référentiel nettoyé, sans
  recalcul.
- La Fonction reste utilisée pour autre chose que l'affichage : elle sert à **trier** le tableau
  employé de chaque équipe (la fonction qui consomme le plus de masse en premier — voir
  `PaieBiReportBuilder.equipeVue`), un usage qui ne dépend pas de la propreté du référentiel.
- Tâche de nettoyage suivie dans `TODO.md` (« Nettoyer les doublons du référentiel Fonction ») —
  c'est la seule des 3 sections de ce fichier dont la réintroduction dépend d'une action externe
  (nettoyage des données), pas d'un simple choix de re-développement.

---

## 4. Sommaire imprimé — retiré

**Ce qui a été retiré** : la page de sommaire (table des matières) en tout début de document, son
sous-rapport dédié (`sommaire.jrxml`) et sa vue-modèle (`SommaireEntreeBean`).

**Pourquoi** : un rapport généré à la demande, consulté immédiatement après génération, n'a pas
vraiment besoin d'une table des matières — le gain de navigation était marginal face au coût (une
page de plus, un sous-rapport de plus à maintenir, une contrainte de double remplissage plus lourde
qu'elle ne l'est restée après ce retrait).

**Ce qui reste** : le mécanisme de double remplissage (`PaieReportPdfService.generer`) — il ne sert
plus qu'à connaître la page de départ du premier chantier pour le bandeau récurrent (bloc "Niveau"),
voir `docs/report/README.md`, « Numérotation des chapitres et des pages ». Contrairement aux 3
sections précédentes, **il n'existe pas de chemin de réintroduction "sans redévelopper"** ici :
`sommaire.jrxml` et `SommaireEntreeBean` ont été supprimés du dépôt (pas seulement débranchés) — les
retrouver demanderait de consulter l'historique Git avant leur suppression.

---

## 5. Table de répartition par équipe — retirée (doublon avec le graphique)

**Ce qui a été retiré** : un tableau (`tableDistribution.jrxml`, sous-rapport partagé) qui
accompagnait le `<barChart>` de répartition par équipe d'un chantier, listant les mêmes valeurs
(équipe, effectif, montant, part) sous forme de lignes.

**Pourquoi** : pur doublon visuel avec le graphique juste au-dessus — les deux montraient exactement
la même donnée, le tableau n'ajoutait aucune information que le graphique n'avait pas déjà (au
contraire, le graphique est plus rapide à lire pour comparer des équipes entre elles).

**Ce qui reste** : rien côté affichage. Une chaîne de calcul orpheline (`DistributionVue`,
`PaieBiReportBuilder.versDistribution()`, `ChantierBiVue.distributionEquipe`) avait survécu à ce
retrait sans être nettoyée — repérée et supprimée le 2026-09-27 (voir commit « Nettoyer le dead code
de répartition par équipe »), une fois constaté qu'elle n'alimentait plus aucun élément du gabarit.
Contrairement aux sections 1 et 3, il n'y avait ici aucune raison de garder le calcul "prêt à
réafficher" : ce n'est pas un problème de données à résoudre plus tard, c'est un doublon définitivement
jugé inutile.

---

## Ce qui n'a PAS été retiré (pour éviter toute ambiguïté)

- Les `<barChart>` (répartition par chantier au niveau global, par équipe au niveau chantier,
  consolidée pour les chantiers à effectif réduit) — toujours 4 séries (masse/effectif/STC
  personnes/STC DH), inchangés par ce journal de décisions.
- Les cartes KPI et le narratif léger, à chaque niveau (Global, Chantier, Équipe/chantier compact).
- Le tableau employé détaillé (nom, fonction, CIN, jours, salaire, total, observation) — jamais
  résumé ni retiré, c'est le niveau de détail que le rapport garantit de ne jamais perdre.

---

## 6. Évolutions mensuelles globales et chantier — version en cours

La même trame d'analyse est appliquée aux niveaux global et chantier. Chaque niveau porte trois rubriques numérotées :

1. Masse salariale en DH et effectif en personnes, dans le même graphique avec un axe Y distinct par unité.
2. STC en personnes et STC en DH, dans le même graphique avec un axe Y distinct par unité.
3. Répartition : par chantier au niveau global ; par équipe au niveau chantier si au moins une équipe est sélectionnée,
   sinon par fonction.

Les deux graphiques d'évolution sont placés avant la répartition. Le calcul est limité aux 12 derniers mois au plus ;
cette limite ne figure pas dans le titre ni ailleurs dans le rapport. Seuls les mois réellement disponibles dans le
périmètre sélectionné sont montrés, au format `M/YYYY`.
Chaque série a une couleur distincte, une légende, une unité et une échelle propres ; les valeurs aux points et les
projections vers les axes rendent les chiffres lisibles. La même palette d'indicateurs, la légende et le format des
valeurs s'appliquent aux répartitions globales et chantier.

La vue d'ensemble n'affiche plus les lignes « Périmètre : Tous les marchés » ni la couverture d'historique. Les KPI
comparables montrent leurs variations à chaque niveau : masse et STC en DH avec montant/pourcentage, effectif,
chantiers et STC en personnes avec leur écart numérique. En l'absence de paie précédente dans le périmètre, l'écart est
signalé comme indisponible. Les rubriques sont enregistrées séparément des données des graphiques pour préparer un
sommaire dynamique ; la liste des employés est la rubrique 4 des chapitres chantier (décision antérieure au détail
par équipe : voir la mise à jour du 2026-10-16 ci-dessus pour la numérotation actuelle des rubriques équipe).

La maquette a été validée par l'utilisateur avant l'implémentation. Les tests ciblés sont mis à jour ; la CI de la PR et
la revue du PDF rendu restent à confirmer.
