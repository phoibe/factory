# 580 · Sur téléphone, les messages d'erreur de l'onglet « Agent » sont cachés

> Demande [#580](https://github.com/phoibe/factory/issues/580) · 2026-11-24

**En une phrase** : dans l'onglet « Agent », les petits messages du bas de l'écran se voient enfin sur téléphone, et un message qui n'a pas pu partir reste dans la conversation avec la raison et deux boutons, « Renvoyer » et « Modifier », sur téléphone comme sur ordinateur.

### Ce que j'ai décidé pour vous
- Les autres petits messages (« Impossible de terminer la conversation », « Ne renvoyez pas votre message », « GitHub ne répond pas », « 4 images au plus par message »…) restent de petits messages temporaires, avec le même texte : ils deviennent simplement visibles sur téléphone.
- Quand la réponse est arrivée mais n'a pas pu être enregistrée, il n'y a pas de bouton « Renvoyer » : renvoyer ferait travailler l'agent deux fois. La note sous la réponse et le petit message « Ne renvoyez pas votre message » restent comme aujourd'hui.
- Pendant le nouvel essai, le message redevient un message normal en cours d'envoi ; si cela échoue encore, il reprend son état « Non envoyé » avec la nouvelle raison.
- Un message non envoyé ne vous bloque pas : vous pouvez écrire autre chose. Il reste tout en bas de la conversation tant que vous ne l'avez pas renvoyé ou repris.
- Il reste là si vous allez voir une autre conversation et revenez. Il n'est pas gardé si vous rechargez la page ou changez de projet (comme un brouillon aujourd'hui).
- Le rouge est toujours accompagné de mots (« Non envoyé »), et les deux boutons sont discrets, assez grands pour le doigt.
- La note « Pas encore de réponse. Renvoyez votre message un peu plus tard. » (l'agent tarde, mais votre message est bien parti) ne change pas.
- Tant qu'une réponse de l'agent est en cours, « Renvoyer » est grisé : il redevient actif dès qu'elle est finie.
- Si vous touchez « Modifier » alors que vous avez déjà commencé à écrire autre chose, rien n'est effacé : le texte du message repris s'ajoute à la suite du vôtre, et ses images rejoignent celles déjà jointes (4 au plus en tout).
- Tout cela vaut dans les deux modes de la discussion (réponse instantanée et mode de secours).

### Le parcours

**1. Un petit message, sur téléphone**
- Vous êtes dans une conversation ouverte, sur téléphone. Quelque chose mérite un petit message (par exemple vous joignez une cinquième image, ou vous terminez la conversation).
- Le petit message s'affiche par-dessus la conversation, juste au-dessus de la zone de saisie, puis disparaît tout seul au bout de quelques secondes, comme sur ordinateur. Il ne recouvre jamais ce que vous êtes en train d'écrire.

**2. Un message qui ne part pas** (téléphone et ordinateur)
- Vous envoyez un message. La zone de saisie se vide et votre message apparaît dans la conversation, comme d'habitude.
- L'envoi échoue (plus de connexion, GitHub ne répond pas, l'agent n'arrive pas à répondre, la réponse est coupée…).
- Votre message garde sa place dans la conversation, avec ses images. Juste dessous, en rouge : « Non envoyé » (le message n'est pas parti) ou « L'agent n'a pas pu répondre » (il est parti, mais aucune réponse n'est revenue), suivi de la raison en une phrase. Puis deux boutons discrets : « Renvoyer » et « Modifier ».
- Cette explication reste affichée tant que vous n'avez rien fait : elle ne disparaît pas toute seule. La zone de saisie reste vide, le message n'y revient plus tout seul. Aucun petit message temporaire ne s'affiche plus pour ce cas.

**3. « Renvoyer »**
- Le message repart tel quel, avec ses images. La mention rouge et les boutons disparaissent, et l'attente habituelle s'affiche (« Réfléchit… »).
- Si cela marche, la conversation continue normalement. Si cela échoue encore, le message reprend son état « Non envoyé » avec la nouvelle raison.

**4. « Modifier »**
- Le message quitte la conversation et revient dans la zone de saisie, texte et images, avec le curseur dedans. Vous le corrigez puis l'envoyez, ou vous l'effacez si vous ne voulez plus l'envoyer.

### Règles et cas limites
- **Plusieurs messages non envoyés** : chacun garde sa mention et ses deux boutons, dans l'ordre où vous les avez écrits, tout en bas de la conversation.
- **Premier message d'une nouvelle conversation** : s'il ne part pas, il reste affiché dans cette nouvelle conversation, avec les mêmes boutons. La conversation n'apparaît dans la liste qu'une fois le message vraiment parti.
- **Jeton de lecture refusé** : l'écran de création du jeton s'affiche comme aujourd'hui, avec son explication. Une fois le nouveau jeton créé, vous retrouvez votre message « Non envoyé » avec « Renvoyer ».
- **Réponse arrivée mais non enregistrée** : ce n'est pas un message non envoyé. La réponse reste à l'écran avec sa note, sans bouton « Renvoyer ».
- **Changement de projet ou rechargement de la page** : les messages non envoyés sont oubliés. Ils ne sont enregistrés nulle part.
- **Lecteurs d'écran** : l'échec et sa raison sont annoncés, comme les petits messages aujourd'hui.
- **Apparence** : la mention suit le design du tableau de bord (rouge d'échec toujours avec des mots, boutons discrets, zones d'au moins 44 px sous le doigt), en clair comme en sombre. Le document de design sera complété avec ce nouvel état et la place des petits messages sur téléphone.

### Hors périmètre
- Garder un message non envoyé après un rechargement de la page ou un changement de projet.
- Un nouvel essai automatique : c'est toujours vous qui touchez « Renvoyer ».
- Changer le texte ou la durée des autres petits messages, ou leur place dans les autres onglets.
- La note « Pas encore de réponse » et la note sous une réponse non enregistrée.

### Comment vérifier sur la preview
1. **Sur téléphone**, ouvrez une conversation et joignez 5 images : le petit message « 4 images au plus par message » s'affiche au-dessus de la zone de saisie, puis disparaît.
2. **Sur téléphone**, touchez « Terminer » dans une conversation : le petit message « Conversation rangée dans « Terminées » » est visible.
3. **Sur téléphone**, passez en mode avion, puis envoyez un message : il reste dans la conversation avec « Non envoyé », la raison, « Renvoyer » et « Modifier ». La zone de saisie est vide. Attendez 30 secondes : l'explication est toujours là.
4. Coupez le mode avion et touchez « Renvoyer » : le message part et l'agent répond.
5. Refaites l'étape 3 avec un message accompagné d'une image, puis touchez « Modifier » : le texte et l'image reviennent dans la zone de saisie, et le message a disparu de la conversation.
6. Refaites l'étape 3, écrivez autre chose dans la zone de saisie, puis touchez « Modifier » : votre nouveau texte est toujours là, suivi du texte du message repris.
7. Avec un message non envoyé à l'écran, ouvrez une autre conversation puis revenez : il est toujours là. Rechargez la page : il a disparu.
8. **Sur ordinateur**, coupez la connexion puis envoyez un message : même affichage que sur téléphone (message dans la conversation, « Non envoyé », deux boutons), et plus de petit message temporaire pour ce cas.
9. Sur ordinateur, les petits messages des autres cas s'affichent comme avant.
