# 422 · Ne pas montrer en avant/après un écran qui n'a pas changé visuellement

> Demande [#422](https://github.com/phoibe/factory/issues/422) · 2026-11-15

**En une phrase** : un écran dont rien de visible n'a changé, en dehors de données qui bougent d'elles-mêmes (une heure, une date), n'est plus montré en avant/après dans la revue des captures.

### Ce que j'ai décidé pour vous

- L'agent n'écarte jamais un écran que la demande devait changer.
- Il n'écarte jamais un écran où la différence touche autre chose que ces données qui bougent seules (texte, mise en page, couleurs) ; au moindre doute, l'écran est montré.
- Une donnée que la demande change volontairement est toujours montrée.

### Ce qui change

1. **À la source** : pendant les captures, l'appli démarre elle aussi à une date et une heure fixes, les mêmes que celles déjà imposées au navigateur. Les données d'exemple fabriquées au démarrage portent donc la même heure avant et après : l'écran redevient identique et disparaît tout seul de la revue, comme aujourd'hui un écran inchangé.
2. **Le filet** : s'il reste une différence due uniquement à une donnée qui change d'elle-même (un tirage au hasard, une donnée venue d'internet…), l'agent a le droit d'écarter lui-même cet écran de la revue.
3. **La trace** : chaque écran écarté est cité en une ligne sous les captures, avec la raison. Exemple : « Écrans sans changement visible, non montrés : Screener · ordinateur et téléphone (seule l'heure du dernier passage diffère) ». Vous pouvez ainsi réclamer l'écran.
4. **Plus rien à montrer** : si tous les écrans qui différaient sont écartés, c'est comme quand rien n'a changé : pas de captures à valider, la demande passe directement aux contrôles automatiques puis à la suite habituelle. La ligne de trace reste dans le message.

### Hors périmètre

- Une tolérance automatique « à quelques points près » dans la comparaison des images : la comparaison reste exacte, seul l'agent écarte, avec une raison écrite.
- Les écrans réellement changés par la demande : ils sont montrés comme aujourd'hui.

### Comment vérifier

- Sur une prochaine demande d'un projet comme le Screener, l'écran dont seule l'heure du dernier passage changeait n'apparaît plus en avant/après.
- Si un écran est écarté par l'agent, une ligne sous les captures le cite avec la raison.
- Si tous les écrans qui différaient sont écartés, on ne vous demande pas de valider des captures, et la ligne de trace est bien là.
- Un écran que la demande modifie vraiment est toujours montré.
