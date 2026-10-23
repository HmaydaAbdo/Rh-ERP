# Intégrations, protocoles et transports

Cette convention guide le choix des interfaces entre composants et systèmes. Elle complète
[`architecture.md`](architecture.md), [`mcp.md`](mcp.md), [`agent-ui.md`](agent-ui.md) et
[`rag.md`](rag.md). Une technologie est retenue pour un besoin vérifiable ; aucune liste de
protocoles ne constitue un socle à installer intégralement.

## Distinguer les responsabilités

| Nature | Exemples | Responsabilité |
|---|---|---|
| Style d'API | REST | Ressources, opérations et contrat de l'application sur HTTP |
| Protocole applicatif | MCP, A2A, AG-UI, MQTT | Messages, rôles et échanges propres à un usage |
| RPC et contrat de service | gRPC, Protocol Buffers | Appels typés entre composants, modes unaires ou streaming |
| Canal de communication | SSE, WebSocket | Événements serveur vers client, ou échanges bidirectionnels |
| Transport réseau | TCP, UDP, QUIC | Acheminement et propriétés de communication ; HTTP/3 utilise QUIC |
| Méthode de recherche | RAG, recherche hybride, GraphRAG | Sélection de connaissances et ancrage des réponses |
| Contrôle de stockage | RLS PostgreSQL | Restriction des lignes accessibles sous une identité de base |

SSE n'est pas AG-UI ; RAG n'est pas un protocole réseau. Un transport rapide ne donne ni autorisation,
ni atomicité métier, ni garantie de traitement unique.

## Justifier le choix

Avant une nouvelle intégration, documenter dans le dossier de l'application :

1. Le scénario, son propriétaire, les données échangées et le résultat attendu.
2. Le comportement de référence et sa limite mesurée : latence, débit, reprise, lisibilité ou qualité.
3. Les options comparées, dont la réutilisation de l'API ou de la façade existante.
4. Le bénéfice attendu, les coûts de développement/exploitation, les licences et les ressources.
5. Les identités, droits, schémas/versionnements, erreurs, délais et conditions d'annulation/reprise.
6. Les critères d'acceptation définis avant l'essai, les preuves attendues et le retour arrière.
7. Le statut : proposé, accepté, expérimenté, livré ou retiré ; un prototype ne prouve pas la production.

Un composant transverse, une frontière de service ou un nouveau protocole structurant suit un ADR
validé selon [`architecture.md`](architecture.md). Les valeurs des seuils viennent du besoin mesuré,
jamais d'une hypothèse de l'agent.

## Choisir selon le scénario

| Besoin | Point de départ | Condition pour élargir |
|---|---|---|
| Écrans et opérations métier ordinaires | REST/HTTP existant | Évolution de contrat motivée par un parcours réel |
| Agent vers outils et données autorisés | MCP avec transport standard compatible | Version protocole/SDK négociée et testée, catalogue borné |
| Interface vers agent | AG-UI, par exemple sur SSE | Entrées et annulation par le mécanisme HTTP du runtime ; SSE seul est unidirectionnel |
| Composants UI déclaratifs | A2UI avec catalogue autorisé | Besoin de rendu démontré, contrats et accessibilité vérifiés |
| Worker spécialisé distant | HTTP simple, puis comparaison gRPC | Gain mesuré sur OCR, inférence ou analytique ; contrat interservice justifié |
| Agents de systèmes distincts | A2A | Réelle délégation entre applications, identité et capacité du destinataire vérifiées |
| Voix ou échanges continus dans les deux sens | WebSocket si nécessaire | Besoin bidirectionnel, reconnexion, pression et annulation testées |
| Capteurs et télémétrie | Comparer HTTP/MQTT/UDP selon le matériel | Fréquence, énergie, connectivité et pertes acceptables explicites |
| Traitement différé ou indexation | Tâche persistée et rejeu idempotent si requis | Outbox transactionnelle si émission après commit nécessaire ; bus distinct seulement sur preuve |

gRPC ne remplace pas les outils métier MCP lorsqu'un agent accède aux fonctions métier. Un worker
ne reçoit que les entrées autorisées et retourne un résultat technique ; le domaine conserve ses
règles et ses écritures. A2A ne sert pas à relier deux classes d'un même monolithe.

## Fiabilité et réseau

UDP brut est réservé aux scénarios où pertes, doublons et désordre sont acceptés ou traités
explicitement. Définir contrôle de congestion, taille des messages, débit, authentification et
protection contre le rejeu. Ne jamais utiliser un datagramme comme validation d'une écriture de
paie, d'une présence ou d'une opération exigeant un accusé métier durable.

MQTT offre des niveaux de livraison adaptés aux objets connectés ; les configurer avec sessions,
sécurité et rétention selon le besoin. Un niveau de livraison du protocole ne garantit pas à lui
seul une transaction métier exécutée une fois : consommateurs et commandes restent idempotents.
QUIC/HTTP/3 relève du chemin réseau et des proxies ; mesurer compatibilité et gain avant activation.
Ne pas réinventer un protocole applicatif au-dessus d'UDP pour remplacer une option standard adaptée.

Tout appel a des limites de taille, concurrence et durée. Les retries sont bornés et évitent de
répéter une écriture incertaine ; une annulation réseau n'annule pas une transaction déjà validée.
Les traitements durables explicitent état, propriétaire, expiration, résultat et reprise après crash.

## Autorisation et preuve

Authentifier chaque frontière et revérifier les droits au moment de l'exécution. Préserver acteur,
périmètre, projections de champs, confirmation et audit ; changer de transport ne contourne jamais
ces contrôles. Les identifiants de corrélation servent au suivi, sans devenir des autorisations.
RLS peut renforcer l'isolation d'un stockage dérivé ; vérifier rôles effectifs, propriétaire,
`BYPASSRLS`, contexte transactionnel et pool de connexions. Elle complète les contrôles applicatifs.

Tester contrat, versions incompatibles, droits négatifs, doublons, délais, surcharge, déconnexion,
annulation et reprise selon les propriétés promises. Mesurer le résultat métier et le coût total,
avec les règles de [`testing.md`](testing.md), [`logging.md`](logging.md) et [`audit.md`](audit.md).

## Références officielles consultées le 2026-10-23

- [gRPC : concepts et modes d'appel](https://grpc.io/docs/what-is-grpc/core-concepts/).
- [UDP : RFC 8085](https://www.rfc-editor.org/rfc/rfc8085) ; [HTTP/3 : RFC 9114](https://www.rfc-editor.org/rfc/rfc9114) ; [WebSocket : RFC 6455](https://www.rfc-editor.org/rfc/rfc6455).
- [MQTT 5 : livraison et sessions](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html).
- [MCP : transports de la spécification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) ; [AG-UI : responsabilités](https://docs.ag-ui.com/introduction) ; [A2A : spécification](https://a2a-protocol.org/latest/specification/).
- [PostgreSQL : sécurité par ligne](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

Ces références expliquent les capacités ; les versions effectivement adoptées et testées sont
inscrites dans les manifests et l'ADR de l'application au moment de l'implémentation.
