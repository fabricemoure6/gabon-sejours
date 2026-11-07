# Gabon Séjours : point d'étape (8 novembre 2026)

Dépôt : fabricemoure6/gabon-sejours (branche main), déployé par Cloudflare Workers à chaque envoi.
Dernier changement : en-tête sobre sans zigzags (thème noir/jaune style Binance, mode nuit par défaut, police IBM Plex Sans).

## Fait
- Recherche d'hébergements et maisons à louer, quartiers et zones de Libreville, carte.
- Comptes propriétaires, annonces avec photos, formules d'abonnement, paiement Airtel Money vérifié à la main.
- Admin : annonces, utilisateurs, paiements, abonnés, commentaires, messages, formules et prix, textes, structure et photos.
- J'aime et commentaires, page Contact, mode nuit/jour, couleurs par rubrique.

## À faire demain
1. Photos : ajouter les vraies photos du bandeau et des destinations (Admin > Textes, structure et photos).
2. Admin : créer le compte admin (/admin avec le code secret ADMIN_SETUP_CODE), régler les vrais prix et le numéro Airtel Money.
3. Paiement en ligne : choisir un service (E-Billing, SingPay, pawaPay…), brancher startOnlinePayment() et le webhook.
4. Vidéo de présentation : la refaire avec le nouveau thème.
5. Sécurité : limiter les essais de connexion, ajouter « mot de passe oublié ».
6. Option : passer en Workers Paid (5 $/mois) vers 300 Mo de photos ; vérifier la taille de la base dans le tableau de bord Cloudflare.
