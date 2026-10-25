// Les chemins proxifiés (/employees, /functions, /chantiers, /equipes, /paie) recoupent les routes Angular
// (ex. /employees liste, /employees/:id détail). `bypass` laisse le serveur de dev Angular
// servir la navigation de page (Accept: text/html) et ne proxifie vers le backend que les
// véritables appels API (JSON).
// `/parametres` ne recoupe pas de route Angular ; ses appels sont relayés directement vers le backend.
//
// En développement, BACKEND_URL vise le port hôte publié par Compose (`BACKEND_PORT`, 5001 dans .env).
// Le proxy de production est nginx.conf et utilise le réseau Docker interne : il ne lit pas ce fichier.
const target = process.env.BACKEND_URL || 'http://localhost:5001';

// Assistant RH : /ia/* vers le service IA (port hôte publié par Compose, IA_PORT, 5003 par défaut). Même chemin qu'en production
// (nginx.conf) : le navigateur parle à sa propre origine, sans CORS. Flux SSE relayé tel quel.
const cibleIa = process.env.IA_URL || `http://localhost:${process.env.IA_PORT || lireDansEnv('IA_PORT') || '5003'}`;

const apiPaths = ['/employees', '/functions', '/chantiers', '/equipes', '/paie', '/parametres', '/auth', '/users', '/roles', '/permissions', '/logs'];

// Imagerie satellite de la carte : même relais que nginx.conf (carte-satellite.conf.template). La clé ArcGIS est ajoutée
// ici et n'arrive jamais au navigateur. Elle vient de l'environnement de `ng serve`, sinon du `.env` de docker-compose.yml
// (une seule clé pour les deux façons de lancer l'application). Obligatoire, sauf en CI : ses tests n'affichent pas l'imagerie.
const cleArcgis = process.env.ARCGIS_API_KEY || lireDansEnv('ARCGIS_API_KEY');
if (!cleArcgis && !process.env.CI) {
  throw new Error('ARCGIS_API_KEY est obligatoire : la mettre dans le .env racine (création pas à pas : docs/chantier/carte.md, « Clé ArcGIS »).');
}

/** Valeur d'une variable du `.env` racine, à côté de docker-compose.yml ; chaîne vide si le fichier ou la variable manque. */
function lireDansEnv(nom) {
  const fichier = require('node:path').resolve(__dirname, '..', '.env');
  const fs = require('node:fs');
  if (!fs.existsSync(fichier)) {
    return '';
  }
  const ligne = fs
    .readFileSync(fichier, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${nom}=`));
  return ligne ? ligne.slice(nom.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2') : '';
}

/**
 * Relais d'imagerie : `/carte/<relais>/{z}/{y}/{x}` vers les tuiles d'Esri. Le principal ajoute la clé ; le secours (tuiles
 * publiques, sans clé) n'est appelé par la carte que si le principal refuse.
 */
function relaisSatellite(relais, origine, chemin, jeton) {
  return {
    context: [`/carte/${relais}/`],
    target: origine,
    changeOrigin: true,
    // `rewrite` : option du proxy de Vite (serveur de développement d'Angular), qui ignore un `pathRewrite` en fonction.
    rewrite: (url) => {
      const tuile = new RegExp(`^/carte/${relais}/(\\d+)/(\\d+)/(\\d+)$`).exec(url);
      return tuile ? `${chemin}/${tuile[1]}/${tuile[2]}/${tuile[3]}${jeton}` : '/introuvable';
    }
  };
}

module.exports = [
  {
    context: ['/ia/'],
    target: cibleIa,
    changeOrigin: true,
    rewrite: (url) => url.replace(/^\/ia/, '')
  },
  relaisSatellite(
    'satellite',
    'https://ibasemaps-api.arcgis.com',
    '/arcgis/rest/services/World_Imagery/MapServer/tile',
    `?token=${encodeURIComponent(cleArcgis)}`
  ),
  relaisSatellite('satellite-secours', 'https://server.arcgisonline.com', '/ArcGIS/rest/services/World_Imagery/MapServer/tile', ''),
  ...apiPaths.map((path) => ({
    context: [path],
    target,
    secure: false,
    bypass: (req) => {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return '/index.html';
      }
      return null;
    }
  }))
];
