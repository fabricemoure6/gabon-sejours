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
3. Paiement en ligne SingPay : CODE BRANCHÉ (10 nov), à activer : créer le compte sur client.singpay.ga, puis dans Cloudflare (Settings > Variables) ajouter SINGPAY_CLIENT_ID, SINGPAY_CLIENT_SECRET (Secret), SINGPAY_WALLET, et en production SINGPAY_DISBURSEMENT. Dans SingPay, régler l'URL de callback du portefeuille sur https://<votre-site>/api/payments/singpay. Code aligné sur la documentation officielle SingPay (vérifié le 10 nov). Tester avec le portefeuille de test.
4. Vidéo de présentation : la refaire avec le nouveau thème.
5. ~~Sécurité~~ FAIT (10 nov) : 5 échecs/e-mail et 20/IP par 15 min, puis blocage ; « Mot de passe oublié » = message à l'admin, qui génère un lien à usage unique (1 h) dans Admin > Utilisateurs.
6. Option : passer en Workers Paid (5 $/mois) vers 300 Mo de photos ; vérifier la taille de la base dans le tableau de bord Cloudflare.
