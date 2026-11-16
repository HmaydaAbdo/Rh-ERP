---
title: "Sécurité et expérience de l'assistant"
sidebar_position: 4
---

:::note Page reprise de l'ancien document IA
Texte repris tel quel de `docs/ia.md` (mis à jour le 2026-11-06). Les mentions des tâches T* décrivent l'état au 2026-11-06 : la source de vérité du suivi est Jira (projet `KAN`) et celle du comportement est le code. À actualiser épopée par épopée.
:::

## 5. Sécurité

- **Périmètres.** Département → fiche de poste → rôles et permissions + périmètre de données
  (chantiers, équipes, département, ou « tous »). Appliqué dans les requêtes de l'API, même règle pour
  REST et MCP. Le salaire devient une politique de projection du domaine (`EMPLOYEE_READ` sans
  `PAIE_READ` : ni salaire, ni tri, ni agrégat salarial). Le modèle exact est présenté et validé au
  lancement de J2.
- **Identité de l'agent.** L'API émet pour l'utilisateur connecté un jeton court RS256 (clé
  publique JWKS), audience `mcp`, scopes réduits ; le `JWT_SECRET` n'est jamais partagé. Chaque appel
  MCP revalide émetteur, audience, expiration, permissions et périmètre.
- **Champs rendus.** Les mêmes que les écrans pour un utilisateur donné (CIN, dates et montants compris) ; seules
  les permissions filtrent, quel que soit le fournisseur (cible : modèle local).
- **LiteLLM.** Une clé virtuelle par application, jamais la clé master ; la clé de Staport Intelligence autorise
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

**Reprise d'une surface invalide (KAN-96).** La boucle est celle de la bibliothèque (`run_a2ui_generation_with_recovery`, appelée par
`generate_a2ui`) : chaque essai du sous-agent est validé contre le catalogue **fermé** de l'ERP (`catalogue_a2ui_base.json`, copie de
`@a2ui/web_core` 0.10.4, et `catalogue_a2ui_erp.json`) ; en cas d'erreur (composant hors catalogue, propriété obligatoire manquante,
enfant ou liaison introuvable), les erreurs sont renvoyées au sous-agent, **trois essais au plus** (`recovery.maxAttempts`), et seule
une surface valide est peinte. Après trois échecs, aucune surface n'est livrée (`a2ui_recovery_exhausted`) : la réponse reste le texte
de l'agent, puis le repli lisible de l'interface (E1.10) couvre une erreur de rendu. Côté navigateur, la reprise n'est montrée qu'après
2 s ou 2 essais et ses diagnostics restent cachés. Preuves : `ia/tests/test_surfaces_reprise.py` (surface valide, reprise puis succès,
propriété manquante, propriété du catalogue de base manquante, épuisement). **Deux contournements** (décision du propriétaire, 2026-11-16) :
1. Le validateur officiel ne lit les propriétés obligatoires qu'à la racine d'un composant, pas dans `allOf` (composants du
   catalogue de base, comme `Text`) : `_avec_requis_a_la_racine` (`agent.py`) les remonte dans la copie du catalogue donnée à la validation ; le
   fichier de la spécification reste intact.
2. Les messages de reprise du composant de la bibliothèque sont en anglais (« Building interface », « Retrying generation… »,
   « Couldn't generate the UI ») et non personnalisables : `surface-a2ui-francais.component.ts` prend la place du rendu de l'activité
   `a2ui-surface` par `renderActivityMessages` (point d'extension officiel), affiche construction, reprise et échec en français sans
   détail technique, et délègue la surface elle-même au composant officiel. Preuves : tests unitaires de ce rendu et parcours
   de bout en bout de la surface composée. La demande d'une option de libellés a été transmise à CopilotKit (2026-11-16) ; à retirer
   quand elle existera.
**Vues pilotées retirées** (décision du propriétaire du 2026-10-26) : l'assistant n'ouvre plus les écrans de l'ERP.
Les outils de l'API décrivent toujours la vue correspondante (`VueProposeeDto`), réutilisable si un lien est un jour
proposé.

**Staport Intelligence (T8).** L'en-tête présente le monogramme officiel de Staport, le nom de l'assistant et la mention
« Votre assistant numérique » ; le premier message explique que les services proposés dépendent des accès du compte.
L'icône flottante de l'assistant (ou `Ctrl K`) ouvre un **espace dédié à l'IA, plein écran** (route `/assistant`, KAN-91) :
conversations titrées à gauche (reprise, renommage, suppression), discussion à droite, « Retour à l'application » vers
l'écran d'origine ; le panneau latéral d'origine n'existe plus. Dans la discussion, comme un chat d'assistant : pour chaque réponse, un bloc repliable
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

**Pas de mascotte.** Décision du propriétaire du 2026-11-16 (KAN-100 abandonné) : aucun personnage animé, aucun Rive,
aucun événement dédié. Le retour visuel pendant le travail de l'agent est celui de CopilotKit (raisonnement et appels d'outils).

## Accessibilité et appareils : preuves (KAN-99)

Suite Playwright `frontend/e2e/assistant-accessibilite.spec.ts` (axe-core, WCAG 2.2 AA) :

| Exigence | Preuve |
|---|---|
| Clavier | Ctrl K ouvre l'espace avec la saisie au focus ; Tab avance toujours vers un autre contrôle (aucun piège) ; Ctrl K ramène à l'écran |
| Lecteur d'écran | Région nommée « Staport Intelligence », aucun bouton, lien ou champ sans nom accessible |
| Thèmes | Aucune violation axe en clair et en sombre |
| Mouvement réduit | Aucune transition ni animation de plus de 0,1 s sous `prefers-reduced-motion` |
| Téléphone et zoom | 390 px : aucune violation, cibles d'au moins 24 px ; 320 px (zoom 400 %) : aucun défilement horizontal |
| Repli texte | Une surface A2UI inconnue n'empêche pas la réponse écrite ni ne lève d'erreur de page |
| Service indisponible | Message en français, application restée utilisable |
| Annulation d'un run | Test du runtime (`copilot-runtime/test/app.test.mjs`) : l'arrêt officiel `/agent/:id/stop/:threadId` est réservé au propriétaire du fil |

**Lacunes de la bibliothèque (CopilotKit Angular 0.6.0), sans contournement maison** : le bouton d'envoi porte un nom
accessible anglais (« Send message ») sans clé de libellé, et la saisie n'offre pas de bouton d'arrêt. Le slot `sendButton`
n'est joignable depuis `copilot-chat` qu'en remplaçant toute la saisie, ce qui serait une copie maison ; la correction
attend une clé de libellé ou un slot exposé par `copilot-chat` (suivi KAN-270, déclencheur « slots »).
