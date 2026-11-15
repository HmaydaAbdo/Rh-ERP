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

/** Question posée par l'agent (`poser_question`, interruption de type `question`). */
export interface QuestionAgent {
  question: string;
  options: { label: string; description?: string }[];
  multiple?: boolean;
}

function charge(valeur: unknown): unknown {
  if (typeof valeur !== 'string') {
    return valeur;
  }
  try {
    return JSON.parse(valeur);
  } catch {
    return undefined;
  }
}

/** La question portée par l'interruption, ou `null` si la valeur est autre chose (accord d'écriture, valeur illisible). */
export function lireQuestion(valeur: unknown): QuestionAgent | null {
  const brut = charge(valeur) as Partial<QuestionAgent> & { type?: unknown } | null | undefined;
  if (brut?.type !== 'question' || typeof brut.question !== 'string' || !Array.isArray(brut.options)) {
    return null;
  }
  const options = brut.options.filter((o) => typeof o?.label === 'string');
  return options.length > 0 ? { question: brut.question, options, multiple: brut.multiple === true } : null;
}

/**
 * Les demandes d'écriture portées par l'interruption du service IA (`action_requests` du `HumanInTheLoopMiddleware`).
 * La valeur arrive en texte JSON par l'événement d'interruption AG-UI ; tout ce qui n'est pas une demande est ignoré.
 */
export function lireDemandes(valeur: unknown): DemandeEcriture[] {
  const actions = (charge(valeur) as { action_requests?: unknown } | null | undefined)?.action_requests;
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
