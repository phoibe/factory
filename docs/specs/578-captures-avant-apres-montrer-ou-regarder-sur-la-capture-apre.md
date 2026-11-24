# 578 · Captures avant/après : montrer où regarder sur la capture « après »

> Demande [#578](https://github.com/phoibe/factory/issues/578) · 2026-11-24

**En une phrase** : sur chaque image avant/après, des cadres rouges entourent ce qui a changé, côté « avant » comme côté « après », pour voir tout de suite où regarder.

### Ce que j'ai décidé pour vous

- Le cadre est rouge vif, épais, bordé d'un fin liseré blanc : il se voit sur fond clair comme sur fond sombre, même quand GitHub réduit l'image.
- C'est un simple contour, posé un peu à l'extérieur de la zone : rien n'est masqué ni assombri.
- Le moindre point différent compte, sans tolérance. Un changement minuscule reçoit un cadre d'une taille minimale, pour rester repérable.
- Les différences proches sont regroupées dans un même cadre, et il y a au plus 10 cadres de chaque côté : au-delà, les plus proches sont regroupés entre eux.
- Si presque tout l'écran a changé, pas de cadre géant : la mention « tout l'écran a changé » au-dessus de l'image « après ».
- Un nouvel écran (sans « avant ») n'a pas de cadre.
- Chaque image a ses propres cadres : ordinateur, téléphone, clair et sombre.
- Les cadres n'existent que sur l'image avant/après publiée dans la PR. Les captures elles-mêmes ne sont pas modifiées : celle de la page de présentation d'un projet reste sans cadre.
- Le message des captures gagne une phrase : « Les cadres rouges entourent ce qui a changé. »
- Rien ne change dans le choix des écrans montrés.
- Pas de « loupe » sur les zones changées dans cette demande.
- Dans la PR de cette demande, je vous montre des exemples réels d'images avec cadres, à valider comme des captures habituelles.

### Ce que vous verrez

**1. L'image avant/après**

Elle garde sa forme actuelle : « avant » à gauche, « après » à droite. S'y ajoutent les cadres rouges :

- **Quelque chose a été modifié sur place** (un texte, une couleur, une taille) : un cadre côté « après » et un cadre au même endroit côté « avant ». Vous comparez cadre à cadre.
- **Quelque chose a été ajouté** : un cadre côté « après » autour de ce qui est apparu. Rien côté « avant ».
- **Quelque chose a été retiré** : un cadre côté « avant » autour de ce qui a disparu. Rien côté « après ».
- **Ce qui a seulement été décalé n'est pas encadré** : quand un ajout ou un retrait pousse le reste de la page vers le bas ou le fait remonter, ce qui a simplement glissé sans changer ne reçoit aucun cadre. Seul l'endroit du changement est entouré.

**2. Le message des captures dans la PR**

Sous la phrase d'introduction habituelle, une phrase de plus : « Les cadres rouges entourent ce qui a changé. » Le reste du message ne change pas (liste des écrans identiques, écrans écartés avec leur raison).

**3. Dans la PR de cette demande**

Cette demande ne change aucun écran du tableau de bord : sa PR n'aurait normalement aucune capture. À la place, elle contiendra des exemples réels, fabriqués avec le nouvel outil à partir d'un vrai écran du tableau de bord modifié exprès pour la démonstration (ces modifications ne sont pas gardées) :

- un premier exemple avec trois changements sur le même écran : un texte modifié, un bloc ajouté qui pousse le reste de la page, et un élément retiré. Il est montré sur ordinateur et sur téléphone, en clair et en sombre ;
- un second exemple, sur ordinateur seulement, où tout l'écran change de couleurs, pour voir la mention « tout l'écran a changé ».

Ces exemples sont publiés comme les captures habituelles : vous répondrez « ok » si le rendu des cadres vous convient, ou vous direz ce qu'il faut retoucher (couleur, épaisseur, taille).

### Règles et cas limites

- **Tolérance** : aucune. Un seul point différent suffit pour avoir un cadre, comme aujourd'hui pour décider qu'un écran a changé.
- **Regroupement** : des différences proches les unes des autres (les lettres d'un mot, les lignes d'un même bloc) partagent un seul cadre. S'il y a plus de 10 cadres d'un côté, les plus proches sont réunis jusqu'à en avoir 10 au plus.
- **Taille minimale** : un changement minuscule (un point, un trait fin) reçoit un cadre assez grand pour être repéré sur l'image réduite par GitHub.
- **Bord de l'écran** : un changement collé au bord garde un cadre entier, jamais coupé.
- **Presque tout l'écran a changé** (les cadres couvriraient plus des trois quarts de l'écran environ) : aucun cadre sur cette image, et la mention « tout l'écran a changé » au-dessus de l'image « après ».
- **Décalage** : seul ce qui a glissé vers le bas ou vers le haut sans changer échappe au cadre. Ce qui a été décalé et modifié en même temps est encadré. Ce qui s'est déplacé sur le côté (à gauche ou à droite) est traité comme un changement et encadré.
- **Limite connue** : sur un écran en colonnes (un menu à côté du contenu), si une seule colonne glisse, le cadre peut être plus grand que nécessaire et couvrir toute cette colonne sous le changement.
- **Page plus longue ou plus courte qu'avant** : les deux images n'ont alors pas la même hauteur, comme aujourd'hui ; chaque côté porte ses propres cadres.
- **Nouvel écran** : le côté « avant » affiche toujours « nouvel écran », et le côté « après » n'a aucun cadre.
- **La phrase du message** n'apparaît que si au moins une image publiée porte des cadres. Pas de phrase si la PR ne montre que des nouveaux écrans, ou tant qu'un projet n'a pas encore reçu le nouvel outil.
- **Tous vos projets** : l'outil de captures est le même partout. Les cadres arrivent sur chaque projet après sa mise à jour habituelle par la factory.
- **Très petit changement** : le cadre dit où regarder ; pour voir le détail, il faut encore ouvrir l'image en grand.

### Hors périmètre

- Un agrandissement des zones changées (une « loupe ») à côté de l'image.
- Une tolérance « à quelques points près » dans la comparaison.
- Le choix des écrans montrés : un écran identique n'est toujours pas montré, et l'agent peut toujours écarter un écran où seule une heure diffère.
- Les captures elles-mêmes, la capture de la page de présentation d'un projet, et les variantes d'écran proposées pendant les questions : elles restent sans cadre.
- Les écrans du tableau de bord : aucun ne change.

### Comment vérifier

Dans la PR de cette demande, sur les exemples :

- Les cadres rouges se voient dès l'ouverture du message, sans ouvrir l'image en grand, sur ordinateur comme sur téléphone, en clair comme en sombre.
- Le texte modifié est entouré des deux côtés, au même endroit.
- Le bloc ajouté est entouré côté « après » seulement, et ce qui se trouve en dessous, simplement poussé vers le bas, n'a pas de cadre.
- L'élément retiré est entouré côté « avant » seulement.
- Rien n'est caché sous un cadre : on lit tout ce qui se trouve à l'intérieur et autour.
- Sur le second exemple, il n'y a aucun cadre, et la mention « tout l'écran a changé » se lit au-dessus de l'image « après ».

Après la mise en service, sur la prochaine demande qui change un écran (ici ou sur un autre projet mis à jour) :

- Les images avant/après portent des cadres rouges, et le message des captures contient la phrase « Les cadres rouges entourent ce qui a changé. »
- Un nouvel écran est montré sans cadre.
- La capture de la page de présentation du projet n'a pas de cadre.
