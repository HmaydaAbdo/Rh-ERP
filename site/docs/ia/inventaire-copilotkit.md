# Inventaire des fonctions gratuites de CopilotKit

Relevé du 2026-11-16 (documentation Angular officielle, CopilotKit Angular 0.6.0) face au code de l'application. Seules les fonctions
gratuites et auto-hébergeables comptent ; CopilotKit Intelligence (hébergé) est exclu par décision (Q3).

| Fonction | Statut | Où / pourquoi |
|---|---|---|
| Discussion préconstruite `CopilotChat`, libellés français | **Utilisée** | `assistant-chat.component.ts` |
| Suggestions générées par l'agent | **Utilisée** | `suggestionsConfig` (1 à 3), `assistant-racine.component.ts` |
| Rendu des appels d'outils (`registerRenderToolCall`) | **Utilisée** | carte, export de paie (`assistant.component.ts`) |
| Interface générative A2UI (catalogue) | **Utilisée** | catalogue Staport, reprise des surfaces invalides (KAN-96) |
| Rendu d'activité personnalisé (`renderActivityMessages`) | **Utilisée** | `surface-a2ui-francais.component.ts` |
| Interface générative ouverte (`openGenerativeUI`) | **Utilisée, toujours active pour tous, sans plafond** (isolation, audit, jeu adverse : KAN-283, KAN-284) | KAN-95 |
| Humain dans la boucle (`injectInterrupt`) | **Utilisée** | `accord-interruption.component.ts` |
| État partagé (`injectAgentStore`) | **Utilisée** | `assistant-chat.component.ts` |
| Contexte de page (`connectAgentContext`) | **Utilisée** | `assistant.component.ts` |
| Pièces jointes multimodales | **Utilisée** | antivirus et contrôle du contenu (KAN-87/88) |
| Voix (transcription) | **Utilisée** | Whisper auto-hébergé |
| Rendu Markdown (`provideMarkdownRenderer`) | **Utilisée** | surfaces A2UI |
| Authentification du runtime (en-têtes, jeton) | **Utilisée** | jeton rafraîchi avant l'envoi |
| Inspecteur de développement | **Coupé volontairement** | `enableInspector: false` (KAN-98) |
| Contrat de production | **Appliqué** | KAN-97 |
| Outils côté navigateur (`registerFrontendTool`) | **Utilisé (KAN-270)** | un outil `*_regler_filtres` par page de liste (Employés, Chantiers, Équipes, Fonctions, Paie, Heures supp.) : l'agent règle les filtres de la page ouverte, sans navigation, retiré avec la page, réservé au droit `IA_UTILISER` |
| `registerHumanInTheLoop` | **Reporté à l'épopée E13 (KAN-285)** | première action d'écriture proposée par l'agent ; choix à faire avec `injectInterrupt` (déjà utilisé), une seule voie par cas |
| `registerComponent` | **Non utilisé** | seulement si un affichage fixe ne peut pas passer par le catalogue A2UI |
| Surfaces `CopilotSidebar` et `CopilotPopup` | **Non utilisées** | l'espace IA plein écran et le panneau maison du KAN-91 les remplacent ; seulement si un mode d'affichage compact est demandé |
| Emplacements (slots), CSS | **Utilisés (KAN-102)** | variables CSS reliées aux jetons, message de raisonnement (emplacement officiel), identité de l'espace IA (verre mat, saphir, animations) dans `_assistant.scss` ; l'accueil et la saisie n'ont pas d'emplacement en Angular 0.6.0, ils se stylent par leurs classes stables |
| Interface sans chat (headless) | **Non utilisée** | la discussion préconstruite suffit ; à rouvrir si une interface qui ne ressemble pas à un chat est demandée |
| `injectCapabilities` | **Utilisée (KAN-270)** | pièces jointes lues dans les capacités AG-UI du runtime ; relais maison supprimé |
| `CopilotKitAgentContext` | **Non adopté, doublon** | `connectAgentContext` est la voie officielle déjà utilisée |
| `injectCopilotKitConfig` | **À adopter au besoin** | aucun composant ne relit la configuration |
| `selfManagedAgents` | **Exclu de la production** | contourne le runtime Node et ses contrôles ([contrat de production](contrat-de-production.md)) |
| MCP Apps (`provideMCPApps`) | **Adopté, épopée E22 (KAN-286)** | décision du propriétaire du 2026-11-16 : appliqué à tout le projet, domaine par domaine, avec la politique de contenu des vues libres ; aucun serveur MCP ne renvoie encore de ressource d'interface |
| Fils enrichis (`injectThreads`), mémoires (`injectMemories`), inspection avancée | **Hors périmètre** | exigent Intelligence (hébergé), exclu |

## Conclusion

Toutes les fonctions gratuites et officielles de CopilotKit Angular sont soit utilisées, soit planifiées dans une épopée avec un déclencheur
écrit, soit écartées avec une raison (doublon, contournement des contrôles, hébergement payant). Aucune n'est restée sans décision :
`registerHumanInTheLoop` va en E13 (KAN-285), MCP Apps en E22 (KAN-286), `selfManagedAgents` est exclu de la production.

## Déclencheurs d'adoption (décision du propriétaire, 2026-11-16)

Une fonction gratuite et officielle qui n'a pas encore de cas d'usage s'adopte **au moment où elle est utilisée**, par la voie officielle, sans doublon maison :

| Fonction | Déclencheur |
|---|---|
| `registerHumanInTheLoop` | première action d'écriture proposée par l'agent : tâche KAN-285 (E13.7), avec KAN-103 |
| MCP Apps (`provideMCPApps`, `mcpApps.servers` du runtime) | épopée E22 (KAN-286) ; la limite d'identité (le runtime doit joindre MCP avec le jeton de l'utilisateur) s'y règle |
| Emplacements (slots), CSS | fait avec le thème Staport (KAN-102) ; interface sans chat : si une interface qui n'est pas un chat est demandée |
| `registerComponent` | seulement si un affichage fixe ne peut pas passer par le catalogue A2UI |
| `selfManagedAgents` | jamais en production (contourne le runtime et ses contrôles) ; agents locaux de test seulement |
| `CopilotKitAgentContext`, `injectCopilotKitConfig` | `connectAgentContext` reste la voie du contexte ; `injectCopilotKitConfig` le jour où un composant relit la configuration |
| Sidebar, Popup | seulement si un mode d'affichage compact est demandé |

## Offre Intelligence relue le 2026-11-16

La page officielle des plans indique que le plan **Developer** est gratuit (un siège, AG-UI Streams, mémoire utilisateur, apprentissage automatique, limites d'usage), hébergé par l'éditeur. L'auto-hébergement en production exige les plans Team Self-hosted ou Enterprise. Nos exclusions (Q3) tiennent à l'hébergement chez l'éditeur (données de paie et d'identité hors de notre réseau) et aux quotas, pas seulement au prix.
