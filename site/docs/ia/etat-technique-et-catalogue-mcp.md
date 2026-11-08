---
title: "État technique et catalogue MCP"
sidebar_position: 7
---

:::note Page reprise de l'ancien document IA
Texte repris tel quel de `docs/ia.md` (mis à jour le 2026-11-06). Les mentions de Spring, de Java et des tâches T* décrivent l'état avant la bascule vers FastAPI : la source de vérité du suivi est Jira (projet `KAN`) et celle du comportement est le code. À actualiser épopée par épopée.
:::

## 8. État technique

| Élément | État |
|---|---|
| Preuve MCP | Serveur FastMCP 4 de l'API Python (route `/mcp`, jeton agent RS256) appelé, sur un port loopback et une base réelle, par le client TypeScript `@modelcontextprotocol/sdk` 1.32.1 (le SDK du runtime Node CopilotKit) et par le client Python officiel `mcp` 2.3.0 ; protocole **2025-11-25**, Streamable HTTP. Preuve rejouable : `api/tests/test_mcp_clients_externes.py` (E2, KAN-50) ; voir le README du client (`scripts/ia/mcp-compatibility/README.md`). |
| LiteLLM | Image `erp-rh-litellm` (LiteLLM v1.104.2 épinglé par digest), base dédiée `litellm-db`, démarrés par défaut avec la pile (clés virtuelles enregistrées par `litellm-cles`). Fournisseurs actifs : Gemini, Groq, Mistral Experiment, Cloudflare, OpenRouter `:free`, Z.ai Flash, NVIDIA NIM. Pool `complex` principal : deux Nemotron NVIDIA ; repli explicite par le routeur officiel LiteLLM vers Mistral Ministral 14B, qualifié sur un parcours synthétique à deux outils MCP (chantier puis heures supplémentaires), schéma réel des arguments, période ISO et réponse fondée sur le résultat. La qualification complète de l'agent (24 cas) et de la bascule sur l'image publiée reste à faire. Candidats suivants (gratuits, renouvelables) : SambaNova (20 req/jour par modèle, sans carte), OVHcloud AI Endpoints anonyme (2 req/min), Cohere (1 000 appels/mois, évaluation), LLM7 (100 K tokens/jour). Écartés : GitHub Models (retiré), Hugging Face (plus de crédit gratuit), Cerebras (aucune inférence gratuite), DeepSeek (aucun palier gratuit), Alibaba Model Studio (quota unique de 90 jours), SiliconFlow international, Chutes, Kluster. Voir `litellm/README.md` (`litellm/README.md`). |
| Service IA | Image `erp-rh-ia` (Python 3.14), santé, client LiteLLM, agent LangGraph avec ciblage par domaine et évaluation (T6), point d'entrée AG-UI `POST /agui` (T7). Aucun vérificateur de chiffres après coup ; les calculs viennent des API métier. Voir `ia/README.md` (`ia/README.md`). |
| Code IA dans l'application | Serveur MCP **FastMCP 4** de l'API Python (`api/src/staport/domains/mcp`) : route `/mcp` sans état derrière `MCP_ENABLED`, outils déclarés par décorateur (permission par outil, bornes par Pydantic, aucune écriture au journal d'audit), authentification dédiée par jeton agent, jeton agent `POST /auth/jetons/agent`, JWKS `GET /.well-known/jwks.json`, permission `IA_UTILISER` (V36, `SYSTEM_ADMIN` seulement). Catalogue de 31 outils en lecture (ci-dessous). Assistant Angular (`core/assistant`, T8). Détails : Auth ([domaines/auth/index](../domaines/auth/index.md)). |
| CI et production | Job `ia` et publication de `erp-rh-litellm` / `erp-rh-ia` ajoutés à la CI ; exécution distante sur demande du propriétaire ; rien de déployé. |

## Catalogue MCP

Chaque outil exige `IA_UTILISER` (route) et la permission de son domaine (revérifiée à chaque appel), lit uniquement les façades publiques des domaines, journalise l'appel (entrée `ACCES` d'action `MCP_<OUTIL>`, canal `MCP` ; un refus de permission est l'événement de sécurité `ACCES_REFUSE`, comme pour l'API REST) et renvoie une `vue` (§ 6). Les données sont rendues en contenu structuré, en synthèse et en JSON texte (spécification MCP). Annotations MCP : lecture seule, idempotent, monde fermé. Les erreurs sont celles des frameworks : « Access Denied » de Spring Security, message de l'exception du domaine (par exemple « Employé introuvable avec l'id… », celui de l'API REST), violation de borne de Bean Validation.

| Domaine | Outil | Permission | Arguments principaux | Rend | Vue proposée |
|---|---|---|---|---|---|
| Système | `systeme_identite` | — | aucun | Utilisateur et autorités effectives | — |
| Chantier | `chantier_rechercher` | `CHANTIER_READ` | `recherche` (code, nom ou désignation), `statut` (`EN_COURS`/`CLOTURE`), `limite` ≤ 20 | Identifiant, code, désignation, nom, origine ERP, statut | `chantiers` / `tabulaire` |
| | `chantier_fiche` | `CHANTIER_READ` | `id` | Fiche du chantier | `chantiers` / `fiche` |
| Équipe | `equipe_rechercher` | `EQUIPE_READ` | `recherche`, `limite` ≤ 20 | Identifiant, code, libellé | `equipes` / `tabulaire` |
| | `equipe_fiche` | `EQUIPE_READ` | `id` | Fiche de l'équipe | `equipes` / `fiche` |
| Fonction | `fonction_rechercher` | `FUNCTION_READ` | `recherche`, `limite` ≤ 20 | Identifiant, libellé | `functions` / `tabulaire` |
| | `fonction_fiche` | `FUNCTION_READ` | `id` | Fiche de la fonction | `functions` / `fiche` |
| Employé | `employes_rechercher` | `EMPLOYEE_READ` | `nom`, `cin`, périmètre, `statut` (`EN_POSTE`/`SORTI`), pages de 20 | Fiches complètes (CIN, naissance, embauche, affectations) ; salaire avec `PAIE_READ` ; toutes les pages accessibles | `employees` / `tabulaire` |
| | `employe_fiche` | `EMPLOYEE_READ` | `id` | Fiche complète et départs ; salaire avec `PAIE_READ` | `employees` / `fiche` |
| | `employes_compter` | `EMPLOYEE_READ` | périmètre, `statut` | Effectif, en poste, sortis, âge et ancienneté moyens, embauches 12 mois, tranches | `employees` / `analytique` |
| | `employes_regrouper` | `EMPLOYEE_READ` | `dimension` (`CHANTIER`/`EQUIPE`/`FONCTION`), périmètre, `statut` | Tous les groupes triés | `employees` / `cartes` |
| | `employes_sorties` | `EMPLOYEE_READ` | `periode` | Tous les départs du mois, total et par motif | `employees` / `analytique` (mouvements, avec `PAIE_READ`) ou liste « Sorti » |
| | `employe_parcours` | `PAIE_READ` | `id` | Parcours complet : indicateurs, tous les mois, événements | `employees` / `fiche` |
| Paie | `paie_indicateurs` | `PAIE_READ` | `periode`, périmètre | Masse, effectif, coût moyen, STC ; mois précédent ; tous les chantiers | `paie` / `analytique` |
| | `paie_periodes` | `PAIE_READ` | périmètre | Tous les mois importés : bulletins, chantiers, masse, STC | `paie` / `cartes` |
| | `paie_repartition` | `PAIE_READ` | `periode`, `dimension`, périmètre | Masse, effectif, STC par tous les groupes | `paie` / `analytique` |
| | `paie_evolution` | `PAIE_READ` | `periode` (dernier mois de la série), périmètre | Série historique complète : masse, effectif, STC | `paie` / `analytique` |
| | `paie_comparer` | `PAIE_READ` | deux mois, `dimension`, périmètre, tri | Tous les groupes : variations, effectifs et masses | `paie` / `analytique` |
| | `paie_mouvements` | `PAIE_READ` | `periode` ou tous les mois, périmètre | Payés, entrées, sorties, mutations par mois | `employees` / `analytique` |
| | `paie_qualite` | `PAIE_READ` | `periode`, périmètre | Bulletins sans équipe, sans observation ; tranches de total | `paie` / `tabulaire` (sans équipe) |
| | `paie_bulletins_rechercher` | `PAIE_READ` | `periode`, `nom`, `cin`, périmètre, pages de 20 | Bulletins complets : employé et CIN, affectations, jours, salaires, primes, total, observation ; toutes les pages accessibles | `paie` / `tabulaire` |
| Heures supplémentaires | `heures_supp_periodes` | `HEURES_SUP_READ` + `PAIE_READ` | aucun | Mois des imports | `heures-supp` / `analytique` |
| | `heures_supp_import_prerequis` | `HEURES_SUP_IMPORT` + `PAIE_READ` + `CHANTIER_READ` | `periode`, `chantierId` | Vérifie l'existence de bulletins pour le mois et du chantier avant l'import ; aucune écriture | `/heures-supp/import` |
| | `heures_supp_indicateurs` | `HEURES_SUP_READ` + `PAIE_READ` | `periode` (absente = dernière période importée), chantier(s), équipe(s), fonction(s), CIN/nom | Effectif, heures, Montant, STC (DH), Forfaits, Net à payer et toutes les répartitions du périmètre par chantier/équipe/fonction ; définitions incluses | `heures-supp` / `analytique` |
| | `heures_supp_rechercher` | `HEURES_SUP_READ` + `PAIE_READ` | mois, chantier, équipe, fonction, CIN/nom, pages de 20 sans plafond ; un critère obligatoire | Lignes détaillées et totaux calculés par Spring ; toutes les pages accessibles | `heures-supp` / `tabulaire` |
| Rapport | `rapport_preparer` | `PAIE_EXPORT` + `PAIE_READ` | `periode`, `chantierIds` | Chantiers du rapport ; aucun fichier généré | `paie` / `tabulaire`, `action=export` |
| Accueil | `accueil_lire` | `ACCUEIL_READ` | aucun | Indicateurs de l'accueil de l'utilisateur, dans l'ordre, et ceux qu'il peut y ajouter ; lecture seule | `accueil` |
| Paramètres | `parametres_lire` | `PARAMETRE_READ` | aucun | Clé, libellé, valeur, unité, bornes | `admin/parametres` |
| Administration | `roles_lister` | `ROLE_MANAGE` | `nom`, pages de 20 | Rôles et codes de permission (sans les comptes), toutes les pages accessibles | `admin/roles` |
| Audit | `audit_rechercher` | `AUDIT_READ` | filtres, pages de 20 | Toutes les entrées du journal, total et pages accessibles | `audit` |
| | `audit_historique` | `AUDIT_READ` | `entite`, `id`, pages de 10 | Toutes les versions : auteur, opération, champs avant/après | — |

Périmètre = `chantierIds`, `equipeIds` (`0` = sans équipe), `fonctionIds`. `periode` absente = dernier mois de paie
importé. Exclus : toute écriture (jusqu'à J6), la liste des comptes utilisateurs, la carte.
