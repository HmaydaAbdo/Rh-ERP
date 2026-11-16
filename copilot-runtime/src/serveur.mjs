// Point d'entrée du runtime CopilotKit de l'assistant RH : lit la configuration et écoute (application : app.mjs).
import { creerApp } from './app.mjs';

const port = Number(process.env.PORT ?? 4100);

function obligatoire(nom) {
  const valeur = process.env[nom];
  if (!valeur) {
    throw new Error(`${nom} est obligatoire`);
  }
  return valeur;
}

const { app, purger } = creerApp({
  urlAgent: obligatoire('IA_AGUI_URL'),
  urlApi: obligatoire('ERP_API_URL').replace(/\/$/, ''),
  cheminBase: process.env.THREADS_DB_PATH,
  // Vues libres (KAN-95) : désactivées tant que VUES_LIBRES n'est pas « true ».
  vuesLibres: process.env.VUES_LIBRES === 'true',
  // Dictée (KAN-93) : Whisper local compatible OpenAI ; absent, le micro n'est pas proposé.
  stt: process.env.STT_URL
    ? { url: process.env.STT_URL.replace(/\/$/, ''), modele: process.env.STT_MODELE ?? 'Systran/faster-whisper-small', langue: process.env.STT_LANGUE ?? 'fr' }
    : undefined
});
// Expiration des conversations inactives (KAN-82), au démarrage puis chaque jour ; même durée que la mémoire du service IA.
const joursConservation = Number(process.env.CONVERSATION_JOURS ?? 30);
if (purger && joursConservation > 0) {
  const lancer = () => {
    try {
      const supprimees = purger(joursConservation);
      if (supprimees) {
        console.log(`Conversations inactives supprimées : ${supprimees}`);
      }
    } catch (panne) {
      console.error(`Purge des conversations en échec : ${panne instanceof Error ? panne.name : 'inconnue'}`);
    }
  };
  lancer();
  setInterval(lancer, 24 * 3600 * 1000).unref();
}
app.listen(port, () => console.log(`Runtime CopilotKit à l'écoute sur le port ${port}`));
