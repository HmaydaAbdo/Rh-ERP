// Propriété des fils (KAN-79). Sans CopilotKit Intelligence, rien ne lie un fil à un utilisateur : la règle officielle
// est une table (thread_id, user_id) écrite à la création du fil et vérifiée sur toute route qui le porte.
import Database from 'better-sqlite3';

/** Ouvre la table de propriété ; `chemin` absent donne une table en mémoire (développement, tests). */
export function ouvrirProprietaires(chemin) {
  const base = new Database(chemin ?? ':memory:');
  base.exec(`
    CREATE TABLE IF NOT EXISTS thread_owners (thread_id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS thread_owners_user ON thread_owners (user_id);
  `);
  const inserer = base.prepare('INSERT OR IGNORE INTO thread_owners (thread_id, user_id) VALUES (?, ?)');
  const lire = base.prepare('SELECT user_id FROM thread_owners WHERE thread_id = ?');
  return {
    /** Réserve le fil au premier utilisateur qui le porte ; vrai seulement si `utilisateur` en est le propriétaire. */
    reserver(fil, utilisateur) {
      inserer.run(fil, String(utilisateur));
      return lire.get(fil)?.user_id === String(utilisateur);
    },
    /** Vrai si le fil est connu et appartient à `utilisateur` (routes qui ne créent jamais un fil). */
    possede(fil, utilisateur) {
      return lire.get(fil)?.user_id === String(utilisateur);
    },
    fermer: () => base.close()
  };
}
