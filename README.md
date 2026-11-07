# Gabon Séjours

Site de recherche d'hébergements au Gabon (hôtels, appartements meublés, lodges) avec demande de réservation par WhatsApp.

## Lancer

```bash
npm install
npm start
```

Ouvrir http://localhost:3000

## Structure

- `server.js` : API Express (recherche, détail, demandes de réservation)
- `data/stays.json` : les hébergements (**exemples fictifs**, à remplacer par de vrais établissements)
- `data/requests.json` : demandes reçues (créé automatiquement)
- `public/` : pages web (liste et fiche)

## Quartiers et localisation

- `data/neighborhoods.json` : 4 zones (Centre et front de mer, Nord, Est et PK, Grand Libreville) et leurs quartiers, avec arrondissement et coordonnées.
- **Les coordonnées sont approximatives** (±1 km) et les arrondissements `null` ne sont pas confirmés : à vérifier avec une source officielle (mairie, cadastre) avant la mise en production.
- Chaque hébergement de Libreville référence un quartier via `"neighborhood": "<id>"` ; sa position, sa zone et sa distance au centre-ville en sont déduites.
- Hors Libreville, donnez `lat` et `lng` directement dans l'hébergement.
- Fonctions : filtre par quartier, tri « proche du centre-ville », bouton « Autour de moi » (géolocalisation du navigateur), carte OpenStreetMap (Leaflet, nécessite une connexion), liens Maps et itinéraire sur chaque fiche.

## Mobile

Les pages s'adaptent à la tablette et au téléphone : formulaire en colonne, bascule Liste/Carte, boutons de 44 px minimum, barre « Réserver » fixe en bas de la fiche.

## Ajouter un hébergement

Ajoutez un objet dans `data/stays.json`. Le champ `whatsapp` est le numéro de l'hébergeur au format international sans `+` (ex. `24106123456`).

## Mettre en ligne

Tout hébergeur Node.js convient (Render, Railway, un VPS). Variable `PORT` prise en charge.

## Pour aller plus loin

- Vraies photos et galerie
- Espace propriétaire pour gérer annonces et disponibilités
- Base de données (SQLite ou PostgreSQL) à la place des fichiers JSON
- Paiement mobile (Airtel Money, Moov Money) via un prestataire
- Protection de la lecture des demandes (authentification) avant mise en production

## Hébergement gratuit sur Cloudflare (Workers)

Le dossier contient une version Cloudflare de l'API : `src/worker.js` + `wrangler.jsonc` (les pages de `public/` sont servies telles quelles).

1. Cloudflare > Workers & Pages > Create > Import a repository (GitHub) > choisir ce dépôt.
2. Commande de build : laisser vide. Commande de déploiement : `npx wrangler deploy`.
3. Le site est publié sur `https://gabon-sejours.<votre-sous-domaine>.workers.dev`.
4. (Facultatif) Conserver les demandes : Storage & databases > D1 > créer une base, puis dans le Worker > Settings > Bindings > ajouter un binding D1 nommé `DB`. La table se crée automatiquement. Sans D1, les demandes partent uniquement par WhatsApp.

Test en local : `npx wrangler dev`. L'ancienne version Express (`npm start`) reste utilisable pour un hébergeur Node classique.

## Comptes, annonces, abonnements et administration (version Cloudflare)

Pages : `louer.html` (annonces), `annonce.html` (fiche), `compte.html` (espace propriétaire), `admin.html` (administration).

**Mise en service**
1. Déployez le dépôt sur Cloudflare (voir plus haut). La base D1 `gabon-sejours-db` est créée automatiquement (wrangler >= 4.45) et les tables se créent au premier appel.
2. Dans le Worker : Settings > Variables and Secrets > ajouter le secret **`ADMIN_SETUP_CODE`** (une phrase secrète longue de votre choix).
3. Ouvrez `/admin.html` : le bloc « Première installation » apparaît tant qu'aucun administrateur n'existe. Créez-le avec ce code.
4. Dans l'admin : onglet « Abonnements » (prix des formules, valeurs par défaut = exemples) et « Textes, structure et photos » (numéro Airtel Money, photo du bandeau, textes).

**Paiement des abonnements**
- Mode actuel : manuel. Le propriétaire paie sur votre numéro Airtel Money, saisit la référence reçue par SMS, puis vous confirmez dans l'admin (onglet Paiements). La formule est alors active 30 jours.
- Paiement en ligne (Airtel Money, carte) : brancher un prestataire dans `startOnlinePayment()` (`src/worker.js`) et adapter le webhook `POST /api/payments/webhook` (signature HMAC avec le secret `PAYMENT_WEBHOOK_SECRET`) au format du prestataire choisi. Cela suppose d'avoir un compte marchand chez lui.

**Photos** : réduites dans le navigateur (JPEG, 1280 px) puis stockées dans D1 (900 Ko max par photo, 8 par annonce). Pour un gros volume, passer à Cloudflare R2.

**Limites connues** : pas de limitation du nombre de tentatives de connexion ; une annonce déjà publiée reste visible si l'abonnement expire (seule la création d'annonces est limitée) ; pas de réinitialisation de mot de passe par e-mail.
