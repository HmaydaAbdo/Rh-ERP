# TODO — points ouverts

> Suivi des sujets encore à traiter. Les sujets livrés et vérifiés dans le code (imports atomiques,
> PostgreSQL + Flyway, JWT/RBAC et sécurité, déploiement Docker + CI, synchronisation chantiers, rapport
> PDF en HTML, domaine Équipe, tableaux, etc.) ont été retirés de ce fichier : leur description détaillée
> vit dans `docs/` et leur historique dans git.

---

## Contrôle Design System frontend — en cours

- Contrôle réouvert pour atteindre une clôture stricte : CI verte sur `006f777`, bundle confirmé dans Compose sur le port 5002, 11 routes vérifiées en responsive, thèmes clair/sombre et contraste forcé. Le test manuel Narrateur Windows des sélecteurs multiples, du dialogue, du tableau et du graphique a été déclaré réussi par l’utilisateur le 2026-10-14.
- L’utilisateur a validé l’adaptation partagée de `stp-chart` : textes, axes, grille, légende et infobulle prennent les couleurs système en contraste forcé et suivent les bascules à chaud. Vérifications locales : 669 tests Angular et 9 E2E Catalogue réussis ; inspection visuelle du graphique, du multisélect et du dialogue en contraste forcé. Le contrôle reste ouvert pour le nouveau passage Narrateur du graphique, un build réussi sur cette version et la revue visuelle des variantes restantes ; voir le [rapport Design System](docs/conformite/design-system-2026-10-13.md). `ng serve` compile, mais `ng build` termine actuellement sans diagnostic local ; la CI verte de `006f777` précède les changements présents. Le contrôle frontend suivant, [`frontend.md`](conventions/frontend.md), reste clôturé après CI et validation runtime.

## Contrôle de convention frontend — clôturé

- Revue complète de `conventions/frontend.md` et corrections locales terminées le 2026-10-14 : rôles chargés par recherche serveur et pages dans le formulaire utilisateur ; filtres d’audit à cardinalité élevée multisélectionnables, avec contrat pluriel borné et compatibilité singulière.
- Contrôles locaux et CI verts sur `0d30593999eb5305f48a147bbd375596ee66c171` (run `38547264561`), y compris tests Angular, E2E, build/push des images et contrôle full-stack.
- Contrôle Compose après pull : PostgreSQL et backend déclarés sains, frontend démarré et `/` répond `200` sur `127.0.0.1:5002`. La recherche de rôles émet `POST /roles/search` et le filtre d’audit transmet plusieurs catégories à `POST /logs/search` ; la page audit à 390 px ne déborde pas horizontalement, son tableau défile dans son conteneur, aucune erreur console.
- La preuve de clôture figure dans la ligne `frontend.md` de [la matrice de conformité](docs/conformite/matrice.md) ; le rapport détaillé a été supprimé après clôture.

## Évolutions IA et KPI

Les conventions racine constituent le blueprint réutilisable ; l'ADR historique et les skills IA métier sont dans
`docs/adr/0001-adoption-socle-staport.md` et `docs/<domaine>/skills/`. Java 21 est aligné dans Maven ;
la migration PostgreSQL 18 est validée en local le 2026-10-10. **Frontend (2026-10-10)** : Angular 22.2.2, kit Staport sur
Angular Aria/CDK + Lucide + Tailwind 4, PrimeNG/PrimeIcons/Zone.js/Karma retirés, tests Vitest (653, couverture complète) et E2E Playwright + axe (39),
audit npm sans aucune vulnérabilité, licences contrôlées et SBOM en CI.
Restent à faire :

- ensuite instrumenter le catalogue de KPI existant puis cadrer un premier outil MCP RH en lecture
  seule avant d'étendre l'IA.

Le contrôle local de conformité est documenté dans [la matrice de preuves](docs/conformite/matrice.md)
et [le journal de contrôle](docs/conformite/controle-2026-10-11.md). Les validations d'exploitation
restent regroupées ci-dessous dans **Travail côté serveur**.

Ne pas basculer une dépendance majeure ou un volume de base sans validation de compatibilité, tests
et procédure de retour arrière propres à cette étape.

## Vues Cartes et Analytique des autres domaines (squelettes créés, 2026-10-06)

Seule la Paie a ses trois vues (Tabulaire, Cartes, Analytique) sous une coque commune (`portail/paie/vues/`, sélecteur de vue,
actions dans l'en-tête). Pour **Employés, Chantiers, Fonctions et Équipes**, seul le tabulaire existe ; les composants des deux
autres vues ont été créés **vides** (un message « disponible prochainement »), sans route ni onglet :

- `employee/cartes`, `employee/analytique` (`EmployeeCartesComponent`, `EmployeeAnalytiqueComponent`)
- `chantier/cartes`, `chantier/analytique`
- `function/cartes`, `function/analytique`
- `equipe/cartes`, `equipe/analytique`

À faire, domaine par domaine : concevoir et coder le contenu de chaque vue (avec ses tests) ; ajouter une coque commune sur le
modèle de `PaieVuesComponent` (titre, onglets de vue au même niveau que les actions déjà dans l'en-tête, filtres) ; déclarer les routes
`cartes` et `analytique` dans `<domaine>.routes.ts` avec la permission de lecture ; documenter dans `docs/<domaine>/README.md`.

---

## Prochaine tâche — Qualité des données (une seule tâche, tous les domaines)

**Règles voulues (2026-10-03)** : dans **tous** les domaines, **tous les champs sont obligatoires** et
**aucun doublon ne peut exister**. À vérifier domaine par domaine (Employé, Chantier, Fonction, Équipe,
Paie, Utilisateur, Rôle), à quatre niveaux — base (`NOT NULL`, contraintes `UNIQUE`), API (validation des
DTO et contrôle d'unicité dans les services, insensible à la casse et aux espaces), interface (champs
marqués obligatoires) et imports Excel (ligne rejetée si champ manquant ou doublon) — puis sur les
**données existantes** (champs vides, doublons), avec correction par migration Flyway.

À instruire dans cette tâche :

- **Champs aujourd'hui facultatifs** à trancher un par un : pour Paie `equipe` (340 bulletins sans
  équipe en base), `observation`, jours de récupération, primes ; pour Chantier `nom` et `designation` ;
  pour Utilisateur `employeeId`. « Tous obligatoires » est-il voulu pour chacun (ex. une prime à 0 est-elle
  une saisie) ?
- **Nettoyer les doublons du référentiel Fonction** : 114 fonctions dont 9 paires très proches (fautes de
  frappe), toutes utilisées — la fusion (libellé à garder, rattachement des employés et bulletins) est une
  décision métier : `RESPONSABLE EPLOITATION FLOTTE CAMION` / `RESPONSABLE EXPLOITATION FLOTTE CAMION`,
  `OP. COMPACTEUR ENROBE` / `OP. COMPCTEUR ENROBE`, `OP. AOUTOBETONNIERE` / `OP. AUTOBETONNIERE`,
  `OP. TRACTOPEDLLE` / `OP. TRACTOPELLE` / `OP. TRACTIPELLE`, `TECHNICIEN DE QUALITE` /
  `THECNICIEN DE QUALITE` (`CH. CAMION` / `CH. CAMION SR` et `OP. COMPACTEUR` / `OP. MINI COMPACTEUR`
  sont probablement distinctes). Ensuite, réintroduire le chapitre « Répartition par fonction » dans le
  rapport PDF (donnée déjà calculée côté Java, voir `docs/report/README.md` — « Points d'extension »).
- **Libellés des équipes `A`, `LABO`, `ASPHALET`, `8`** (créées avec libellé = code le 2026-10-03) : à
  compléter avec la RH via l'écran Équipes.
- **Empêcher les quasi-doublons à la saisie** (ex. fonction « TECHNICIEN DE QUALITE » vs « THECNICIEN DE
  QUALITE ») : seule l'égalité exacte (hors casse) est aujourd'hui bloquée.

---

## Travail côté serveur

À traiter en premier lors de la prochaine intervention sur l'hôte de production. Toutes les opérations
ci-dessous sont regroupées car elles nécessitent l'accès serveur ; suivre la [procédure détaillée](docs/deployment.md#migration-majeure-pg17--pg18-en-production).

1. **Migration PostgreSQL 17→18** : obtenir l'accès SSH, inventorier la production et répéter la
   restauration logique sur le serveur à partir d'une sauvegarde stockée sur ce même serveur, hors du
   volume PostgreSQL. Pendant la fenêtre de maintenance, créer/restaurer le volume PG18, démarrer
   Flyway jusqu'à V21 (V16–V21 sont en attente si la production est actuellement en V15), contrôler
   données, rôles, extensions, permissions et application, puis conserver intact le volume PG17
   comme retour arrière.
2. **Activer et vérifier pgAudit en production** pour la seule base ERP-RH, avec toutes les classes
   d'instructions (`all`, y compris `ROLE`), puis confirmer que les événements apparaissent dans les
   journaux PostgreSQL. Cela fait partie de la bascule PG18. Vérifier les droits d'accès et la
   protection du volume CSV, définir avec la RH la durée de conservation/purge de ces journaux pgAudit
   (distincte de la conservation à vie décidée pour `audit_journal`/Envers), et configurer des alertes
   de capacité et sur `rh.audit.ecriture.echec`, `rh.audit.integrite.compromise` et
   `rh.audit.chaine.invalide`.
3. **Nginx outer** : le serveur en possède déjà un. Obtenir l'exemple de configuration de l'utilisateur,
   puis s'aligner dessus ; ne pas remplacer ni modifier sa configuration avant cette revue. Voir
   [les informations à fournir](docs/deployment-informations-a-fournir.md).
4. **CD** : après accès SSH, décider si le déploiement doit être automatisé sur tag `v*` après réussite
   de la CI, puis préparer et valider cette chaîne. Ne pas déployer en production avant la migration
   PG17→PG18.
5. **Sauvegarde hors serveur** : différée par décision du 2026-10-11 ; aucun transfert hors hôte n'est
   prévu pour l'instant. Les archives quotidiennes chiffrées restent sur le serveur.
6. **Mise en service et exercice de la sauvegarde chiffrée** : depuis le poste d'administration,
   générer l'identité `age` (`age-keygen`) et conserver la clé privée avec une copie de secours
   protégée, toutes deux hors serveur ; sur l'hôte, configurer uniquement la clé publique
   `BACKUP_AGE_RECIPIENT` dans le `.env` protégé. Vérifier la création d'archives `.tar.gz.age`, la
   capacité de `/tmp` tmpfs selon la taille réelle de la base et la mémoire disponible, et préparer
   une alerte lorsque le service est unhealthy ou qu'aucune archive récente n'existe. Récupérer une
   archive vers un poste de restauration contrôlé, la déchiffrer avec la clé privée (`age --decrypt`),
   puis exécuter une restauration isolée et mesurer le RTO avec le volume réel. Ne jamais copier la
   clé privée sur l'hôte ou dans le dépôt. La copie des sauvegardes hors hôte reste différée par la
   décision du propriétaire.
7. **Vérifications sécurité Auth en production** : dans l'environnement protégé, vérifier un
   `JWT_SECRET` aléatoire propre à la production (Base64, au moins 256 bits), `COOKIE_SECURE=true`,
   les seules origines HTTPS réelles dans `CORS_ALLOWED_ORIGINS`, et Swagger désactivé. Après la
   migration qui inclut V21, contrôler le verrouillage 5 échecs/15 minutes et la rotation/révocation
   des sessions sur l'instance de production. Vérifier également que nginx inner limite les essais
   par adresse réelle et que l'outer transmet correctement cette adresse ; ne modifier nginx outer
   qu'après revue de l'exemple fourni par le propriétaire.
8. **Protection opérationnelle des journaux applicatifs** : sur l'hôte, contrôler les propriétaires et ACL de
   `./logs/` (lecture réservée aux opérateurs autorisés), l'espace disque disponible, la rotation UTC et la
   purge effective au-delà de 30 jours ; confirmer que le flux console et les archives ne sont accessibles
   qu'aux administrateurs autorisés et que la rétention est compatible avec les obligations applicables.
9. **Raccorder la supervision métrique en production** : configurer un collecteur Prometheus privé
   pour `/actuator/prometheus`, choisir sa rétention, créer le tableau de bord et les alertes décrits
   dans [le contrôle métriques](docs/conformite/metrics-2026-10-12.md), désigner le responsable de
   garde et tester le routage et les actions de réponse avant la mise en service.

## Performance — arbitrages et mesures à terminer

Le profil de base a été validé et le contrôle local a passé les seuils ; les preuves sont consignées dans le
[rapport de conformité performance](docs/conformite/performance-2026-10-12.md). Avant de déclarer
la performance opérationnelle de production validée :

- rejouer le profil à 20 échantillons par opération lourde sur un hôte représentatif et comparer les
  ressources aux capacités réservées ;
- mesurer les parcours HTTP de bout en bout avec sérialisation et proxy nginx outer ;
- vérifier les délais et comportements d'échec face à PostgreSQL, l'ERP et le fournisseur SMTP réels.

Le pool SMTP et les délais 5/3/5 s sont configurés, le rejet en saturation et la réponse générique
sont couverts par test ; `nginx -t` réussit dans l'image Nginx du projet. La conformité de code et
les mesures locales sont vérifiées ; elles ne démontrent ni la disponibilité des services réels ni
la capacité de production.

## Évolutions prochaines

### Domaines restants
- **Pointage** : à construire, en passant par les façades `IEmployeeService` (et probablement
  `IPaieService`), jamais par leurs Repository.
- **Paie calculée depuis le Pointage** (décision du 2026-09-22) : à terme plus d'import ni de saisie de la
  paie, calcul automatique à la validation du Pointage ; `PaieImportService`, le contrôleur d'import et le
  bouton « Importer » seraient alors retirés.
- **Statuts provisoire / validé** pour Pointage et Paie (décision du 2026-09-22) : provisoire (éditable)
  puis validé (figé) ; un mois ne peut être saisi que si le précédent est validé (progression
  séquentielle). Machine à états et validation d'enchaînement à concevoir le moment venu.
