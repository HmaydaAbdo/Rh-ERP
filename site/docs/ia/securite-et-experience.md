---
title: "Sécurité et expérience de l'assistant"
sidebar_position: 4
---

:::note Page reprise de l'ancien document IA
Texte repris tel quel de `docs/ia.md` (mis à jour le 2026-11-06). Les mentions de Spring, de Java et des tâches T* décrivent l'état avant la bascule vers FastAPI : la source de vérité du suivi est Jira (projet `KAN`) et celle du comportement est le code. À actualiser épopée par épopée.
:::

## 5. Sécurité

- **Périmètres.** Département → fiche de poste → rôles et permissions + périmètre de données
  (chantiers, équipes, département, ou « tous »). Appliqué dans les requêtes Spring, même règle pour
  REST et MCP. Le salaire devient une politique de projection du domaine (`EMPLOYEE_READ` sans
  `PAIE_READ` : ni salaire, ni tri, ni agrégat salarial). Le modèle exact est présenté et validé au
  lancement de J2.
- **Identité de l'agent.** Spring émet pour l'utilisateur connecté un jeton court RS256 (clé
  publique JWKS), audience `mcp`, scopes réduits ; le `JWT_SECRET` n'est jamais partagé. Chaque appel
  MCP revalide émetteur, audience, expiration, permissions et périmètre.
- **Champs rendus.** Les mêmes que les écrans pour un utilisateur donné (CIN, dates et montants compris) ; seules
  les permissions filtrent, quel que soit le fournisseur (cible : modèle local).
- **LiteLLM.** Une clé virtuelle par application, jamais la clé master ; la clé d'Staport Intelligence autorise
  uniquement les six groupes de production (aucun groupe d'évaluation ni de test), une limite de débit et un budget. Port lié
  à `127.0.0.1` ou au seul réseau Docker interne. Cache de réponses désactivé.
- **Audit et exploitation.** Acteur humain, service délégué et corrélation
  `requestId/threadId/runId/toolCallId` pour chaque outil, sans jeton ni contenu RH dans les
  journaux. Interrupteur global de l'IA ; budgets par utilisateur et par poste ; plafonds d'étapes,
  de tokens et de durée par run. L'application reste entièrement utilisable sans IA.
- **Menaces.** Le modèle de menaces (`conventions/agents-ia.md`) s'applique
  menace par menace ; l'état de chaque contrôle est suivi au § 10.

## 6. Expérience

**Interface composée (A2UI, T16).** Pour une réponse chiffrée plus lisible en tableau, en liste ou en indicateurs,
l'agent appelle `generate_a2ui` (injecté par `CopilotKitMiddleware` quand le runtime active A2UI) ; le middleware A2UI
du runtime transforme son flux en surface, rendue par CopilotKit Angular avec le catalogue de base officiel aux
couleurs Staport. La surface reprend les valeurs des résultats d'outils, qui restent leur source.
**Vues pilotées retirées** (décision du propriétaire du 2026-10-26) : l'assistant n'ouvre plus les écrans de l'ERP.
Les outils Spring décrivent toujours la vue correspondante (`VueProposeeDto`), réutilisable si un lien est un jour
proposé.

**Staport Intelligence (T8).** L'en-tête présente le monogramme officiel de Staport, le nom de l'assistant et la mention
« Votre assistant numérique » ; le premier message explique que les services proposés dépendent des accès du compte.
Barre de commande translucide au repos (`Ctrl K`), discussion ancrée à droite
dès la première question, comme un chat d'assistant : pour chaque réponse, un bloc repliable
de raisonnement et d'outils, puis le texte et, si l'agent le demande, une surface A2UI composée à partir
des résultats d'outils. L'accueil ne promet pas une liste fixe de domaines ; la réponse sur les capacités vient du
catalogue MCP autorisé pour l'utilisateur. Aucun écran ERP n'est ouvert automatiquement. Plein écran sur téléphone,
thème clair et sombre, mouvement réduit respecté. CopilotKit produit des suggestions dynamiques uniquement avant le premier
message : elles ne réexpédient pas un historique RH aux modèles. Le runtime les authentifie comme toute requête IA (`IA_UTILISER`)
et l'agent n'écrit pas de checkpoint pour ce run temporaire. Une erreur de run ou de transport est affichée comme un retour
accessible dans la discussion, sans exposer le détail fournisseur. Prototype de référence : [maquette-assistant.html](pathname:///ia/maquette-assistant.html).

**Espace IA immersif.** Plein écran, ouvert depuis le panneau : la conversation à gauche, à droite
une scène composée par l'agent en **A2UI** — indicateurs, graphiques, tableaux, fiches et sources,
tous rendus par des composants Staport du catalogue versionné — avec transitions animées et retour
à la vue classique en un clic. Clavier, lecteur d'écran, mobile et `prefers-reduced-motion` sont
pris en charge ; chaque surface a un repli texte.

**Mascotte.** Un personnage Rive vivant, présent dans le panneau et dans l'Espace IA :

- il **écoute** pendant la saisie, **réfléchit** pendant le raisonnement, **cherche** pendant un
  appel d'outil, **trouve** à l'arrivée du résultat, **demande** lors d'une confirmation et
  **s'excuse** sur un refus ou une erreur ;
- il **désigne** le composant dont parle la réponse (cible `surfaceId/componentId`), suit le
  pointeur du regard et a des animations de repos ;
- il est piloté par l'événement AG-UI `com.staport.mascot.state.v1` décrit dans
  agent-ui (`conventions/agent-ui.md`), jamais directement par le modèle ;
- avec la voix (J9), il parle avec synchronisation labiale et sous-titres ;
- l'utilisateur peut le masquer ; une image fixe remplace l'animation si Rive est indisponible ou
  si le mouvement réduit est demandé.
