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

const { app } = creerApp({
  urlAgent: obligatoire('IA_AGUI_URL'),
  urlApi: obligatoire('ERP_API_URL').replace(/\/$/, ''),
  cheminBase: process.env.THREADS_DB_PATH
});
app.listen(port, () => console.log(`Runtime CopilotKit à l'écoute sur le port ${port}`));
