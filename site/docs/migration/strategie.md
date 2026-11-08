---
title: Stratégie de bascule
sidebar_position: 2
---

# Stratégie de bascule (KAN-46)

Applique l'ADR 0016 ([decisions/0016-migration-backend-spring-vers-fastapi](../decisions/0016-migration-backend-spring-vers-fastapi.md)), § 7 (amendé le 2026-11-03) : **une branche de travail, un
commit par ticket, une seule PR vers `main`, une seule mise en production**. La production reste sur Spring jusqu'à la bascule.

## Ordre des domaines

Le transverse d'abord, puis le métier du moins couplé au plus couplé. Les tailles viennent de l'[inventaire](inventaire.md).

| Rang | Domaine | Lignes Java | Routes | Pourquoi à cette place |
|---|---|---:|---:|---|
| 0 | `common` (prototype `api/`, KAN-47) | 564 | 0 | Format d'erreur, identifiant de requête, verrouillage, recherche : tout le monde en dépend |
| 1 | `auth`, `audit`, `parametre`, MCP (KAN-48) | 3 399 / 2 798 / 546 / 1 988 | 21 / 4 / 2 / 0 | Identité, permissions et audit conditionnent tous les domaines ; le MCP absorbe le service IA |
| 2 | `function`, `equipe` | 726 / 806 | 7 / 7 | Petits référentiels, peu de règles : premiers domaines métier de bout en bout |
| 3 | `chantier`, `accueil` | 1 230 / 472 | 8 / 6 | Synchronisation externe (chantiers), préférences |
| 4 | `employee` | 1 970 | 9 | Dépend de `function`, `equipe`, `chantier` ; import Excel |
| 5 | `heuresupp` | 2 321 | 14 | Montants entiers (`HALF_DOWN`), PDF |
| 6 | `paie` | 8 299 | 23 | Le plus gros et le plus risqué : calculs, 7 modèles de rapport PDF ; en dernier |
| 7 | Retrait de Spring (KAN-50) | — | — | Seulement quand chaque ligne de l'inventaire a sa preuve |

## Définition de fin de domaine (une case non cochée bloque le domaine suivant)

1. **Contrat** : le document OpenAPI du domaine (chemins, champs, codes, format d'erreur) est identique à celui de Spring ; le test de
   contrat compare les deux documents et échoue sur toute différence non justifiée par écrit.
2. **Parité de comportement** : chaque test Java du domaine (voir inventaire) a son équivalent pytest, ou son absence est justifiée ;
   les calculs ont un test de parité (mêmes entrées, mêmes sorties que Java, jeux figés).
3. **Données réelles** : lecture et écriture de bout en bout sur une **copie** de la base (jamais la base du propriétaire), audit compris :
   les lignes `*_aud` produites par les deux backends sur un même scénario sont comparées.
4. **Sécurité** : chaque route et chaque outil MCP déclare sa permission ; le test de couverture des routes est vert.
5. **Mesures** : voir plus bas ; aucun domaine ne dégrade la latence ou la mémoire sans le consigner.
6. **Documentation** : README de domaine, conventions et site de documentation à jour (règle d'`AGENTS.md`).
7. **Rapprochement** : `main` est fusionné dans la branche de travail (`git merge main`) ; les changements de comportement arrivés sur
   `main` pendant le domaine ont leur ticket de report.
8. **Sauvegarde** : `git bundle create ../erp-rh-migration-<domaine>.bundle --all` (la branche n'est pas poussée avant la fin).

## Coexistence des deux backends

Uniquement dans l'environnement d'essai et la CI de la PR finale : la base de la copie est lue par Spring et par FastAPI, un script
rejoue le même scénario sur les deux et compare réponses et lignes d'audit. Rien n'est servi par FastAPI en production avant la bascule.

## Mesures (avant et après, consignées dans Jira)

| Mesure | Départ (Spring + IA, relevé du 2026-11-03) | Après (FastAPI unique) |
|---|---|---|
| Conteneurs applicatifs (backend + IA) | 2 | 1 attendu |
| Taille d'image backend + IA | 725 Mo + 871 Mo | à mesurer |
| Latence IA bout en bout p50 / p95 | p50 8,53 s (banc 60 cas, dernier relevé) ; p95 à relever | à mesurer |
| Mémoire au repos et sous charge | à relever pile démarrée | à mesurer |
| Temps de démarrage | à relever pile démarrée | à mesurer |
| Génération du PDF de paie (jeu de référence) | à relever | à mesurer |

**Décision du propriétaire (2026-11-03) : les mesures « avant » et « après » sont faites après la clôture de E2**, sur une pile
d'essai, avec le même protocole pour Spring et FastAPI.

Les valeurs « à relever » exigent la pile Docker démarrée, qui est l'environnement du propriétaire : elles sont relevées sur une pile
d'essai à part, jamais en arrêtant la sienne. **Non relevées à ce jour.**

## Bascule finale et retour arrière

Voir l'ADR § 7 : sauvegarde vérifiée, répétition générale sur une copie de la production, PR unique, annonce au propriétaire de ce qui
change dans `docker-compose.yml` et le `.env` de production. Le Compose préparé lance `flyway-validate` (noms, types et
checksums des scripts appliqués) puis `api-migrate` avant `api` : base neuve construite par Alembic, ou historique Flyway
V1–V44 complet estampillé automatiquement en `0001_base_v44`, sans rejouer les données. Une base Flyway incomplète ou un
schéma non reconnu bloque le démarrage ; la sauvegarde est restaurée avant une nouvelle tentative.
Retour arrière : redéployer l'étiquette Spring précédente ; la base reste compatible tant que les révisions de la bascule sont
rétro-compatibles (exigé en revue), sinon restaurer la sauvegarde.

## Risques suivis

PDF (comparaison d'images, WeasyPrint), arrondis monétaires (tests de parité), colonnes ou horodatages d'audit perdus (comparaison
des `*_aud`), déconnexion unique au passage à RS256 (planifiée avec `auth`), dérive de schéma Flyway → Alembic (contrôle
d'autogénération), branche longue non poussée (rapprochement à chaque fin de domaine, `git bundle`).
