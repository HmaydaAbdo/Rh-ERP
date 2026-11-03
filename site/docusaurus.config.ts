import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// Exécuté par Node.js : pas d'API navigateur ici.

const config: Config = {
  title: 'Staport Intelligence',
  tagline: 'Documentation technique et fonctionnelle',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
    experimental_faster: {
      rspackBundler: true,
      swcJsLoader: true,
      swcJsMinimizer: true,
      swcHtmlMinimizer: true,
      lightningCssMinimizer: true,
      mdxCrossCompilerCache: true,
      ssgWorkerThreads: true,
    },
  },

  // Site statique servi chez nous (nginx), jamais public : voir docs/exploitation.
  url: 'https://docs.staport.local',
  baseUrl: '/',

  onBrokenLinks: 'throw',

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        // Recherche locale : index construit au build, aucun service externe.
        hashed: true,
        language: ['fr', 'en'],
        docsRouteBasePath: '/',
        indexBlog: false,
      },
    ],
  ],

  i18n: {
    defaultLocale: 'fr',
    locales: ['fr'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // La documentation est la page d'accueil : pas de préfixe /docs.
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      // Sombre par défaut comme l'application (DESIGN.md).
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Staport Intelligence',
      logo: {
        alt: 'Staport Intelligence',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Documentation',
        },
      ],
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'java', 'python', 'sql', 'yaml', 'docker'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
