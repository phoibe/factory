# 592 · « Agent » : revenir aussitôt à la connexion quand le jeton est refusé

> Demande [#592](https://github.com/phoibe/factory/issues/592) · 2026-11-25

**En une phrase** : dans l'onglet « Agent » en discussion en direct, un jeton complet refusé par GitHub vous ramène aussitôt à l'écran de connexion, comme partout ailleurs dans le tableau de bord.

### Ce que j'ai décidé pour vous

- Le retour à la connexion se fait avec le même message que d'habitude (« GitHub a refusé le jeton : il a sans doute expiré. Créez-en un nouveau et collez-le ici. »), et le projet ouvert reste retenu pour votre reconnexion, comme aujourd'hui.
- Les images d'une conversation dont le chargement est refusé pour la même raison vous ramènent aussi à la connexion, au lieu de s'afficher comme cassées.
- Rien ne change pour le jeton de lecture : s'il est refusé, l'onglet « Agent » continue de vous demander d'en créer un nouveau, sans vous déconnecter.

### Ce qui change

Aujourd'hui, en discussion en direct, quand GitHub refuse votre jeton complet (expiré ou supprimé), l'onglet « Agent » affiche « GitHub ne répond pas. Nouvel essai dans quelques secondes. » ou une liste de conversations vide, et il faut attendre la mise à jour suivante du « Suivi » pour revenir à la connexion. Désormais, le retour à l'écran de connexion est immédiat, dès la première lecture refusée, sans ce faux message.

### Comment vérifier

1. Sur un projet en discussion en direct, ouvrez l'onglet « Agent ».
2. Supprimez sur GitHub le jeton complet avec lequel vous êtes connecté.
3. Ouvrez une autre conversation dans la liste (ou attendez quelques secondes) : vous revenez aussitôt à l'écran de connexion avec le message « GitHub a refusé le jeton », sans voir « GitHub ne répond pas ».
4. Collez un nouveau jeton : le même projet se rouvre.
