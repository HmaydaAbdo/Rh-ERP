/** Une écriture que l'agent demande à faire dans l'espace de l'utilisateur, à approuver avant son exécution. */
export interface DemandeEcriture {
  outil: string;
  chemin: string;
  contenu: string;
}

/** Réponse de reprise attendue par Deep Agents : une décision par demande, dans l'ordre. */
export interface DecisionsEcriture {
  decisions: ({ type: 'approve' } | { type: 'reject'; message: string })[];
}

interface ActionBrute {
  name?: unknown;
  args?: Record<string, unknown>;
}

/**
 * Les demandes d'écriture portées par l'interruption du service IA (`action_requests` du `HumanInTheLoopMiddleware`).
 * La valeur arrive en texte JSON par l'événement d'interruption AG-UI ; tout ce qui n'est pas une demande est ignoré.
 */
export function lireDemandes(valeur: unknown): DemandeEcriture[] {
  let charge: unknown = valeur;
  if (typeof charge === 'string') {
    try {
      charge = JSON.parse(charge);
    } catch {
      return [];
    }
  }
  const actions = (charge as { action_requests?: unknown } | null)?.action_requests;
  if (!Array.isArray(actions)) {
    return [];
  }
  return (actions as ActionBrute[]).flatMap((action) => {
    if (typeof action?.name !== 'string') {
      return [];
    }
    const args = action.args ?? {};
    return [
      {
        outil: action.name,
        chemin: String(args['file_path'] ?? ''),
        contenu: String(args['content'] ?? args['new_string'] ?? '')
      }
    ];
  });
}

export function decisions(demandes: readonly DemandeEcriture[], approuve: boolean): DecisionsEcriture {
  return {
    decisions: demandes.map(() =>
      approuve ? { type: 'approve' as const } : { type: 'reject' as const, message: 'Refusé par l’utilisateur.' }
    )
  };
}
