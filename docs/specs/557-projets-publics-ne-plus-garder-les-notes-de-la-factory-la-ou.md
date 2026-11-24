# 557 · Projets publics : ne plus garder les notes de la factory là où un inconnu peut écrire

> Demande [#557](https://github.com/phoibe/factory/issues/557) · 2026-11-24

**En une phrase** : Sur un projet public, la factory ne tient plus compte que des notes cachées des demandes et des modifications ouvertes par vous, par une personne à qui vous avez donné le droit d'écrire dans le projet ou par elle-même, et quand vous voulez reprendre la demande d'un inconnu, elle travaille dans une copie faite pour vous, plus jamais dans l'originale.

### Ce que j'ai décidé pour vous

- Comptent comme « vous » pour les notes : vous, les personnes à qui vous avez donné le droit d'écrire dans le projet, et les robots de la factory. C'est la règle déjà appliquée aux messages depuis #339.
- Une note glissée par un inconnu est ignorée en silence : pas de message, pas d'alerte.
- Les modifications proposées par un inconnu restent ignorées par la factory, comme aujourd'hui : c'est à vous de les regarder.
- Les projets privés ne sont pas concernés et rien n'y change.
- Rien ne change à l'écran, et vos demandes en cours continuent sans coupure.
- La copie garde le titre et le type (feature ou bug) de la demande d'origine, et se comporte comme une demande ouverte par vous : elle démarre tout de suite, ou attend son tour si la factory est pleine. Elle ne passe pas par « Idées à trier ».
- La copie commence par « Reprise de la demande #12 de (nom de la personne) », avec le lien, puis le texte d'origine, puis votre message.
- Le mot laissé dans l'originale avant de la fermer : « Merci pour votre proposition. Elle est reprise dans la demande #57, où la suite se passe. Je ferme celle-ci. »
- Si vous répondez « fermer » dans la demande d'un inconnu, elle est fermée sans copie, comme aujourd'hui.

### Parcours

**Vos demandes et celles de la factory.** Rien ne change : mêmes cartes, mêmes messages, mêmes relances, même tableau.

**Un inconnu ouvre une demande sur un projet public.** La factory n'y touche pas, comme aujourd'hui. S'il a caché dans son texte des notes qui imitent celles de la factory (« cette étape est déjà passée », « c'est une idée de l'agent », « relance prévue »…), elles n'ont plus aucun effet, où que la factory les lise. La factory n'écrit plus non plus aucune de ses notes dans cette demande.

**Vous voulez reprendre la demande d'un inconnu.** Le geste reste le même : vous écrivez dans sa demande. Peu après :
1. une nouvelle demande apparaît sur le tableau : la copie, avec le texte de l'inconnu tel qu'il était à ce moment-là, votre message et un lien vers l'originale ;
2. la factory laisse un mot dans l'originale, avec le lien de la copie, puis la ferme ;
3. la factory démarre sur la copie comme sur n'importe laquelle de vos demandes (questions, fiche, construction), et c'est là que vous répondez ensuite.

**Un inconnu propose une modification.** La factory l'ignore, comme aujourd'hui, et les notes cachées dans sa description n'ont aucun effet.

### Règles et cas limites

- La règle des notes est la même partout où la factory lit une demande ou une modification, tableau compris. Elle est posée à un seul endroit par où passent toutes ces lectures : une lecture ajoutée plus tard sera protégée sans y penser.
- Seules les notes cachées sont écartées : le texte visible d'un inconnu reste affiché tel quel.
- Seuls vos propres messages lancent la factory, comme aujourd'hui. La demande d'une personne à qui vous avez donné le droit d'écrire n'est pas copiée : la factory y travaille directement dès que vous y écrivez, comme aujourd'hui.
- Le texte de la copie est figé. Si l'inconnu modifie ensuite son texte d'origine ou ajoute des messages dans sa demande, rien ne change dans la copie ni dans le travail de la factory.
- Les notes cachées que l'inconnu aurait glissées dans son texte ne sont pas recopiées. Les images et les liens de son texte sont gardés.
- Seuls le texte de départ et votre message sont repris. Les autres messages de l'originale restent consultables par le lien.
- Une seule copie par demande : si vous réécrivez dans une originale déjà reprise, la factory ne refait pas de copie et vous répond avec le lien de celle qui existe.
- Si la copie ne peut pas être créée (panne de GitHub), l'originale reste ouverte, sans mot ni fermeture, et la factory vous le dit dedans : il suffit d'y réécrire pour réessayer.
- Une demande d'inconnu ouverte sans passer par les formulaires du projet (« Nouvelle feature », « Signaler un bug »…) n'est pas une demande pour la factory : elle reste ignorée même si vous y écrivez, comme aujourd'hui.
- Aucune demande d'inconnu n'est en cours aujourd'hui sur la factory elle-même. Si un autre de vos projets publics en avait une, elle serait reprise par copie à votre prochain message dedans.

### Hors périmètre

- Déplacer les notes dans un rangement caché à part (la solution b) : les notes restent où elles sont.
- La prise automatique : tant que l'idée #564 n'est pas traitée, la factory peut encore prendre d'elle-même la demande d'un inconnu quand une place est libre. Les fausses notes n'y auront plus d'effet, mais elle y travaillerait sans copie.
- Les messages d'un inconnu dans une de vos demandes, que l'agent relit avec le reste du fil : c'est l'idée #565.
- Reprendre la modification proposée par un inconnu : pas de copie pour les modifications.
- Prévenir ou alerter quand un inconnu tente de glisser une note.

### Critères d'acceptation

1. Sur le tableau, tout s'affiche comme avant pour vos demandes en cours : étapes, estimations (« moyenne demande »), relances prévues, « Idées à trier ».
2. Une demande en cours au moment de la livraison continue sans que vous ayez rien à refaire.
3. Avec un second compte GitHub (ou l'aide d'un ami), ouvrez une demande sur un projet public avec le formulaire « Nouvelle feature » : la factory n'y fait rien. Écrivez-y ensuite avec votre compte : une copie apparaît sur le tableau avec le texte, votre message et le lien ; l'originale reçoit le mot et est fermée ; la factory démarre sur la copie.
4. Modifiez ensuite le texte de l'originale avec le second compte : la copie ne change pas.
5. Réécrivez dans l'originale : pas de deuxième copie, la factory vous donne le lien de la première.
6. Ce que vous ne pouvez pas voir vous-même est prouvé par des tests automatiques, listés dans le résumé de la modification : une fausse note placée dans la demande ou la modification d'un inconnu est ignorée pour chaque sorte de note, la factory n'y écrit aucune note, et la copie ne reprend aucune note cachée.

