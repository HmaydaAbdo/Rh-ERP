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
| Moteur | **Speaches** (faster-whisper) en conteneur `stt`, sur **CPU**, modèle `Systran/faster-whisper-base` par défaut (le plus rapide) | Gratuit, sans compte, bon en français ; l'audio ne quitte pas les serveurs (CNDP) |
| Version | `0.8.3-cpu`, dernière version stable ; `0.9.0-rc.3` est une préversion | Règle de la dernière version stable ; à réévaluer à la sortie de la 0.9 |
| Réseau | `stt-net` : runtime et `stt` seulement ; navigateur → nginx → runtime (authentifié, droit `IA_UTILISER`) | Le moteur n'est jamais exposé |
| Coût et délais | 1 à 2 Go de RAM ; modèle `base` ~150 Mo téléchargé une fois | Mesure du 2026-11-17 (3 s de voix, 16 cœurs logiques, modèle chargé) : `base` 2,0 s avec 8 threads (2,6 s avec 4) ; `small` mesuré le 2026-11-18 : 5,6 s pour la même voix (base : 1,0 s), soit 5 à 6 fois plus lent, donc environ 55 s pour une dictée de 34 s : écarté sur CPU. Réglage `STT_CPU_THREADS` : ne pas dépasser les cœurs physiques (10 threads : 5,8 s, 16 : 7,5 s). Le modèle reste en mémoire (`TTL=-1`) et est préchargé au démarrage |
| Téléchargement du modèle | Service `stt-modele` : au démarrage, il appelle l'API d'installation de Speaches (`POST /v1/models/<modèle>`) puis s'arrête ; sans effet si le modèle est déjà dans le volume `stt_models` | Speaches 0.8.x ne précharge rien (le réglage `PRELOAD_MODELS` n'existe pas) : sans modèle, la transcription répondait 404 et le micro ne faisait rien. Le premier `up -d` prend quelques minutes |

Variables : `IA_PIECES_JOINTES` (false coupe les pièces jointes), `CLAMAV_IMAGE_TAG`, `STT_URL` (vide : pas de micro), `STT_MODELE`, `STT_LANGUE` (défaut `fr`), `STT_PROMPT` (vocabulaire du métier donné au modèle, défaut dans `copilot-runtime/src/serveur.mjs`), `STT_CPU_THREADS`, `STT_COMPUTE_TYPE`, `STT_IMAGE_TAG`. Un fournisseur gratuit en ligne (par exemple Groq) fonctionnerait avec la même configuration, mais l'audio partirait chez un tiers à l'étranger : écarté tant qu'aucun accord CNDP ne le couvre.

Limites assumées : la dictée est du texte inséré dans la saisie, pas une conversation vocale en temps réel ; la voix reste donc soumise aux mêmes contrôles que le clavier.

Qualité de la dictée à latence constante : le runtime passe au service officiel `TranscriptionServiceOpenAI` la langue, un vocabulaire du métier (`prompt` : Word, Excel, PowerPoint, chantier, paie) et `temperature: 0`, pour que « Word » ne devienne plus « worth » avec le modèle `base`. Le journal du runtime affiche `Error running agent: undefined` quand le navigateur annule une suggestion (requête `suggest` terminée en 499 au rechargement ou à l'envoi d'un message) : le service CopilotKit journalise une valeur `undefined` au lieu d'une `AbortError`. Sans effet sur la conversation ; reproduit le 2026-11-18, à signaler en amont.

## Pièces jointes

| Élément | Choix |
|---|---|
| Composant | Option officielle `attachments` de `copilot-chat` (sélecteur, glisser-déposer, collage, aperçus) |
| Activation | Active par défaut (`IA_PIECES_JOINTES=true`) ; la discussion lit `GET /ia/copilotkit/capacites` (relayé par le runtime) et n'affiche « Ajouter un fichier » que si le service les accepte, c'est-à-dire seulement si l'antivirus est joignable |
| Types | Images (PNG, JPEG, WebP, GIF), PDF, Word (`.docx`), Excel (`.xlsx`), PowerPoint (`.pptx`), texte brut, CSV, Markdown, JSON. Ni SVG, ni archive, ni audio, ni vidéo, ni HTML, ni anciens formats `.doc` et `.xls` |
| Limites | **500 Mo** par fichier (décision du propriétaire : un PDF de 500 pages, même scanné), 3 fichiers et 520 Mo au plus par message ; le même plafond dans le navigateur, le service IA, nginx (700 Mo, le base64 ajoute un tiers) et ClamAV (`StreamMaxLength` 520 Mo) |
| Contrôle 1 : déclaration | `verifier_pieces_jointes` revérifie type, nombre et taille avant tout modèle (422 sinon) : le filtre du navigateur n'est qu'un confort |
| Contrôle 2 : contenu réel | La signature des octets (`puremagic`) doit correspondre au type annoncé (un PDF déguisé en image, un exécutable déguisé en texte, du base64 invalide sont refusés) ; un texte doit être de l'UTF-8 sans octet nul ; un fichier Office doit être une archive saine (taille décompressée bornée à 2 Go, contre les bombes de décompression) |
| Contrôle 3 : antivirus | **ClamAV** (`clamd`, conteneur `antivirus`, client `aioclamd`, protocole `INSTREAM`) analyse chaque fichier ; signatures mises à jour seules. **Échec fermé** : démon absent, lent ou pas encore prêt, le fichier est refusé (503) |
| Données en ligne | Seules les données base64 sont admises, jamais une URL ni un identifiant de fichier : le serveur ne va rien chercher (pas de SSRF) |
| Historique | Le protocole renvoie tout l'historique à chaque question : un fichier déjà accepté n'est pas réanalysé (cache par empreinte, 256 entrées) |
| Lecture | **PDF, Word, Excel et PowerPoint sont convertis en texte** par le service IA (`documents.py`, MarkItDown, conversion locale) au moment d'appeler le modèle (middleware `LectureDocuments`) : le fil garde le fichier d'origine, que le navigateur affiche comme pièce jointe dans la bulle de l'utilisateur (et non son contenu converti), à l'envoi comme à la réouverture de la conversation ; l'API vérifie d'abord que le document se lit (422 sinon). Les fichiers **texte, CSV, Markdown et JSON** sont décodés tels quels. Pourquoi : la passerelle enchaîne des modèles qui ne lisent pas tous les blocs fichier (Mistral et GLM n'acceptent que du texte : un PDF envoyé tel quel échouait). Le texte est tronqué à 300 000 caractères (≈ 75 000 jetons) avec une mention visible ; le texte extrait est mis en cache par empreinte. Un PDF **sans texte** (scan) reste un bloc fichier : seuls les modèles qui lisent les images peuvent l'analyser. Les images restent des blocs image (modèle multimodal requis) |
| Transport | nginx admet 700 Mo sur `/run` ; la dictée 10 Mo sur `/transcribe`. L'antivirus attend jusqu'à 300 s par fichier |

### Conditions et limites

- **Consentement et données RH** : un document joint peut contenir des données personnelles ; il part vers le modèle de la passerelle comme le texte. L'utilisateur doit en être informé, et l'accord CNDP couvre ce traitement.
- **Conservation** : les pièces jointes vivent dans le fil (point de reprise PostgreSQL) et suivent sa durée de conservation et sa suppression (`IA_CONVERSATION_JOURS`). Elles ne sont jamais écrites dans l'espace de fichiers. Le protocole renvoie tout l'historique à chaque question : un fil riche en fichiers grossit vite, à surveiller.
- **Antivirus et contenu** : faits (voir ci-dessus). ClamAV demande environ 1 Go de RAM et télécharge ses signatures au premier démarrage (quelques minutes) : pendant ce temps, les pièces jointes sont refusées. Une menace inconnue des signatures reste possible, comme avec tout antivirus.
- **Mémoire** : un fichier de 500 Mo en base64 occupe plusieurs Go dans le service IA pendant l'analyse, et l'historique le renvoie à chaque question ; surveiller la mémoire du conteneur `ia`.
- **Lecture longue** : au-delà de 300 000 caractères, le modèle ne voit que le début. Lire un document entier, ou en chercher un passage précis, relève de la gestion documentaire (épopée E14, [étude](etude-gestion-documentaire.md)).
- **Modèle** : le repli du modèle (`IA_LLM_REPLI`) doit rester multimodal, sinon une pièce jointe peut échouer sur le modèle de secours.

### Preuves

Tests du service IA (refus si désactivé ; image, PDF et CSV réels acceptés ; fichier infecté bloqué ; antivirus absent ou indisponible : refus ; contenu qui ne correspond pas au type, octet nul, UTF-8 invalide, base64 invalide ; SVG, ZIP, audio, vidéo et URL refusés ; fichier trop gros, trop de pièces, total trop lourd ; cache des empreintes ; capacités), du runtime (capacité annoncée seulement avec un service de transcription ; 401 et 403 avant toute transcription ; transcription par le Whisper compatible OpenAI ; refus sans service), de l'interface (configuration des pièces jointes, repli fermé en cas de panne) et un parcours de bout en bout (bouton et micro absents par défaut, présents quand le serveur les active, sans violation d'accessibilité). Un essai avec un vrai modèle et un vrai micro reste à faire par le propriétaire.
