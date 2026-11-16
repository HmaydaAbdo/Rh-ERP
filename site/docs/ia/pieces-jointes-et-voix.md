---
title: Pièces jointes et dictée vocale
sidebar_position: 11
---

# Pièces jointes et dictée vocale

Cadre et livraison de KAN-93 (épopée E12), décision Q11 revue le 2026-11-16 : le propriétaire demande les deux, au meilleur de ce qui est livrable sans coût, la voix sans service payant, et l'activation par défaut. Les deux capacités sont **activées par défaut** dans la pile Docker (un `pull` puis `up` suffit) ; la discussion n'affiche un contrôle que si le serveur le permet, et chacune se coupe par une variable.

## Dictée vocale

| Élément | Choix | Pourquoi |
|---|---|---|
| Micro et envoi | Contrôle officiel de `copilot-chat` : enregistre, envoie à `/transcribe` du runtime, insère le texte dans la saisie (modifiable avant envoi) | Aucun code d'interface maison |
| Transcription | `TranscriptionServiceOpenAI` de `@copilotkit/voice` (service officiel), pointé sur un serveur compatible OpenAI | Le runtime annonce `audioFileTranscriptionEnabled` : sans service configuré, le micro n'apparaît pas |
| Moteur | **Speaches** (faster-whisper) en conteneur `stt`, sur **CPU**, modèle `Systran/faster-whisper-small` par défaut | Gratuit, sans compte, bon en français ; l'audio ne quitte pas les serveurs (CNDP) |
| Version | `0.8.3-cpu`, dernière version stable ; `0.9.0-rc.3` est une préversion | Règle de la dernière version stable ; à réévaluer à la sortie de la 0.9 |
| Réseau | `stt-net` : runtime et `stt` seulement ; navigateur → nginx → runtime (authentifié, droit `IA_UTILISER`) | Le moteur n'est jamais exposé |
| Coût et délais | 1 à 2 Go de RAM, quelques secondes par phrase sur CPU ; modèle ~0,5 Go téléchargé une fois | `base` est plus léger mais moins précis ; `medium` demande plus de CPU |

Variables : `IA_PIECES_JOINTES` (false coupe les pièces jointes), `CLAMAV_IMAGE_TAG`, `STT_URL` (vide : pas de micro), `STT_MODELE`, `STT_IMAGE_TAG`. Un fournisseur gratuit en ligne (par exemple Groq) fonctionnerait avec la même configuration, mais l'audio partirait chez un tiers à l'étranger : écarté tant qu'aucun accord CNDP ne le couvre.

Limites assumées : la dictée est du texte inséré dans la saisie, pas une conversation vocale en temps réel ; la voix reste donc soumise aux mêmes contrôles que le clavier.

## Pièces jointes

| Élément | Choix |
|---|---|
| Composant | Option officielle `attachments` de `copilot-chat` (sélecteur, glisser-déposer, collage, aperçus) |
| Activation | Active par défaut (`IA_PIECES_JOINTES=true`) ; la discussion lit `GET /ia/copilotkit/capacites` (relayé par le runtime) et n'affiche « Ajouter un fichier » que si le service les accepte, c'est-à-dire seulement si l'antivirus est joignable |
| Types | Images (PNG, JPEG, WebP, GIF), PDF, texte brut, CSV. Ni SVG, ni archive, ni audio, ni vidéo, ni HTML |
| Limites | 10 Mo par fichier, 3 fichiers et 12 Mo au plus par message |
| Contrôle 1 : déclaration | `verifier_pieces_jointes` revérifie type, nombre et taille avant tout modèle (422 sinon) : le filtre du navigateur n'est qu'un confort |
| Contrôle 2 : contenu réel | La signature des octets (`puremagic`) doit correspondre au type annoncé (un PDF déguisé en image, un exécutable déguisé en texte, du base64 invalide sont refusés) ; un texte doit être de l'UTF-8 sans octet nul |
| Contrôle 3 : antivirus | **ClamAV** (`clamd`, conteneur `antivirus`, client `aioclamd`, protocole `INSTREAM`) analyse chaque fichier ; signatures mises à jour seules. **Échec fermé** : démon absent, lent ou pas encore prêt, le fichier est refusé (503) |
| Données en ligne | Seules les données base64 sont admises, jamais une URL ni un identifiant de fichier : le serveur ne va rien chercher (pas de SSRF) |
| Historique | Le protocole renvoie tout l'historique à chaque question : un fichier déjà accepté n'est pas réanalysé (cache par empreinte, 256 entrées) |
| Lecture | `ag-ui-langgraph` convertit en blocs de contenu LangChain ; le modèle de la passerelle doit être multimodal (les modèles Gemini et Gemma de la passerelle le sont) |
| Transport | nginx admet 32 Mo sur `/run` ; la dictée 10 Mo sur `/transcribe` |

### Conditions et limites

- **Consentement et données RH** : un document joint peut contenir des données personnelles ; il part vers le modèle de la passerelle comme le texte. L'utilisateur doit en être informé, et l'accord CNDP couvre ce traitement.
- **Conservation** : les pièces jointes vivent dans le fil (point de reprise PostgreSQL) et suivent sa durée de conservation et sa suppression (`IA_CONVERSATION_JOURS`). Elles ne sont jamais écrites dans l'espace de fichiers. Le protocole renvoie tout l'historique à chaque question : un fil riche en fichiers grossit vite, à surveiller.
- **Antivirus et contenu** : faits (voir ci-dessus). ClamAV demande environ 1 Go de RAM et télécharge ses signatures au premier démarrage (quelques minutes) : pendant ce temps, les pièces jointes sont refusées. Une menace inconnue des signatures reste possible, comme avec tout antivirus.
- **Modèle** : le repli du modèle (`IA_LLM_REPLI`) doit rester multimodal, sinon une pièce jointe peut échouer sur le modèle de secours.

### Preuves

Tests du service IA (refus si désactivé ; image, PDF et CSV réels acceptés ; fichier infecté bloqué ; antivirus absent ou indisponible : refus ; contenu qui ne correspond pas au type, octet nul, UTF-8 invalide, base64 invalide ; SVG, ZIP, audio, vidéo et URL refusés ; fichier trop gros, trop de pièces, total trop lourd ; cache des empreintes ; capacités), du runtime (capacité annoncée seulement avec un service de transcription ; 401 et 403 avant toute transcription ; transcription par le Whisper compatible OpenAI ; refus sans service), de l'interface (configuration des pièces jointes, repli fermé en cas de panne) et un parcours de bout en bout (bouton et micro absents par défaut, présents quand le serveur les active, sans violation d'accessibilité). Un essai avec un vrai modèle et un vrai micro reste à faire par le propriétaire.
