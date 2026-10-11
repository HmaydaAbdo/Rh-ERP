// Les chemins proxifiés (/employees, /functions, /chantiers, /equipes, /paie) recoupent les routes Angular
// (ex. /employees liste, /employees/:id détail). `bypass` laisse le serveur de dev Angular
// servir la navigation de page (Accept: text/html) et ne proxifie vers le backend que les
// véritables appels API (JSON).
// `/parametres` ne recoupe pas de route Angular ; ses appels sont relayés directement vers le backend.
//
// En développement, BACKEND_URL vise le port hôte publié par Compose (`BACKEND_PORT`, 5001 dans .env).
// Le proxy de production est nginx.conf et utilise le réseau Docker interne : il ne lit pas ce fichier.
const target = process.env.BACKEND_URL || 'http://localhost:5001';

const apiPaths = ['/employees', '/functions', '/chantiers', '/equipes', '/paie', '/parametres', '/auth', '/users', '/roles', '/permissions', '/logs'];

module.exports = apiPaths.map((path) => ({
  context: [path],
  target,
  secure: false,
  bypass: (req) => {
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return '/index.html';
    }
    return null;
  }
}));
