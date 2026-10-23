# Handoff — intégration IA ERP-RH

**Mis à jour : 2026-10-23. État : dossier de conception préparé, implémentation non commencée.**
Ce fichier est le registre de reprise du chantier IA. Le [handoff général](etat-du-projet.md)
reste la porte d’entrée de l’application ; le [dossier IA](../ia/README.md) regroupe la conception.

## Demande et décisions à conserver

- Travailler sur une branche dédiée à l’IA, séparée de l’intégration courante de `main`.
- Mettre d’abord à jour les conventions, analyser le code, intégrer le RAG au plan et préparer
  un handoff exploitable même après interruption de session.
- Orientation demandée : métier/transactions/RBAC/audit dans Spring, outils IA par MCP ;
  orchestration TypeScript/Node avec LangGraph.js explicite ; CopilotKit Runtime/AG-UI à étudier.
- Proposer d’autres technologies et protocoles lorsqu’un besoin le justifie, y compris gRPC,
  UDP, A2A ; ne pas transformer cette ouverture en installation systématique.
- Choix encore ouverts D1–D8 dans l’[ADR 0013](../adr/0013-integration-ia-mcp-langgraph-rag.md).
  Ne pas les déclarer approuvés à la prochaine session sans réponse explicite du propriétaire.

## Repère Git

| Élément | État lors de la préparation |
|---|---|
| Dossier | `C:\Users\Hp\Desktop\Badia\erp-rh` |
| Branche IA | `codex/integration-ia-mcp-rag` |
| Base locale de création | `6bff11ffb07b23a532a98454861fcff469cfe942` |
| Branche de départ | `main`, propre, cinq commits devant le repère local `origin/main` |
| Repère `origin/main` observé, sans actualisation réseau | `c0ecbe5f9d718b079a486b8b8514ae7197ae8b8b` |
| Publication | Aucun push, PR, merge ou déploiement effectué dans ce lot |

Ces cinq commits préexistants concernent Équipe/Paie et font partie de l’ascendance de la branche.
Le diff du chantier IA se lit depuis la base locale ci-dessus, **pas depuis l’ancien repère distant**.
Ne pas publier une PR contenant ces changements sans examiner la divergence de `main` et la
synchronisation avec le propriétaire. L’IA ne justifie ni reset ni suppression de ces commits.

Le commit documentaire se retrouve par `git log` après la base ; son propre identifiant n’est pas
recopié dans ce fichier pour éviter un handoff périmé à chaque correction documentaire.

## Livrables et limites

- Conventions agents, MCP, interface et RAG mises à jour ; convention de choix des intégrations.
- ADR 0013 et [analyse des neuf piliers](../ia/analyse-architecture.md).
- [Plan P0–P4 avec portes G1–G4](../ia/plan-integration.md), [RAG](../ia/rag.md) et
  [matrice des protocoles/innovations](../ia/protocoles-et-innovations.md).
- Index, TODO et documents historiques reliés à cette nouvelle orientation.
- Aucun code applicatif, migration, permission, dépendance, conteneur ou donnée modifié.

## Registre de réalisation

| Lot | État | Preuve / suite |
|---|---|---|
| P0.1 — audit | Terminé documentairement | Sources du dépôt dans l’analyse ; pas de mesure de production |
| P0.2 — conventions | Préparé pour revue | Diff Git limité à la documentation |
| P0.3 — ADR/plan/RAG/handoff | Préparé pour revue | Dossier IA et ADR 0013 |
| P0.4 — accord initial | En attente propriétaire | Périmètre et spikes isolés ; décisions D1–D8 confirmées progressivement après preuves |
| Phase 1 — MCP et identité | Non commencée | Après accord P0.4 ; D2/D3 avant exposition ; aucun endpoint MCP actif |
| Phase 2 — runtime et checkpoints | Non commencée | Après G1 ; aucun runtime/saver installé |
| Phase 3 — interface | Non commencée | Après G2 ; aucune preuve UI IA |
| Phase 4 — RAG/mémoire | Non commencée | Gouvernance à préparer dès D1 ; aucun corpus indexé |

## Procédure exacte de reprise

1. Lire `AGENTS.md`, le handoff général, ce fichier, l’ADR 0013 et le lot courant du plan.
2. Relever l’état réel avant toute modification :

   ```powershell
   git status --short --branch
   git branch --all
   git log -8 --oneline
   git diff --stat 6bff11ffb07b23a532a98454861fcff469cfe942 HEAD
   git diff --stat
   ```

3. Si la branche n’est pas celle de l’IA, ou si des changements non identifiés existent, les
   examiner et préserver. Ne pas changer de branche, nettoyer, stash ou reset aveuglément.
4. Lire les approbations consignées. Sans accord initial P0.4, préparer sa revue. Si un spike
   isolé est autorisé, l’exécuter dans ses limites même si le choix définitif qu’il éclaire est
   encore ouvert ; obtenir cette décision avant adoption, selon les portes du plan.
5. Pour un lot autorisé : vérifier versions et sources officielles actuelles, puis créer une
   unité de travail bornée avec tests/critères de sortie. Les exemples de documentation externe
   ne remplacent pas les conventions, notamment pour OAuth, DDL ou audit.
6. À la fin de chaque unité ou avant changement de session, compléter le registre ci-dessous,
   mettre les docs à jour et sauvegarder un commit cohérent lorsque possible. Si une opération
   est en cours, noter son état réel et un moyen de vérifier le résultat avant de la relancer.

## Registre de validation du lot documentaire

Résultats locaux du 2026-10-23 ; ils ne constituent pas une validation d’une implémentation IA.

| Contrôle | État |
|---|---|
| Diff documentaire, absence de code/migration/dépendance | Vérifié : 20 fichiers Markdown, aucun fichier applicatif modifié |
| `git diff --check` et liens locaux des documents touchés | Réussis ; 20 documents contrôlés, zéro cible locale manquante |
| Backend : Maven 3.10.0 / Java21, `-B -o -DskipTests compile` | `BUILD SUCCESS`, classes déjà à jour ; tests non exécutés, SBOM ignoré en mode hors ligne |
| Frontend : `npm run build` | Réussi, bundle produit ; tests non exécutés |
| Revue indépendante du plan et de la sécurité | Réalisée ; cycle d’approbation des spikes corrigé, pas d’autre problème substantiel relevé |
| Tests IA, MCP, RAG, navigateur IA | Non exécutés : aucune implémentation |
| CI distante / runtime IA / production | Non exécutés |

Le premier lancement du wrapper Maven est resté silencieux et a été interrompu. La distribution
déjà installée a ensuite été utilisée directement. Le bac à sable empêchait l’ouverture des
verrous `.m2` ; la compilation a réussi avec l’accès autorisé au cache, sans supprimer ses verrous.
Commande effectivement réussie depuis `backend/` :

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
& 'C:\Users\Hp\.m2\wrapper\dists\apache-maven-3.10.0-bin\39q0qgmngdu329psje7bjgne79\apache-maven-3.10.0\bin\mvn.cmd' -B -o -DskipTests compile
```

Ce chemin est propre au poste et doit être revérifié à la reprise. Ne pas modifier le wrapper
versionné pour contourner un problème de cache local.

## Modèle de point de reprise à remplir pour les prochains lots

```text
Date et session :
Branche / commit de départ / dernier commit de travail :
Lot autorisé et décisions applicables :
État des fichiers non committés :
Fait et vérifié (commande, résultat, rapport) :
En cours (opération, effet possible, moyen de vérifier) :
Bloqué (cause précise, tentative, information attendue) :
Risques et décisions non approuvées :
Prochaine action unique, critère de sortie :
CI / runtime / production :
```

Ne pas mettre de secret, jeton, contenu de paie, dump ou donnée personnelle dans ce registre.
Une conversation interrompue n’est pas une raison de relancer une écriture sans connaître son effet.

## Points critiques pour le prochain lot

- Le code réel est Java21/Boot4/Angular22 ; le handoff ancien mentionne encore Java17.
- La projection salaire est dans `EmployeeController` ; elle n’est pas héritée par les façades.
- `AuditLectureResponseAdvice` et `AsyncConfig` ne couvrent pas automatiquement MCP ou les jobs.
- `PostgresSaver.setup()` au démarrage runtime contredirait Flyway et les droits DB.
- La version MCP retenue doit être commune aux SDK ; « dernière spécification » ne garantit pas
  « version stable implémentée ».
- Le dossier historique `docs/conformite/` n’existe plus dans cet arbre ; ne pas traiter ses anciens
  liens comme des preuves actuelles.
- Le port 4200 et la pile Docker du propriétaire restent réservés ; les E2E utilisent 4300.

**Prochaine action :** revue de l’ADR 0013, choix du pilote et accord sur les spikes isolés P1.
