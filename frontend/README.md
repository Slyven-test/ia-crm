# Frontend – Interface React

L’interface web de **ia‑crm** est développée avec [React](https://react.dev/) et
[Vite](https://vitejs.dev/). Elle fournit aux utilisateurs des sociétés
inscrites (tenants) un accès sécurisé à leurs données, des outils pour
générer des recommandations et envoyer des campagnes d’e‑mails.

## Fonctionnalités

- **Connexion / Déconnexion** : les utilisateurs s’authentifient avec leur
  nom d’utilisateur et mot de passe. Le token JWT est stocké dans le
  navigateur.
- **Tableau de bord** : page d’accueil simple.
- **Recommandations** : possibilité de générer des recommandations pour
  l’ensemble des clients du tenant et d’afficher les recommandations pour
  un client particulier.
- **Campagnes** : création d’une campagne (nom, date de planification,
  identifiant de template) et déclenchement de l’envoi à tous les clients.

## Démarrer le frontend

Vous devez disposer de Node.js ≥ 18 et `npm` ou `yarn` installés. Depuis le
dossier `frontend/` :

```bash
npm install
npm run dev
```

Cela lance un serveur de développement Vite sur `http://localhost:3000`.
Les requêtes commençant par `/api` sont proxifiées vers `http://localhost:8000`
(voir `vite.config.ts`), ce qui permet de communiquer avec l’API FastAPI
pendant le développement.

Pour construire l’application de production :

```bash
npm run build
```

Les fichiers statiques sont générés dans `dist/`. Vous pouvez ensuite
servir ce dossier avec Nginx ou intégrer le build dans votre image Docker.

## Personnalisation

Le code source se trouve dans `src/`. Les pages sont définies dans
`src/pages/` et les composants communs dans `src/components/`. Vous pouvez
ajouter d’autres pages (ex. gestion des clients, import de fichiers) en
complétant le routeur dans `App.tsx` et en développant les services
correspondants dans l’API.