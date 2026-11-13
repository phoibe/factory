# 402 · Pouvoir annuler « Jeter » sur une idée, comme « go »

> Demande [#402](https://github.com/phoibe/factory/issues/402) · 2026-11-13

**En une phrase** : sur une carte « Idées à trier », « Jeter » laisse 5 secondes pour se rattraper, comme « go ».

### Ce que j'ai décidé pour vous
- Pendant les 5 s, le bouton « Garder » de cette carte est grisé.
- Un petit message en bas de l'écran dit « L'idée part dans 5 s », puis « Jeter annulé » si vous annulez.

### Ce qui change
- Toucher « Jeter » ne fait plus partir la carte tout de suite : le bouton devient « Annuler (5 s) », puis « 4 s », « 3 s »… comme « go ».
- Toucher à nouveau ce bouton annule : la carte reste dans « Idées à trier », les deux boutons redeviennent normaux.
- Au bout des 5 s, la carte s'en va et l'idée est fermée, comme aujourd'hui.
- « Garder » reste immédiat, sans délai.

### Comment vérifier
1. Dans « Idées à trier », touchez « Jeter » : le bouton affiche « Annuler (5 s) » et décompte, « Garder » est grisé, le message « L'idée part dans 5 s » apparaît.
2. Touchez « Annuler » avant la fin : la carte reste, le message « Jeter annulé » apparaît, l'idée n'est pas fermée.
3. Touchez « Jeter » et attendez 5 s : la carte disparaît et l'idée est fermée.
4. Touchez « Garder » sur une autre idée : elle part tout de suite, comme avant.
