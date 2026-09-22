// Les chemins proxifiés (/employees, /functions, /chantiers) recoupent les routes Angular
// (ex. /employees liste, /employees/:id détail). `bypass` laisse le serveur de dev Angular
// servir la navigation de page (Accept: text/html) et ne proxifie vers le backend que les
// véritables appels API (JSON).
//
// BACKEND_URL : http://localhost:8080 en local (défaut), http://backend:8080 dans
// docker-compose (résolution par nom de service, voir docker-compose.yml à la racine).
const target = process.env.BACKEND_URL || 'http://localhost:8080';

const apiPaths = ['/employees', '/functions', '/chantiers', '/paie', '/auth', '/users', '/roles', '/permissions'];

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
