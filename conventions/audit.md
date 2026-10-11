# Audit

Cette convention définit les exigences communes de traçabilité. Chaque application précise dans sa
documentation les événements concernés, les données conservées, les personnes autorisées à consulter
l'audit, la durée de conservation et les mécanismes techniques retenus.

## Finalité et périmètre

L'audit doit permettre de répondre, pour une action pertinente : qui l'a réalisée, quoi, quand, sur
quelle ressource ou quel périmètre, depuis quel contexte, et avec quel résultat. Il sert à établir
les faits et à soutenir l'investigation ; les journaux techniques servent au diagnostic et ne le
remplacent pas.

Chaque application classe ses opérations selon leur risque, les obligations applicables et les
besoins d'investigation. Elle trace au minimum les changements métier significatifs, les actions
privilégiées, les changements d'autorisations, les accès refusés pertinents, les exports ou
divulgations sensibles, ainsi que les opérations automatisées importantes. Les événements
d'authentification sont définis avec la convention de sécurité. Les lectures ordinaires ne sont
tracées que lorsqu'un besoin de sécurité, de conformité ou métier le justifie.

Les exigences légales, le catalogue d'événements, les ressources concernées et les règles de
consultation restent propres à chaque application. La documentation locale identifie les événements
à tracer et leurs champs, sans copier ici un catalogue métier.

## Contenu d'un événement

Un événement comporte, selon le cas :

* un identifiant et un horodatage non ambigu, en UTC ou avec un décalage explicite ;
* l'acteur : compte, service ou tâche système, identifié sans ambiguïté ;
* l'action, la ressource et son identifiant stable, ou le périmètre d'une opération collective ;
* le résultat (succès, refus, échec) et un motif catégorisé lorsque cela aide l'investigation ;
* un identifiant de corrélation pour relier les étapes d'une requête ou d'un workflow ;
* le contexte d'origine utile et autorisé par la politique de confidentialité.

Les noms d'actions et les catégories ont un vocabulaire stable, documenté et versionné. Ne pas
construire les codes d'action à partir de valeurs utilisateur. Une opération de masse produit une
trace décrivant son périmètre et son résultat, sans nécessiter un événement redondant par ligne si
les détails sont déjà conservés de façon sûre ailleurs.

## Intégrité et couverture

* Créer les événements dans un mécanisme commun afin d'éviter des formats, politiques ou contrôles
  divergents entre les modules.
* Une modification métier et la trace requise pour établir son succès doivent avoir une garantie de
  cohérence documentée. Choisir une atomicité transactionnelle ou un mécanisme durable équivalent ;
  ne pas annoncer une action réussie si sa trace obligatoire peut être perdue silencieusement.
* Les échecs et refus à conserver doivent rester traçables même lorsque l'opération métier est
  annulée. La stratégie de persistance et le comportement en cas d'indisponibilité de l'audit sont
  explicites pour chaque catégorie d'événement.
* Toute voie d'écriture doit respecter la politique d'audit : traitements en arrière-plan,
  opérations en masse, imports, migrations de données et accès directs aux stockages compris.
  Interdire les voies qui contournent l'audit ou leur associer une trace compensatoire vérifiable.
* Les traitements sans acteur humain identifient leur compte ou origine système, leur déclencheur
  et leur corrélation. Ne jamais attribuer artificiellement l'action à un utilisateur connecté.
* Ajouter des tests de couverture qui détectent les nouvelles opérations sensibles sans stratégie
  d'audit documentée. Vérifier aussi qu'une erreur de persistance ne produit pas une fausse trace de
  succès.

## Données sensibles et accès

* N'enregistrer jamais mots de passe, secrets, jetons, clés, données d'authentification brutes,
  contenu complet de fichiers ou payloads sensibles sans nécessité explicite et protections
  approuvées. Préférer une catégorie de résultat, un identifiant non secret ou une empreinte lorsque
  cela suffit.
* Réduire les données personnelles au minimum utile. Les adresses réseau, identifiants saisis et
  informations de contexte ne sont conservés que selon une finalité documentée et une durée
  déterminée.
* Restreindre la consultation à des permissions dédiées. Séparer les droits de lecture de l'audit
  des droits d'administration et d'export ; journaliser les consultations sensibles si le risque
  le justifie.
* Rendre les traces append-only pour l'application auditée, ou protéger leur intégrité par un
  mécanisme équivalent. Les API ordinaires ne permettent ni modification ni suppression silencieuse
  des événements.
* Définir une durée de conservation, une purge contrôlée, les sauvegardes et le traitement des
  demandes d'effacement selon les règles applicables. L'historique ne doit pas être conservé
  indéfiniment par défaut.
* Protéger les traces en transit et au repos, limiter leur accès opérationnel et alerter sur les
  pertes, retards ou échecs d'écriture qui compromettent la couverture.

## Vérification

Les tests et contrôles couvrent au minimum :

* l'acteur, l'action, la ressource, l'horodatage, la corrélation et le résultat attendus ;
* les succès, échecs et refus pertinents, y compris l'annulation de l'opération métier ;
* les opérations en masse, automatisées et les voies d'écriture hors requête ;
* l'absence de secrets et de données personnelles non nécessaires ;
* les autorisations de consultation et l'impossibilité d'altérer les traces par les API métier ;
* le comportement et les alertes en cas d'indisponibilité du mécanisme d'audit ;
* la conservation et la purge prévues par la politique de l'application.

Les identités et données utilisées pour les tests sont synthétiques. Les contrôles périodiques
vérifient que les événements requis sont effectivement produits et que les personnes autorisées
peuvent les retrouver.
