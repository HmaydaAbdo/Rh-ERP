---
name: staport-mcp-tool-review
description: Conçoit ou audite un outil MCP Staport selon son contrat, son identité, ses permissions, ses limites et ses effets d'audit.
---

# Revue d'outil MCP

1. Écrire l'objectif, le schéma d'entrée/sortie, le propriétaire métier et le mode lecture/écriture.
2. Réutiliser la façade de domaine/API ; aucun SQL libre, accès direct DB, shell ou filesystem.
3. Vérifier identité appelante, permission effective, validation, pagination, taille, timeout,
   rate limit, idempotence, audit et données minimisées.
4. Exiger confirmation humaine pour un effet sensible ; les retries ne doivent pas dupliquer l'effet.
5. Tester schéma valide/invalide, refus, injection, limites, timeout, répétition et corrélation.
6. Documenter les événements AG-UI visibles, l'explication et la procédure d'annulation si possible.
