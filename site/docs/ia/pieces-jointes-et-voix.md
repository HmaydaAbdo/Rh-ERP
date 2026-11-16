---
title: Pièces jointes et dictée vocale
sidebar_position: 11
---

# Pièces jointes et dictée vocale

Cadre et prototype de KAN-93 (épopée E12), décision Q11 revue le 2026-11-16 : le propriétaire demande les deux, au meilleur de ce qui est livrable sans coût, et la voix doit tourner sans service payant. Les deux capacités sont **fermées par défaut** et s'activent par configuration ; la discussion n'affiche un contrôle que si le serveur le permet.

## Dictée vocale

| Élément | Choix | Pourquoi |
|---|---|---|
| Micro et envoi | Contrôle officiel de `copilot-chat` : enregistre, envoie à `/transcribe` du runtime, insère le texte dans la saisie (modifiable avant envoi) | Aucun code d'interface maison |
| Transcription | `TranscriptionServiceOpenAI` de `@copilotkit/voice` (service officiel), pointé sur un serveur compatible OpenAI | Le runtime annonce `audioFileTranscriptionEnabled` : sans service configuré, le micro n'apparaît pas |
| Moteur | **Speaches** (faster-whisper) en conteneur `stt`, sur **CPU**, modèle `Systran/faster-whisper-small` par défaut | Gratuit, sans compte, bon en français ; l'audio ne quitte pas les serveurs (CNDP) |
| Version | `0.8.3-cpu`, dernière version stable ; `0.9.0-rc.3` est une préversion | Règle de la dernière version stable ; à réévaluer à la sortie de la 0.9 |
| Réseau | `stt-net` : runtime et `stt` seulement ; navigateur → nginx → runtime (authentifié, droit `IA_UTILISER`) | Le moteur n'est jamais exposé |
| Coût et délais | 1 à 2 Go de RAM, quelques secondes par phrase sur CPU ; modèle ~0,5 Go téléchargé une fois | `base` est plus léger mais moins précis ; `medium` demande plus de CPU |

Variables : `STT_URL` (vide : pas de micro), `STT_MODELE`, `STT_IMAGE_TAG`. Un fournisseur gratuit en ligne (par exemple Groq) fonctionnerait avec la même configuration, mais l'audio partirait chez un tiers à l'étranger : écarté tant qu'aucun accord CNDP ne le couvre.

Limites assumées : la dictée est du texte inséré dans la saisie, pas une conversation vocale en temps réel ; la voix reste donc soumise aux mêmes contrôles que le clavier.

## Pièces jointes

| Élément | Choix |
|---|---|
| Composant | Option officielle `attachments` de `copilot-chat` (sélecteur, glisser-déposer, collage, aperçus) |
| Activation | `IA_PIECES_JOINTES=true` côté service IA ; la discussion lit `GET /ia/capacites` et n'affiche « Ajouter un fichier » que si c'est vrai |
| Types | Images (PNG, JPEG, WebP, GIF), PDF, texte brut, CSV. Ni SVG, ni archive, ni audio, ni vidéo, ni HTML |
| Limites | 10 Mo par fichier, 3 fichiers et 12 Mo au plus par message |
| Contrôle serveur | `verifier_pieces_jointes` revérifie type, nombre et taille avant tout modèle (422 sinon) : le filtre du navigateur n'est qu'un confort |
| Données en ligne | Seules les données base64 sont admises, jamais une URL ni un identifiant de fichier : le serveur ne va rien chercher (pas de SSRF) |
| Lecture | `ag-ui-langgraph` convertit en blocs de contenu LangChain ; le modèle de la passerelle doit être multimodal (les modèles Gemini et Gemma de la passerelle le sont) |
| Transport | nginx admet 32 Mo sur `/run` ; la dictée 10 Mo sur `/transcribe` |

### Conditions avant d'activer en production

- **Consentement et données RH** : un document joint peut contenir des données personnelles ; il part vers le modèle de la passerelle comme le texte. L'utilisateur doit en être informé, et l'accord CNDP couvre ce traitement.
- **Conservation** : les pièces jointes vivent dans le fil (point de reprise PostgreSQL) et suivent sa durée de conservation et sa suppression (`IA_CONVERSATION_JOURS`). Elles ne sont jamais écrites dans l'espace de fichiers. Le protocole renvoie tout l'historique à chaque question : un fil riche en fichiers grossit vite, à surveiller.
- **Antivirus** : non fourni dans ce prototype. Les types admis excluent les formats exécutables, mais un PDF malveillant reste possible : prévoir un scan (ClamAV) avant ouverture à tous.
- **Preuve de contenu** : le type déclaré par le navigateur est vérifié, pas le contenu réel (signature du fichier) ; à ajouter avec l'antivirus.
- **Modèle** : le repli du modèle (`IA_LLM_REPLI`) doit rester multimodal, sinon une pièce jointe peut échouer sur le modèle de secours.

### Preuves

Tests du service IA (refus tant que désactivé ; acceptation d'une image ; SVG, ZIP, audio, vidéo et URL refusés ; fichier trop gros, trop de pièces, total trop lourd ; route des capacités), du runtime (capacité annoncée seulement avec un service de transcription ; 401 et 403 avant toute transcription ; transcription par le Whisper compatible OpenAI ; refus sans service), de l'interface (configuration des pièces jointes, repli fermé en cas de panne) et un parcours de bout en bout (bouton et micro absents par défaut, présents quand le serveur les active, sans violation d'accessibilité). Un essai avec un vrai modèle et un vrai micro reste à faire par le propriétaire.
