# 395 · Discussion avec l'agent : jeton dédié au lieu du jeton GitHub complet

> Demande [#395](https://github.com/phoibe/factory/issues/395) · 2026-11-13

**En une phrase** : le serveur de discussion de l'onglet « Agent » ne reçoit plus qu'un second jeton qui ne peut que lire vos projets ; votre jeton complet ne quitte plus votre navigateur.

### Ce que j'ai décidé pour vous
- Le second jeton dure un an et vaut pour tous vos projets, comme le premier.
- « Se déconnecter » oublie les deux jetons.
- Si GitHub refuse le jeton de lecture (expiré ou supprimé), l'onglet « Agent » vous le redemande avec la même carte.
- La fiche produit est mise à jour pour décrire le nouveau fonctionnement.
- Si la connexion coupe avant que la réponse de l'agent n'arrive, rien n'est enregistré ni créé : vous renvoyez simplement votre message (comme aujourd'hui en cas d'erreur).

### Parcours
**Première ouverture de l'onglet « Agent » après la mise à jour (ordinateur)**
1. À la place de la discussion, une carte explique en une phrase : la discussion utilise désormais un jeton qui ne peut que lire vos projets, pour que votre jeton complet ne quitte jamais votre navigateur.
2. Un bouton « Créer le jeton de lecture sur GitHub » ouvre GitHub avec la page déjà remplie (nom, durée d'un an, tous les dépôts, droits en lecture seule).
3. Vous collez le jeton dans la case et validez. Le panneau vérifie auprès de GitHub qu'il fonctionne et qu'il ne peut **pas** écrire ; sinon, un message clair vous le dit et la carte reste.
4. La discussion s'affiche, avec vos conversations précédentes, exactement comme avant.

**Discuter**
- Vous écrivez comme aujourd'hui. L'agent répond en direct comme aujourd'hui.
- Quand la réponse est terminée, c'est le panneau qui enregistre la conversation et qui crée les demandes (bug ou feature) proposées par l'agent ; les liens vers ces demandes apparaissent sous la réponse comme aujourd'hui.

**Téléphone**
- Le lien et le QR code « ouvrir sur le téléphone » emportent les deux jetons : rien à refaire sur le téléphone.
- Un téléphone déjà connecté avant la mise à jour affichera la même carte la première fois (ou il suffit de rescanner le QR code depuis l'ordinateur).

### Règles et cas limites
- Le jeton complet n'est **jamais** envoyé au serveur de discussion, même si le second jeton manque ou est refusé : pas de solution de secours.
- Un jeton collé qui peut écrire est refusé (« Ce jeton peut modifier vos projets : créez-en un en lecture seule avec le bouton ci-dessus »).
- Si l'enregistrement ou la création d'une demande échoue côté panneau, la réponse reste affichée avec la mention qu'elle n'a pas pu être enregistrée (ou qu'une demande n'a pas pu être créée), et le message n'est pas renvoyé automatiquement, pour ne jamais créer une demande en double.
- Le serveur refuse désormais toute écriture : il ne fait plus que vérifier que c'est bien vous, lire le projet et répondre.

### Hors périmètre
- Le reste du panneau (tableau, réglages, boutons) continue d'utiliser votre jeton complet, qui reste dans votre navigateur comme aujourd'hui.
- Pas de changement d'apparence de la discussion elle-même.

### Critères d'acceptation (à vérifier sur la preview)
1. En ouvrant l'onglet « Agent » sans second jeton, la carte s'affiche avec le bouton vers GitHub prérempli en lecture seule.
2. Coller votre jeton complet dans cette case est refusé avec un message clair.
3. Avec le jeton de lecture, une conversation fonctionne, est retrouvée après rechargement de la page, et une demande proposée par l'agent apparaît bien dans le tableau.
4. Le QR code ouvre sur le téléphone une discussion qui marche sans rien recoller.
5. Après « Se déconnecter », l'onglet « Agent » redemande les deux jetons.
6. La fiche produit dit que le serveur de discussion ne reçoit qu'un jeton de lecture.

Décision notée : la discussion utilise un jeton de lecture seule, sans secours avec le jeton complet.
