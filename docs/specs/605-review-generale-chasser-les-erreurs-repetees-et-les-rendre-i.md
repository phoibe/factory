# 605 · Review générale : chasser les erreurs répétées et les rendre impossibles

> Demande [#605](https://github.com/phoibe/factory/issues/605) · 2026-11-25

**En une phrase** : chaque review générale relit aussi l'historique récent du projet, repère les erreurs que les agents ont refaites au moins deux fois, et pose pour chacune une protection prouvée sur un vrai cas passé, suivie dans une liste « Pièges connus ».

### Ce que j'ai décidé pour vous

Tout ce que vous avez accepté dans les questions est repris dans les règles plus bas. En écrivant la spec, j'ai ajouté ces quelques choix :

- Dans les Réglages généraux, la phrase d'aide de « Relectures d'une review générale » devient : « Relit le code de chaque partie de l'appli et l'historique du projet pendant une review générale. La synthèse reste faite par « Revue ». »
- La demande créée par le bouton « Review générale » gagne cette ligne : « 3. Chasse aux erreurs répétées : relecture de l'historique récent, puis une protection prouvée pour chaque erreur revenue au moins deux fois. »
- Les 5 familles protégées par review comptent aussi celles qui ne reçoivent qu'une consigne écrite.
- Si une erreur revient alors qu'elle a déjà sa règle dans les « Pièges connus », sa protection est renforcée et prouvée sur ce nouveau cas. Elle passe avant les autres et compte parmi les 5.
- Seules les modifications fabriquées par la factory sont relues : sur un projet public, une modification proposée par un inconnu ne compte pas.
- Un projet qui a moins de 50 modifications livrées est relu en entier.
- Le résumé de la review donne le lien vers la liste « Pièges connus » du projet.

### Parcours

**1. Lancer une review générale.** Rien ne change à l'écran : même bouton « Review générale », même confirmation. La demande créée décrit maintenant trois parties : la passe design, la relecture de tout le code, puis la chasse aux erreurs répétées.

**2. Pendant la review.** La chasse vient après la relecture de tout le code et ses corrections, dans la même modification que le reste de la review :

1. **Lecture de l'historique.** Les modifications livrées depuis la review générale précédente sont relues, tranche par tranche : vos remarques sur les captures et en recette, les corrections demandées par la relecture, les bugs ouverts après une livraison et les retours en arrière.
2. **Regroupement en familles.** Les erreurs qui se ressemblent sont réunies. Une famille compte dès qu'elle est apparue au moins deux fois.
3. **Choix.** Au plus 5 familles sont protégées : celles qui sont revenues le plus souvent.
4. **Une protection par famille**, la plus solide possible, prouvée sur un vrai cas passé, avec un commit par famille.
5. **Mise à jour de la liste « Pièges connus »**, relue en entier.

**3. Ce que vous lisez à la fin.** Le résumé de la review gagne une partie « Erreurs répétées ». Pour chaque famille : l'erreur en une phrase simple, les modifications où elle est apparue (avec leurs liens), la protection posée, et le cas passé qu'elle aurait refusé. Par exemple (cas inventé) :

> **Un mot technique affiché à l'écran** : vu 3 fois (les trois modifications en lien). Protection : un contrôle automatique refuse ces mots dans les textes de l'appli et dit par quoi les remplacer. Preuve : rejoué sur la deuxième telle qu'elle était, il la refuse.

Viennent ensuite les familles laissées de côté, chacune avec sa raison, et le lien vers la liste « Pièges connus ». Si la chasse ne trouve rien, une phrase le dit et rien n'est créé.

**4. Les reviews suivantes.** Chaque review générale reprend la chasse là où la précédente s'est arrêtée : elle retrouve les familles laissées « à traiter à la prochaine review », et entretient la liste.

**5. Réglages généraux.** Le bloc « Modèles » garde ses cinq lignes. Seule la phrase d'aide de « Relectures d'une review générale » change, pour dire que ce réglage sert aussi à lire l'historique.

### Règles et cas limites

**Ce qui est relu**
- Tout ce qui a été livré depuis la review générale précédente, avec un minimum de 50 modifications et un maximum de 100. Pour la toute première chasse d'un projet : ses 100 dernières modifications.
- Sur un projet public, les messages des inconnus ne comptent jamais.

**Ce qui compte comme une erreur**
- Une correction demandée par la relecture, une de vos remarques sur les captures ou en recette, un bug ouvert après une livraison, un retour en arrière.
- Ne comptent pas : une erreur déjà arrêtée par un contrôle automatique existant (elle ne peut déjà plus être livrée), ni un simple changement d'avis de votre part.

**Quelles familles sont protégées**
- Au plus 5 par review : celles qui sont revenues le plus souvent. À égalité, celles qui vous ont le plus dérangé : vos remarques en recette et les bugs passent avant les remarques de relecture.
- Les autres sont listées dans le résumé, « à traiter à la prochaine review », sans rien poser pour elles.

**La protection**
- Dans cet ordre de préférence : changer la structure du code pour que l'erreur ne puisse plus s'écrire ; sinon un contrôle automatique dont le message dit quoi faire à la place ; sinon un test ; et seulement en dernier recours, pour ce qui relève du jugement, une consigne écrite.
- Si rendre l'erreur impossible demande de refaire une grande partie du code, la protection du cran en dessous est posée tout de suite (prouvée de la même façon), et le gros changement devient une idée à trier.
- Une famille par commit : la protection, la ligne de la liste et, s'il y en a, la correction du code d'aujourd'hui.
- Aucun test ni contrôle existant n'est jamais désactivé ou affaibli pour poser une protection.

**La preuve**
- La protection est rejouée sur le code tel qu'il était au moment de l'erreur : elle doit le refuser, et accepter le code d'aujourd'hui.
- Si elle trouve encore la même erreur ailleurs dans le code d'aujourd'hui, l'erreur est corrigée dans le même commit.
- Si aucun cas passé ne peut être rejoué, la protection n'est pas livrée et la famille est listée comme non protégée, avec la raison.
- Exception, la consigne écrite : elle ne peut rien refuser toute seule. Sa preuve est la liste des cas réels qu'elle vise (au moins deux, avec leurs liens), et elle est livrée quand même.

**La liste « Pièges connus »**
- Une ligne par règle : la règle, ce qui la fait respecter, les cas qui l'ont fait naître. Une règle tenue par une simple consigne est marquée « consigne seulement ».
- Elle est rangée avec les consignes que tous les agents lisent à chaque passage, et les mises à jour de la factory ne l'effacent pas.
- Elle n'est créée qu'à la première famille trouvée.
- Un projet qui a déjà sa liste (Pulsar Wheel) la garde, à sa place et dans son format : la chasse la complète au lieu d'en créer une seconde.
- Entretien, à chaque review générale : une règle dont l'erreur ne peut plus arriver est retirée ; une règle dont la protection a disparu la retrouve ; une règle « consigne seulement » est réexaminée pour voir si elle peut devenir un contrôle ou un test. Le résumé dit ce qui a été retiré ou remis.

**Erreur qui vient de la factory et non du projet** (une consigne de la factory mal suivie, par exemple)
- La review d'un projet ne peut pas la corriger : elle la signale dans le résumé. Elle se traite par une review générale de la factory elle-même.

**Moteurs, sans nouveau réglage**
- La lecture de l'historique suit votre réglage « Relectures d'une review générale » ; le regroupement en familles et la vérification des preuves suivent « Revue » ; l'écriture des protections suit « Écriture du code ».

**Durée et arrivée**
- Une review générale dure plus longtemps qu'aujourd'hui, surtout la première fois sur un projet. La durée annoncée au début de la review en tient compte.
- Sur chacun de vos projets, la chasse arrive avec la review générale qui suit sa mise à jour habituelle par la factory.

### Hors périmètre

- Un bouton pour lancer la chasse seule, en dehors d'une review générale.
- Afficher la liste « Pièges connus » dans le tableau de bord.
- Un sixième réglage de moteur, ou un réglage du nombre de familles ou de la profondeur de l'historique.
- Installer pstack : seule l'idée est reprise.
- Refaire une grande partie du code pendant la review : cela devient une idée à trier.
- Corriger depuis la review d'un projet une erreur qui vient de la factory.

### Comment vérifier

Sur la preview :
1. Ouvrez « Réglages généraux » : le bloc « Modèles » a toujours cinq lignes, et la phrase d'aide de « Relectures d'une review générale » parle maintenant aussi de l'historique du projet. Les moteurs choisis n'ont pas bougé.
2. Cliquez sur « Review générale » : la confirmation est la même qu'aujourd'hui. Annulez si vous ne voulez pas lancer de review.

Après la livraison, à la prochaine review générale de la factory :
3. La demande créée par le bouton décrit trois parties, dont « Chasse aux erreurs répétées ».
4. Le résumé de la review contient une partie « Erreurs répétées » : au plus 5 familles protégées, chacune avec au moins deux modifications en lien, sa protection et le cas passé qu'elle aurait refusé ; ou une phrase qui dit que rien n'a été trouvé.
5. Les familles laissées de côté y figurent avec leur raison.
6. Le lien « Pièges connus » ouvre une liste courte, avec une ligne par règle posée.
7. Le journal de la modification montre des lectures de l'historique sur le moteur de « Relectures d'une review générale ».

À la review générale suivante :
8. Les familles « à traiter à la prochaine review » sont reprises, et le résumé dit si une règle a été retirée de la liste.
