// Les bibliothèques AG-UI (uuid, CopilotKit) importent `randomFillSync` du module `crypto` de Node pour tirer leurs
// identifiants ; le navigateur des tests n'a pas ce module. Cet équivalent utilise l'API Web Crypto, qui est la même que
// celle du build de production.
export const randomFillSync = <T extends ArrayBufferView<ArrayBuffer>>(octets: T): T => crypto.getRandomValues(octets);
export const randomUUID = (): string => crypto.randomUUID();
export default { randomFillSync, randomUUID };

// uuid importe aussi `createHash` (UUID v3/v5, jamais utilisés par ERP-RH) : une version non prise en charge, explicite.
export const createHash = (): never => {
  throw new Error('createHash n’est pas disponible dans le navigateur de test');
};
