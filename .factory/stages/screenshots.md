# Sous-étape : captures avant/après

1. Liste les routes (URL) dont l'apparence change.
2. **Après** : lance l'appli de la branche (`npm run build && npm run start -- -p 3000`, ou `npm run dev`),
   puis `node .factory/scripts/shots.mjs capture --base-url http://localhost:3000 --routes /,/autre --out /tmp/shots/after`.
3. **Avant** : `git worktree add /tmp/before main`, installe, lance sur le port 3001, puis la même commande
   avec `--base-url http://localhost:3001 --out /tmp/shots/before`. Si `main` n'a pas encore d'appli, pas de « avant ».
4. `node .factory/scripts/shots.mjs publish --pr <numéro> --before /tmp/shots/before --after /tmp/shots/after > /tmp/shots.md`
   (sans `--before` s'il n'y en a pas). Le script pousse les images sur `claude/factory-assets` et écrit un tableau.
5. Commente la PR : `<!-- factory-agent -->`, une phrase par écran sur ce qui change visuellement, le tableau,
   puis « Réponds « ok » si ça te convient, ou dis-moi ce qu'il faut retoucher. »
