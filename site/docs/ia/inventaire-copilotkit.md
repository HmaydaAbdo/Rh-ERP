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
| Interface générative ouverte (`openGenerativeUI`) | **Utilisée, éteinte par défaut** | KAN-95, `VUES_LIBRES` |
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
| `registerHumanInTheLoop`, `registerComponent` | **À adopter (KAN-270)** | selon les besoins des pages |
| Surfaces `CopilotSidebar` et `CopilotPopup` | **Non utilisées** | l'espace IA plein écran et le panneau maison du KAN-91 les remplacent |
| Interface sans chat (headless), emplacements (slots), CSS | **Partiel** | thème Staport prévu au KAN-102 |
| `injectCapabilities` | **Utilisée (KAN-270)** | pièces jointes lues dans les capacités AG-UI du runtime ; relais maison supprimé |
| `injectCopilotKitConfig`, `CopilotKitAgentContext`, `selfManagedAgents` | **En cours de décision (KAN-270)** | doublon de `connectAgentContext` (déjà utilisée) ; `selfManagedAgents` contourne le runtime |
| MCP Apps (`provideMCPApps`) | **Écarté** | décision du KAN-94 |
| Fils enrichis (`injectThreads`), mémoires (`injectMemories`), inspection avancée | **Hors périmètre** | exigent Intelligence (hébergé), exclu |

## Conclusion

Toutes les fonctions gratuites utiles à un agent au niveau de la page sont utilisées. Les trois lacunes assumées sont les outils côté
navigateur, les surfaces latérales de la bibliothèque et l'interface sans chat ; elles se rouvrent avec KAN-101 et KAN-102, pas avant.
